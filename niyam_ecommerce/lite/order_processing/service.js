const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');
const { notifyAccounting } = require('../shared/accounting-hook');

const app = express();
const PORT = process.env.PORT || 9154;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'order_processing', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'order_processing' }));
app.get('/readyz', (req, res) => res.json({ status: 'ok', service: 'order_processing', ready: true }));

// ── Orders ──────────────────────────────────────────────────────────

// List orders with filters
app.get('/orders', (req, res) => {
  try {
    const { status, customer_id, payment_status, fulfillment_status, limit = 200 } = req.query;
    let sql = 'SELECT * FROM orders WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (customer_id) { sql += ' AND customer_id = ?'; params.push(customer_id); }
    if (payment_status) { sql += ' AND payment_status = ?'; params.push(payment_status); }
    if (fulfillment_status) { sql += ' AND fulfillment_status = ?'; params.push(fulfillment_status); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    const orders = query(sql, params);
    res.json({ success: true, data: orders });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get order by ID
app.get('/orders/:id', (req, res) => {
  try {
    const order = get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    const items = query('SELECT * FROM order_items WHERE order_id = ? ORDER BY rowid ASC', [req.params.id]);
    const fulfillments = query('SELECT * FROM fulfillments WHERE order_id = ? ORDER BY created_at DESC', [req.params.id]);
    const refunds = query('SELECT * FROM refunds WHERE order_id = ? ORDER BY created_at DESC', [req.params.id]);
    res.json({
      success: true,
      data: {
        ...order,
        items: JSON.parse(order.items || '[]'),
        line_items: items,
        fulfillments: fulfillments.map(f => ({ ...f, items: JSON.parse(f.items || '[]') })),
        refunds: refunds.map(r => ({ ...r, items: JSON.parse(r.items || '[]') }))
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Create order
app.post('/orders', (req, res) => {
  try {
    const { customer_id, customer_email, items, discount_amount = 0, shipping_cost = 0, tax = 0, shipping_address, billing_address, shipping_method, notes } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Items array is required' });
    }
    const id = uuidv4();
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const subtotal = items.reduce((sum, item) => sum + (item.quantity || 1) * (item.unit_price || 0), 0);
    const total = subtotal - (parseFloat(discount_amount) || 0) + (parseFloat(shipping_cost) || 0) + (parseFloat(tax) || 0);

    run(`INSERT INTO orders (id, order_number, customer_id, customer_email, items, subtotal, discount_amount, shipping_cost, tax, total, status, payment_status, fulfillment_status, shipping_address, billing_address, shipping_method, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'unpaid', 'unfulfilled', ?, ?, ?, ?)`,
      [id, orderNumber, customer_id, customer_email, JSON.stringify(items), subtotal, parseFloat(discount_amount) || 0, parseFloat(shipping_cost) || 0, parseFloat(tax) || 0, total, JSON.stringify(shipping_address || {}), JSON.stringify(billing_address || {}), shipping_method, notes]);

    // Insert order items
    for (const item of items) {
      const itemTotal = (item.quantity || 1) * (item.unit_price || 0);
      run(`INSERT INTO order_items (id, order_id, product_id, variant_id, sku, name, quantity, unit_price, total_price)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), id, item.product_id, item.variant_id, item.sku, item.name || 'Unknown Item', item.quantity || 1, item.unit_price || 0, itemTotal]);
    }

    res.status(201).json({ success: true, data: { id, order_number: orderNumber, subtotal, total, status: 'pending' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Update order status
app.patch('/orders/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${valid.join(', ')}` });

    const order = get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    if (order.status === 'cancelled' && status !== 'cancelled') return res.status(400).json({ success: false, error: 'Cannot change status of a cancelled order' });

    run('UPDATE orders SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [status, req.params.id]);

    if (status === 'confirmed') {
      notifyAccounting('ecommerce', 'ecommerce.sale.completed', { order_id: req.params.id, order_number: order.order_number, customer_id: order.customer_id, total: order.total, tax: order.tax });
    }

    res.json({ success: true, data: { id: req.params.id, status } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Fulfillments ────────────────────────────────────────────────────

// List fulfillments for an order
app.get('/fulfillments/order/:order_id', (req, res) => {
  try {
    const fulfillments = query('SELECT * FROM fulfillments WHERE order_id = ? ORDER BY created_at DESC', [req.params.order_id]);
    res.json({ success: true, data: fulfillments.map(f => ({ ...f, items: JSON.parse(f.items || '[]') })) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Create fulfillment
app.post('/fulfillments', (req, res) => {
  try {
    const { order_id, tracking_number, carrier, items, notes } = req.body;
    if (!order_id) return res.status(400).json({ success: false, error: 'order_id is required' });

    const order = get('SELECT * FROM orders WHERE id = ?', [order_id]);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    if (order.status === 'cancelled') return res.status(400).json({ success: false, error: 'Cannot fulfill a cancelled order' });

    const id = uuidv4();
    const trackingNum = tracking_number || `TRK-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const shippedAt = new Date().toISOString();

    run(`INSERT INTO fulfillments (id, order_id, tracking_number, carrier, items, status, shipped_at)
         VALUES (?, ?, ?, ?, ?, 'shipped', ?)`,
      [id, order_id, trackingNum, carrier, JSON.stringify(items || []), shippedAt]);

    // Update order fulfillment status
    run('UPDATE orders SET fulfillment_status = \'partial\', status = CASE WHEN status IN (\'confirmed\', \'processing\') THEN \'shipped\' ELSE status END, updated_at = datetime(\'now\') WHERE id = ?', [order_id]);

    res.status(201).json({ success: true, data: { id, order_id, tracking_number: trackingNum, carrier, status: 'shipped', shipped_at: shippedAt } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Update fulfillment status
app.patch('/fulfillments/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['pending', 'shipped', 'in_transit', 'delivered', 'cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${valid.join(', ')}` });

    const deliveredAt = status === 'delivered' ? new Date().toISOString() : null;
    if (deliveredAt) {
      run('UPDATE fulfillments SET status = ?, delivered_at = ? WHERE id = ?', [status, deliveredAt, req.params.id]);
    } else {
      run('UPDATE fulfillments SET status = ? WHERE id = ?', [status, req.params.id]);
    }

    res.json({ success: true, data: { id: req.params.id, status } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Refunds ─────────────────────────────────────────────────────────

// List refunds for an order
app.get('/refunds/order/:order_id', (req, res) => {
  try {
    const refunds = query('SELECT * FROM refunds WHERE order_id = ? ORDER BY created_at DESC', [req.params.order_id]);
    res.json({ success: true, data: refunds.map(r => ({ ...r, items: JSON.parse(r.items || '[]') })) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Create refund
app.post('/refunds', (req, res) => {
  try {
    const { order_id, amount, reason, items, notes } = req.body;
    if (!order_id || !amount || amount <= 0) return res.status(400).json({ success: false, error: 'order_id and positive amount are required' });

    const order = get('SELECT * FROM orders WHERE id = ?', [order_id]);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

    // Check max refundable
    const refundedRow = get('SELECT COALESCE(SUM(amount), 0) as total_refunded FROM refunds WHERE order_id = ? AND status != \'rejected\'', [order_id]);
    const totalRefunded = refundedRow ? refundedRow.total_refunded : 0;
    const maxRefundable = order.total - totalRefunded;
    if (amount > maxRefundable) return res.status(400).json({ success: false, error: `Refund amount exceeds maximum refundable: ${maxRefundable.toFixed(2)}` });

    const id = uuidv4();
    run(`INSERT INTO refunds (id, order_id, amount, reason, items, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
      [id, order_id, amount, reason, JSON.stringify(items || [])]);

    res.status(201).json({ success: true, data: { id, order_id, amount, status: 'pending' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Update refund status
app.patch('/refunds/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['pending', 'approved', 'processed', 'rejected'];
    if (!valid.includes(status)) return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${valid.join(', ')}` });

    const refundedAt = status === 'processed' ? new Date().toISOString() : null;
    if (refundedAt) {
      run('UPDATE refunds SET status = ?, refunded_at = ? WHERE id = ?', [status, refundedAt, req.params.id]);
    } else {
      run('UPDATE refunds SET status = ? WHERE id = ?', [status, req.params.id]);
    }

    if (status === 'processed') {
      const refund = get('SELECT * FROM refunds WHERE id = ?', [req.params.id]);
      if (refund) {
        notifyAccounting('ecommerce', 'ecommerce.order.refunded', { order_id: refund.order_id, refund_id: refund.id, amount: refund.amount, reason: refund.reason });
      }
    }

    res.json({ success: true, data: { id: req.params.id, status } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'order_processing', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Order Processing Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
