const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8840;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'procurement', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'procurement' }));

// === SUPPLIERS ===
app.get('/suppliers', (req, res) => {
  try {
    const suppliers = query('SELECT * FROM suppliers WHERE active = 1 ORDER BY name');
    res.json({ success: true, suppliers });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/suppliers', (req, res) => {
  try {
    const { name, contact_name, email, phone, address, payment_terms } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Name required' });
    const id = uuidv4();
    run('INSERT INTO suppliers (id, name, contact_name, email, phone, address, payment_terms) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, name, contact_name, email, phone, address, payment_terms]);
    res.json({ success: true, supplier: { id, name } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/suppliers/:id', (req, res) => {
  try {
    const supplier = get('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
    if (!supplier) return res.status(404).json({ success: false, error: 'Supplier not found' });
    const ratings = query('SELECT * FROM supplier_ratings WHERE supplier_id = ? ORDER BY created_at DESC LIMIT 10', [req.params.id]);
    res.json({ success: true, supplier, ratings });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Rate supplier
app.post('/suppliers/:id/rate', (req, res) => {
  try {
    const { rating, po_id, comments } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ success: false, error: 'Rating must be 1-5' });
    const id = uuidv4();
    run('INSERT INTO supplier_ratings (id, supplier_id, po_id, rating, comments) VALUES (?, ?, ?, ?, ?)',
      [id, req.params.id, po_id, rating, comments]);
    // Update average rating
    const avgResult = get('SELECT AVG(rating) as avg FROM supplier_ratings WHERE supplier_id = ?', [req.params.id]);
    run('UPDATE suppliers SET rating = ?, updated_at = ? WHERE id = ?', [avgResult?.avg || rating, new Date().toISOString(), req.params.id]);
    res.json({ success: true, message: 'Rating recorded' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// === PURCHASE ORDERS ===
app.get('/purchase-orders', (req, res) => {
  try {
    const { status, supplier_id, limit = 100 } = req.query;
    let sql = 'SELECT po.*, s.name as supplier_name FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND po.status = ?'; params.push(status); }
    if (supplier_id) { sql += ' AND po.supplier_id = ?'; params.push(supplier_id); }
    sql += ' ORDER BY po.created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    const orders = query(sql, params);
    res.json({ success: true, purchase_orders: orders });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/purchase-orders/:id', (req, res) => {
  try {
    const po = get('SELECT po.*, s.name as supplier_name FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id WHERE po.id = ?', [req.params.id]);
    if (!po) return res.status(404).json({ success: false, error: 'PO not found' });
    res.json({ success: true, purchase_order: { ...po, items: JSON.parse(po.items || '[]') } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/purchase-orders', (req, res) => {
  try {
    const { supplier_id, location_id, items, expected_date, notes } = req.body;
    if (!supplier_id || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'supplier_id and items required' });
    }
    const id = uuidv4();
    const poNumber = `PO-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const total = items.reduce((sum, item) => sum + ((item.quantity || 1) * (item.unit_cost || 0)), 0);
    
    run(`INSERT INTO purchase_orders (id, po_number, supplier_id, location_id, store_id, items, subtotal, total, expected_delivery_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, poNumber, supplier_id, location_id, location_id, JSON.stringify(items), total, total, expected_date, notes]);
    
    res.json({ success: true, purchase_order: { id, po_number: poNumber, total, status: 'draft' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Update PO status
app.patch('/purchase-orders/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['draft', 'sent', 'confirmed', 'shipped', 'received', 'cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });
    const receivedDate = status === 'received' ? new Date().toISOString() : null;
    run('UPDATE purchase_orders SET status = ?, received_date = ?, updated_at = ? WHERE id = ?',
      [status, receivedDate, new Date().toISOString(), req.params.id]);
    res.json({ success: true, message: 'Status updated' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Receive shipment
app.post('/purchase-orders/:id/receive', (req, res) => {
  try {
    const { items_received } = req.body;
    const po = get('SELECT * FROM purchase_orders WHERE id = ?', [req.params.id]);
    if (!po) return res.status(404).json({ success: false, error: 'PO not found' });
    
    run('UPDATE purchase_orders SET status = ?, received_date = ?, updated_at = ? WHERE id = ?',
      ['received', new Date().toISOString(), new Date().toISOString(), req.params.id]);
    
    // Update inventory for each item
    if (items_received && Array.isArray(items_received)) {
      for (const item of items_received) {
        const existing = get('SELECT * FROM inventory WHERE product_id = ?', [item.product_id]);
        if (existing) {
          run('UPDATE inventory SET quantity = ?, last_restock = ?, updated_at = ? WHERE product_id = ?',
            [existing.quantity + item.quantity, new Date().toISOString(), new Date().toISOString(), item.product_id]);
        } else {
          run('INSERT INTO inventory (id, product_id, quantity, last_restock) VALUES (?, ?, ?, ?)',
            [uuidv4(), item.product_id, item.quantity, new Date().toISOString()]);
        }
      }
    }
    
    res.json({ success: true, message: 'Shipment received and inventory updated' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Landed cost calculation
app.post('/purchase-orders/:id/landed-cost', (req, res) => {
  try {
    const { freight = 0, duties = 0, handling = 0 } = req.body;
    const po = get('SELECT * FROM purchase_orders WHERE id = ?', [req.params.id]);
    if (!po) return res.status(404).json({ success: false, error: 'PO not found' });
    
    const productCost = po.total || 0;
    const totalLanded = productCost + freight + duties + handling;
    const factor = productCost > 0 ? totalLanded / productCost : 1;
    
    const items = JSON.parse(po.items || '[]').map(item => ({
      ...item,
      landed_unit_cost: (item.unit_cost || 0) * factor
    }));
    
    res.json({ success: true, total_landed_cost: totalLanded, items });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'procurement', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Procurement Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
