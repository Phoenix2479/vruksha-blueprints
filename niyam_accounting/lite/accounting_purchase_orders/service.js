/**
 * Purchase Orders - Lite Version (SQLite)
 * Port: 8901
 * Split from accounts_payable for clean separation
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');
const { sendCSV } = require('../shared/csv-generator');

const app = express();
const PORT = process.env.PORT || 8901;

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'accounting_purchase_orders', mode: 'lite' });
});

// =============================================================================
// PURCHASE ORDERS
// =============================================================================

app.get('/api/purchase-orders', (req, res) => {
  try {
    const { status, vendor_id, from_date, to_date } = req.query;
    let sql = 'SELECT po.*, v.name as vendor_name FROM acc_purchase_orders po LEFT JOIN acc_vendors v ON po.vendor_id = v.id WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND po.status = ?'; params.push(status); }
    if (vendor_id) { sql += ' AND po.vendor_id = ?'; params.push(vendor_id); }
    if (from_date) { sql += ' AND po.order_date >= ?'; params.push(from_date); }
    if (to_date) { sql += ' AND po.order_date <= ?'; params.push(to_date); }
    sql += ' ORDER BY po.created_at DESC';
    const pos = query(sql, params);
    res.json({ success: true, data: pos.map(p => ({ ...p, items: JSON.parse(p.items || '[]') })) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/purchase-orders/pending', (req, res) => {
  try {
    const data = query('SELECT po.*, v.name as vendor_name FROM acc_purchase_orders po LEFT JOIN acc_vendors v ON po.vendor_id = v.id WHERE po.status IN (\'approved\', \'partially_received\') ORDER BY po.expected_date ASC', []);
    res.json({ success: true, data: data.map(p => ({ ...p, items: JSON.parse(p.items || '[]') })) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/purchase-orders/csv', (req, res) => {
  try {
    const data = query('SELECT po.*, v.name as vendor_name FROM acc_purchase_orders po LEFT JOIN acc_vendors v ON po.vendor_id = v.id ORDER BY po.created_at DESC', []);
    sendCSV(res, data, 'purchase-orders.csv');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/purchase-orders/report', (req, res) => {
  try {
    const byStatus = query('SELECT status, COUNT(*) as count, SUM(total) as total FROM acc_purchase_orders GROUP BY status', []);
    const byVendor = query('SELECT v.name as vendor_name, COUNT(*) as po_count, SUM(po.total) as total FROM acc_purchase_orders po LEFT JOIN acc_vendors v ON po.vendor_id = v.id GROUP BY po.vendor_id ORDER BY total DESC LIMIT 20', []);
    res.json({ success: true, data: { by_status: byStatus, by_vendor: byVendor } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/purchase-orders', (req, res) => {
  try {
    const { vendor_id, order_date, expected_date, items, notes } = req.body;
    if (!vendor_id || !items || !items.length) return res.status(400).json({ success: false, error: 'vendor_id and items required' });
    const id = uuidv4();
    const poNumber = `PO-${Date.now().toString(36).toUpperCase()}`;
    const subtotal = items.reduce((s, i) => s + ((i.quantity || 1) * (i.unit_price || 0)), 0);
    const tax = items.reduce((s, i) => s + ((i.quantity || 1) * (i.unit_price || 0) * ((i.tax_rate || 0) / 100)), 0);
    const total = subtotal + tax;
    run('INSERT INTO acc_purchase_orders (id, po_number, vendor_id, order_date, expected_date, items, subtotal, tax, total, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, poNumber, vendor_id, order_date || new Date().toISOString().split('T')[0], expected_date || null, JSON.stringify(items), subtotal, tax, total, notes || null]);
    res.status(201).json({ success: true, data: { id, po_number: poNumber, subtotal, tax, total, status: 'draft' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/purchase-orders/:id', (req, res) => {
  try {
    const po = get('SELECT po.*, v.name as vendor_name FROM acc_purchase_orders po LEFT JOIN acc_vendors v ON po.vendor_id = v.id WHERE po.id = ?', [req.params.id]);
    if (!po) return res.status(404).json({ success: false, error: 'PO not found' });
    const receipts = query('SELECT * FROM acc_po_receipts WHERE po_id = ? ORDER BY created_at DESC', [req.params.id]);
    res.json({ success: true, data: { ...po, items: JSON.parse(po.items || '[]'), receipts } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/purchase-orders/:id', (req, res) => {
  try {
    const po = get('SELECT * FROM acc_purchase_orders WHERE id = ?', [req.params.id]);
    if (!po) return res.status(404).json({ success: false, error: 'PO not found' });
    if (po.status !== 'draft') return res.status(400).json({ success: false, error: 'Only draft POs can be edited' });
    const { vendor_id, order_date, expected_date, items, notes } = req.body;
    let subtotal = po.subtotal, tax = po.tax, total = po.total;
    if (items) {
      subtotal = items.reduce((s, i) => s + ((i.quantity || 1) * (i.unit_price || 0)), 0);
      tax = items.reduce((s, i) => s + ((i.quantity || 1) * (i.unit_price || 0) * ((i.tax_rate || 0) / 100)), 0);
      total = subtotal + tax;
    }
    run('UPDATE acc_purchase_orders SET vendor_id = COALESCE(?, vendor_id), order_date = COALESCE(?, order_date), expected_date = COALESCE(?, expected_date), items = COALESCE(?, items), subtotal = ?, tax = ?, total = ?, notes = COALESCE(?, notes), updated_at = datetime(\'now\') WHERE id = ?',
      [vendor_id, order_date, expected_date, items ? JSON.stringify(items) : null, subtotal, tax, total, notes, req.params.id]);
    res.json({ success: true, data: get('SELECT * FROM acc_purchase_orders WHERE id = ?', [req.params.id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/purchase-orders/:id/submit', (req, res) => {
  try {
    run('UPDATE acc_purchase_orders SET status = \'pending_approval\', updated_at = datetime(\'now\') WHERE id = ? AND status = \'draft\'', [req.params.id]);
    res.json({ success: true, data: get('SELECT * FROM acc_purchase_orders WHERE id = ?', [req.params.id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/purchase-orders/:id/approve', (req, res) => {
  try {
    run('UPDATE acc_purchase_orders SET status = \'approved\', updated_at = datetime(\'now\') WHERE id = ? AND status = \'pending_approval\'', [req.params.id]);
    res.json({ success: true, data: get('SELECT * FROM acc_purchase_orders WHERE id = ?', [req.params.id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/purchase-orders/:id/receive', (req, res) => {
  try {
    const { items_received, received_by, notes } = req.body;
    const po = get('SELECT * FROM acc_purchase_orders WHERE id = ?', [req.params.id]);
    if (!po) return res.status(404).json({ success: false, error: 'PO not found' });
    const receiptId = uuidv4();
    run('INSERT INTO acc_po_receipts (id, po_id, receipt_date, items_received, received_by, notes) VALUES (?, ?, datetime(\'now\'), ?, ?, ?)',
      [receiptId, req.params.id, JSON.stringify(items_received || []), received_by || null, notes || null]);
    const poItems = JSON.parse(po.items || '[]');
    const allReceipts = query('SELECT items_received FROM acc_po_receipts WHERE po_id = ?', [req.params.id]);
    const totalReceived = {};
    for (const r of allReceipts) {
      for (const item of JSON.parse(r.items_received || '[]')) {
        totalReceived[item.product_id || item.id] = (totalReceived[item.product_id || item.id] || 0) + (item.quantity || 0);
      }
    }
    const allFulfilled = poItems.every(i => (totalReceived[i.product_id || i.id] || 0) >= (i.quantity || 0));
    run('UPDATE acc_purchase_orders SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [allFulfilled ? 'received' : 'partially_received', req.params.id]);
    res.json({ success: true, data: { receipt_id: receiptId, po_status: allFulfilled ? 'received' : 'partially_received' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/purchase-orders/:id/convert-to-bill', (req, res) => {
  try {
    const po = get('SELECT * FROM acc_purchase_orders WHERE id = ?', [req.params.id]);
    if (!po) return res.status(404).json({ success: false, error: 'PO not found' });
    const billId = uuidv4();
    const billNumber = `BILL-${Date.now().toString(36).toUpperCase()}`;
    run('INSERT INTO acc_bills (id, bill_number, vendor_id, bill_date, due_date, items, subtotal, tax_amount, total_amount, status, reference_type, reference_id) VALUES (?, ?, ?, datetime(\'now\'), datetime(\'now\', \'+30 days\'), ?, ?, ?, ?, \'draft\', \'purchase_order\', ?)',
      [billId, billNumber, po.vendor_id, po.items, po.subtotal, po.tax, po.total, req.params.id]);
    run('UPDATE acc_purchase_orders SET status = \'billed\', updated_at = datetime(\'now\') WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: { bill_id: billId, bill_number: billNumber, po_id: req.params.id } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/purchase-orders/:id/receipts', (req, res) => {
  try {
    const receipts = query('SELECT * FROM acc_po_receipts WHERE po_id = ? ORDER BY created_at DESC', [req.params.id]);
    res.json({ success: true, data: receipts.map(r => ({ ...r, items_received: JSON.parse(r.items_received || '[]') })) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/purchase-orders/:id', (req, res) => {
  try {
    const po = get('SELECT status FROM acc_purchase_orders WHERE id = ?', [req.params.id]);
    if (po && po.status !== 'draft') return res.status(400).json({ success: false, error: 'Only draft POs can be deleted' });
    run('DELETE FROM acc_purchase_orders WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'PO deleted' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Vendors (read-only reference from AP)
app.get('/api/vendors', (req, res) => {
  try { res.json({ success: true, data: query('SELECT * FROM acc_vendors WHERE is_active = 1 ORDER BY name', []) }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// SPA fallback
app.get('*', (req, res) => {
  if (req.accepts('html') && fs.existsSync(path.join(uiPath, 'index.html'))) {
    return res.sendFile(path.join(uiPath, 'index.html'));
  }
  res.status(404).json({ error: 'Not found' });
});

initDb().then(() => {
  app.listen(PORT, () => console.log(`Purchase Orders (lite) on port ${PORT}`));
}).catch(err => { console.error('Failed to init DB:', err); process.exit(1); });

module.exports = app;
