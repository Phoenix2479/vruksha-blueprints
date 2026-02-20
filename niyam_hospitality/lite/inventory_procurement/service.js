/**
 * Inventory & Procurement - Niyam Hospitality (Max Lite)
 * Stock tracking, suppliers, purchase orders
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8967;
const SERVICE_NAME = 'inventory_procurement';

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME, mode: 'lite' }));

// ============================================
// INVENTORY ITEMS
// ============================================

app.get('/api/inventory', (req, res) => {
  try {
    const { category, low_stock, search, supplier_id } = req.query;
    let sql = `SELECT i.*, s.name as supplier_name FROM inventory_items i LEFT JOIN suppliers s ON i.supplier_id = s.id WHERE 1=1`;
    const params = [];
    
    if (category) { sql += ` AND i.category = ?`; params.push(category); }
    if (low_stock === 'true') { sql += ` AND i.quantity <= i.min_quantity`; }
    if (search) { sql += ` AND (i.name LIKE ? OR i.sku LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
    if (supplier_id) { sql += ` AND i.supplier_id = ?`; params.push(supplier_id); }
    
    sql += ` ORDER BY i.category, i.name ASC`;
    
    const items = query(sql, params);
    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/inventory/:id', (req, res) => {
  try {
    const item = get(`SELECT i.*, s.name as supplier_name FROM inventory_items i LEFT JOIN suppliers s ON i.supplier_id = s.id WHERE i.id = ?`, [req.params.id]);
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });
    res.json({ success: true, item });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/inventory', (req, res) => {
  try {
    const { sku, name, category, unit, quantity, min_quantity, max_quantity, unit_cost, location, supplier_id } = req.body;
    const id = generateId();
    
    run(`
      INSERT INTO inventory_items (id, sku, name, category, unit, quantity, min_quantity, max_quantity, unit_cost, location, supplier_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, sku, name, category, unit || 'each', quantity || 0, min_quantity || 0, max_quantity || 0, unit_cost || 0, location, supplier_id, timestamp()]);
    
    res.json({ success: true, item: { id } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/api/inventory/:id', (req, res) => {
  try {
    const { name, category, unit, min_quantity, max_quantity, unit_cost, location, supplier_id } = req.body;
    
    run(`
      UPDATE inventory_items SET
        name = COALESCE(?, name), category = COALESCE(?, category), unit = COALESCE(?, unit),
        min_quantity = COALESCE(?, min_quantity), max_quantity = COALESCE(?, max_quantity),
        unit_cost = COALESCE(?, unit_cost), location = COALESCE(?, location),
        supplier_id = COALESCE(?, supplier_id), updated_at = ?
      WHERE id = ?
    `, [name, category, unit, min_quantity, max_quantity, unit_cost, location, supplier_id, timestamp(), req.params.id]);
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/inventory/:id/adjust', (req, res) => {
  try {
    const { quantity_change, reason } = req.body;
    const item = get(`SELECT quantity FROM inventory_items WHERE id = ?`, [req.params.id]);
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });
    
    const newQty = (item.quantity || 0) + quantity_change;
    run(`UPDATE inventory_items SET quantity = ?, updated_at = ? WHERE id = ?`, [newQty, timestamp(), req.params.id]);
    
    res.json({ success: true, new_quantity: newQty });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/inventory/low-stock', (req, res) => {
  try {
    const items = query(`
      SELECT i.*, s.name as supplier_name 
      FROM inventory_items i 
      LEFT JOIN suppliers s ON i.supplier_id = s.id 
      WHERE i.quantity <= i.min_quantity
      ORDER BY (i.min_quantity - i.quantity) DESC
    `);
    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// SUPPLIERS
// ============================================

app.get('/api/suppliers', (req, res) => {
  try {
    const { search, active_only } = req.query;
    let sql = `SELECT * FROM suppliers WHERE 1=1`;
    const params = [];
    
    if (active_only !== 'false') { sql += ` AND active = 1`; }
    if (search) { sql += ` AND (name LIKE ? OR contact_name LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
    
    sql += ` ORDER BY name ASC`;
    
    const suppliers = query(sql, params);
    res.json({ success: true, suppliers });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/suppliers', (req, res) => {
  try {
    const { name, contact_name, email, phone, address, payment_terms, notes } = req.body;
    const id = generateId();
    
    run(`
      INSERT INTO suppliers (id, name, contact_name, email, phone, address, payment_terms, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, name, contact_name, email, phone, address, payment_terms, notes, timestamp()]);
    
    res.json({ success: true, supplier: { id } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/api/suppliers/:id', (req, res) => {
  try {
    const { name, contact_name, email, phone, address, payment_terms, rating, notes, active } = req.body;
    
    run(`
      UPDATE suppliers SET
        name = COALESCE(?, name), contact_name = COALESCE(?, contact_name),
        email = COALESCE(?, email), phone = COALESCE(?, phone),
        address = COALESCE(?, address), payment_terms = COALESCE(?, payment_terms),
        rating = COALESCE(?, rating), notes = COALESCE(?, notes), active = COALESCE(?, active)
      WHERE id = ?
    `, [name, contact_name, email, phone, address, payment_terms, rating, notes, active, req.params.id]);
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// PURCHASE ORDERS
// ============================================

app.get('/api/purchase-orders', (req, res) => {
  try {
    const { status, supplier_id } = req.query;
    let sql = `SELECT po.*, s.name as supplier_name FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id WHERE 1=1`;
    const params = [];
    
    if (status) { sql += ` AND po.status = ?`; params.push(status); }
    if (supplier_id) { sql += ` AND po.supplier_id = ?`; params.push(supplier_id); }
    
    sql += ` ORDER BY po.created_at DESC`;
    
    const orders = query(sql, params);
    res.json({ success: true, purchase_orders: orders });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/purchase-orders/:id', (req, res) => {
  try {
    const po = get(`SELECT po.*, s.name as supplier_name, s.email, s.phone FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id WHERE po.id = ?`, [req.params.id]);
    if (!po) return res.status(404).json({ success: false, error: 'PO not found' });
    po.items = JSON.parse(po.items || '[]');
    res.json({ success: true, purchase_order: po });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/purchase-orders', (req, res) => {
  try {
    const { supplier_id, items, expected_date, notes, created_by } = req.body;
    const id = generateId();
    const po_number = `PO-${Date.now().toString(36).toUpperCase()}`;
    
    const parsedItems = items || [];
    const subtotal = parsedItems.reduce((sum, i) => sum + ((i.quantity || 0) * (i.unit_cost || 0)), 0);
    const tax = subtotal * 0.18;
    const total = subtotal + tax;
    
    run(`
      INSERT INTO purchase_orders (id, supplier_id, po_number, status, items, subtotal, tax, total, expected_date, notes, created_by, created_at)
      VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, supplier_id, po_number, JSON.stringify(parsedItems), subtotal, tax, total, expected_date, notes, created_by, timestamp()]);
    
    res.json({ success: true, purchase_order: { id, po_number, total } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/api/purchase-orders/:id/status', (req, res) => {
  try {
    const { status, approved_by } = req.body;
    let sql = `UPDATE purchase_orders SET status = ?`;
    const params = [status];
    
    if (status === 'approved' && approved_by) { sql += `, approved_by = ?`; params.push(approved_by); }
    if (status === 'received') { sql += `, received_date = ?`; params.push(timestamp()); }
    
    sql += ` WHERE id = ?`;
    params.push(req.params.id);
    run(sql, params);
    
    // If received, update inventory
    if (status === 'received') {
      const po = get(`SELECT items FROM purchase_orders WHERE id = ?`, [req.params.id]);
      const items = JSON.parse(po?.items || '[]');
      
      for (const item of items) {
        if (item.inventory_item_id) {
          run(`UPDATE inventory_items SET quantity = quantity + ?, last_restock = ?, updated_at = ? WHERE id = ?`,
            [item.quantity || 0, timestamp(), timestamp(), item.inventory_item_id]);
        }
      }
    }
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// DASHBOARD
// ============================================

app.get('/api/dashboard/stats', (req, res) => {
  try {
    const totalItems = get(`SELECT COUNT(*) as count FROM inventory_items`);
    const lowStock = get(`SELECT COUNT(*) as count FROM inventory_items WHERE quantity <= min_quantity`);
    const outOfStock = get(`SELECT COUNT(*) as count FROM inventory_items WHERE quantity = 0`);
    const pendingPOs = get(`SELECT COUNT(*) as count, SUM(total) as value FROM purchase_orders WHERE status IN ('draft', 'submitted', 'approved')`);
    const totalSuppliers = get(`SELECT COUNT(*) as count FROM suppliers WHERE active = 1`);
    const inventoryValue = get(`SELECT SUM(quantity * unit_cost) as value FROM inventory_items`);
    
    res.json({
      success: true,
      stats: {
        total_items: totalItems?.count || 0,
        low_stock: lowStock?.count || 0,
        out_of_stock: outOfStock?.count || 0,
        pending_pos: pendingPOs?.count || 0,
        pending_po_value: pendingPOs?.value || 0,
        total_suppliers: totalSuppliers?.count || 0,
        inventory_value: inventoryValue?.value || 0
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: SERVICE_NAME, status: 'running', mode: 'lite' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[${SERVICE_NAME}] Lite service on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
