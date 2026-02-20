const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');
const { notifyAccounting } = require('../shared/accounting-hook');

const app = express();
const PORT = process.env.PORT || 9153;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'checkout_flow', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'checkout_flow' }));
app.get('/readyz', (req, res) => res.json({ status: 'ok', service: 'checkout_flow', ready: true }));

// ══════════════════════════════════════════════════════════════════════
// CHECKOUT ENDPOINTS
// ══════════════════════════════════════════════════════════════════════

// Initialize checkout from cart
app.post('/checkout', (req, res) => {
  try {
    const { cart_id, customer_id, email, cart_items } = req.body;
    if (!cart_id) return res.status(400).json({ success: false, error: 'cart_id is required' });
    const id = uuidv4();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min
    run(`INSERT INTO checkout_sessions (id, cart_id, customer_id, email, expires_at) VALUES (?, ?, ?, ?, ?)`,
      [id, cart_id, customer_id || null, email || null, expiresAt]);

    // Snapshot cart items if provided
    if (cart_items && Array.isArray(cart_items)) {
      // Store as metadata (the checkout_sessions table doesn't have a snapshot column in lite,
      // but we can use the step field + we stored it inline)
    }

    const session = get('SELECT * FROM checkout_sessions WHERE id = ?', [id]);
    session.shipping_address = JSON.parse(session.shipping_address || '{}');
    session.billing_address = JSON.parse(session.billing_address || '{}');
    notifyAccounting('ecommerce', 'ecommerce.checkout.initiated', { session_id: id, cart_id });
    res.status(201).json({ success: true, data: session });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// List checkout sessions
app.get('/checkout', (req, res) => {
  try {
    const { customer_id, status, limit = 50 } = req.query;
    let sql = 'SELECT * FROM checkout_sessions WHERE 1=1';
    const params = [];
    if (customer_id) { sql += ' AND customer_id = ?'; params.push(customer_id); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    const sessions = query(sql, params);
    const parsed = sessions.map(s => ({
      ...s,
      shipping_address: JSON.parse(s.shipping_address || '{}'),
      billing_address: JSON.parse(s.billing_address || '{}')
    }));
    res.json({ success: true, data: parsed });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get checkout session
app.get('/checkout/:id', (req, res) => {
  try {
    const session = get('SELECT * FROM checkout_sessions WHERE id = ?', [req.params.id]);
    if (!session) return res.status(404).json({ success: false, error: 'Checkout session not found' });

    // Check expiry
    if (session.status === 'pending' && session.expires_at && new Date(session.expires_at) < new Date()) {
      run("UPDATE checkout_sessions SET status = 'expired', updated_at = datetime('now') WHERE id = ?", [req.params.id]);
      session.status = 'expired';
    }

    session.shipping_address = JSON.parse(session.shipping_address || '{}');
    session.billing_address = JSON.parse(session.billing_address || '{}');
    res.json({ success: true, data: session });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Step 1: Set address
app.post('/checkout/:id/address', (req, res) => {
  try {
    const session = get('SELECT * FROM checkout_sessions WHERE id = ?', [req.params.id]);
    if (!session) return res.status(404).json({ success: false, error: 'Checkout session not found' });
    if (session.status !== 'pending') return res.status(400).json({ success: false, error: 'Session is not active' });
    if (session.step !== 'address') return res.status(400).json({ success: false, error: 'Cannot set address at current step' });

    const { shipping_name, shipping_line1, shipping_line2, shipping_city, shipping_state, shipping_postal_code, shipping_country, shipping_phone, billing_same_as_shipping, billing_line1, billing_line2, billing_city, billing_state, billing_postal_code, billing_country } = req.body;
    if (!shipping_line1 || !shipping_city || !shipping_state || !shipping_postal_code || !shipping_country) {
      return res.status(400).json({ success: false, error: 'Shipping address fields are required' });
    }

    const shippingAddr = {
      name: shipping_name || null,
      line1: shipping_line1,
      line2: shipping_line2 || null,
      city: shipping_city,
      state: shipping_state,
      postal_code: shipping_postal_code,
      country: shipping_country,
      phone: shipping_phone || null
    };

    let billingAddr;
    if (billing_same_as_shipping === false) {
      billingAddr = {
        line1: billing_line1, line2: billing_line2 || null,
        city: billing_city, state: billing_state,
        postal_code: billing_postal_code, country: billing_country
      };
    } else {
      billingAddr = { ...shippingAddr };
    }

    run("UPDATE checkout_sessions SET shipping_address = ?, billing_address = ?, step = 'shipping', updated_at = datetime('now') WHERE id = ?",
      [JSON.stringify(shippingAddr), JSON.stringify(billingAddr), req.params.id]);

    const updated = get('SELECT * FROM checkout_sessions WHERE id = ?', [req.params.id]);
    updated.shipping_address = JSON.parse(updated.shipping_address || '{}');
    updated.billing_address = JSON.parse(updated.billing_address || '{}');
    res.json({ success: true, data: updated });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Step 2: Select shipping
app.post('/checkout/:id/shipping', (req, res) => {
  try {
    const session = get('SELECT * FROM checkout_sessions WHERE id = ?', [req.params.id]);
    if (!session) return res.status(404).json({ success: false, error: 'Checkout session not found' });
    if (session.status !== 'pending') return res.status(400).json({ success: false, error: 'Session is not active' });
    if (session.step !== 'shipping') return res.status(400).json({ success: false, error: 'Cannot set shipping at current step' });

    const { shipping_method, shipping_cost } = req.body;
    if (!shipping_method || shipping_cost == null) {
      return res.status(400).json({ success: false, error: 'shipping_method and shipping_cost are required' });
    }

    run("UPDATE checkout_sessions SET shipping_method = ?, shipping_cost = ?, step = 'payment', updated_at = datetime('now') WHERE id = ?",
      [shipping_method, shipping_cost, req.params.id]);

    const updated = get('SELECT * FROM checkout_sessions WHERE id = ?', [req.params.id]);
    updated.shipping_address = JSON.parse(updated.shipping_address || '{}');
    updated.billing_address = JSON.parse(updated.billing_address || '{}');
    res.json({ success: true, data: updated });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Step 3: Confirm payment
app.post('/checkout/:id/payment', (req, res) => {
  try {
    const session = get('SELECT * FROM checkout_sessions WHERE id = ?', [req.params.id]);
    if (!session) return res.status(404).json({ success: false, error: 'Checkout session not found' });
    if (session.status !== 'pending') return res.status(400).json({ success: false, error: 'Session is not active' });
    if (session.step !== 'payment') return res.status(400).json({ success: false, error: 'Cannot set payment at current step' });

    const { payment_method, payment_intent_id } = req.body;
    if (!payment_method) return res.status(400).json({ success: false, error: 'payment_method is required' });

    run("UPDATE checkout_sessions SET payment_method = ?, payment_intent_id = ?, step = 'confirm', updated_at = datetime('now') WHERE id = ?",
      [payment_method, payment_intent_id || null, req.params.id]);

    const updated = get('SELECT * FROM checkout_sessions WHERE id = ?', [req.params.id]);
    updated.shipping_address = JSON.parse(updated.shipping_address || '{}');
    updated.billing_address = JSON.parse(updated.billing_address || '{}');
    res.json({ success: true, data: updated });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Step 4: Place order (confirm)
app.post('/checkout/:id/confirm', (req, res) => {
  try {
    const session = get('SELECT * FROM checkout_sessions WHERE id = ?', [req.params.id]);
    if (!session) return res.status(404).json({ success: false, error: 'Checkout session not found' });
    if (session.status !== 'pending') return res.status(400).json({ success: false, error: 'Session is not active' });
    if (session.step !== 'confirm') return res.status(400).json({ success: false, error: 'Cannot confirm at current step' });

    // Validate completeness
    const shippingAddr = JSON.parse(session.shipping_address || '{}');
    if (!shippingAddr.line1) return res.status(400).json({ success: false, error: 'Shipping address is required' });
    if (!session.shipping_method) return res.status(400).json({ success: false, error: 'Shipping method is required' });
    if (!session.payment_method) return res.status(400).json({ success: false, error: 'Payment method is required' });

    // Create order
    const orderId = uuidv4();
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    // Get cart totals
    const cart = get('SELECT * FROM carts WHERE id = ?', [session.cart_id]);
    const cartItems = cart ? query('SELECT * FROM cart_items WHERE cart_id = ?', [session.cart_id]) : [];
    const subtotal = cart ? cart.subtotal : 0;
    const tax = cart ? cart.tax : 0;
    const total = subtotal + tax + (session.shipping_cost || 0) - (cart ? (cart.discount_amount || 0) : 0);

    run(`INSERT INTO orders (id, order_number, customer_id, customer_email, items, subtotal, discount_amount, shipping_cost, tax, total, currency, status, payment_status, shipping_address, billing_address, shipping_method)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'paid', ?, ?, ?)`,
      [orderId, orderNumber, session.customer_id, session.email,
       JSON.stringify(cartItems), subtotal, cart ? (cart.discount_amount || 0) : 0,
       session.shipping_cost || 0, tax, Math.max(total, 0), cart ? (cart.currency || 'USD') : 'USD',
       session.shipping_address, session.billing_address, session.shipping_method]);

    // Update checkout session
    run("UPDATE checkout_sessions SET status = 'completed', step = 'completed', updated_at = datetime('now') WHERE id = ?", [req.params.id]);

    // Mark cart as converted
    if (cart) {
      run("UPDATE carts SET status = 'converted', updated_at = datetime('now') WHERE id = ?", [session.cart_id]);
    }

    const updated = get('SELECT * FROM checkout_sessions WHERE id = ?', [req.params.id]);
    updated.shipping_address = JSON.parse(updated.shipping_address || '{}');
    updated.billing_address = JSON.parse(updated.billing_address || '{}');
    updated.order_id = orderId;
    updated.order_number = orderNumber;

    notifyAccounting('ecommerce', 'ecommerce.checkout.completed', {
      session_id: req.params.id, order_id: orderId, order_number: orderNumber,
      total: Math.max(total, 0), customer_id: session.customer_id
    });

    res.json({ success: true, data: updated });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Cancel checkout
app.post('/checkout/:id/cancel', (req, res) => {
  try {
    const session = get('SELECT * FROM checkout_sessions WHERE id = ?', [req.params.id]);
    if (!session) return res.status(404).json({ success: false, error: 'Checkout session not found' });
    if (session.status !== 'pending') return res.status(400).json({ success: false, error: 'Session is not active' });
    run("UPDATE checkout_sessions SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?", [req.params.id]);
    const updated = get('SELECT * FROM checkout_sessions WHERE id = ?', [req.params.id]);
    updated.shipping_address = JSON.parse(updated.shipping_address || '{}');
    updated.billing_address = JSON.parse(updated.billing_address || '{}');
    notifyAccounting('ecommerce', 'ecommerce.checkout.cancelled', { session_id: req.params.id });
    res.json({ success: true, data: updated });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// SPA fallback
app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'checkout_flow', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Checkout Flow Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
