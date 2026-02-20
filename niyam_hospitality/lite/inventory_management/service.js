/**
 * Inventory Management Service - Niyam Hospitality (Max Lite)
 * Stock tracking, purchase orders, receiving, par levels
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8937;
const SERVICE_NAME = 'inventory_management';

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) { app.use(express.static(uiPath)); }

app.get('/health', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME, mode: 'lite' }));

async function ensureTables() {
  const db = await initDb();
  
  db.run(`CREATE TABLE IF NOT EXISTS inventory_categories (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT, description TEXT,
    is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS inventory_items (
    id TEXT PRIMARY KEY, sku TEXT UNIQUE, name TEXT NOT NULL, description TEXT,
    category_id TEXT, unit TEXT DEFAULT 'each', unit_cost REAL DEFAULT 0,
    par_level REAL DEFAULT 0, reorder_point REAL DEFAULT 0, reorder_quantity REAL DEFAULT 0,
    current_stock REAL DEFAULT 0, storage_location TEXT, is_perishable INTEGER DEFAULT 0,
    shelf_life_days INTEGER, preferred_vendor_id TEXT, is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS vendors (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, contact_name TEXT, email TEXT, phone TEXT,
    address TEXT, payment_terms TEXT, lead_time_days INTEGER DEFAULT 3,
    minimum_order REAL DEFAULT 0, notes TEXT, is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS vendor_items (
    id TEXT PRIMARY KEY, vendor_id TEXT NOT NULL, item_id TEXT NOT NULL,
    vendor_sku TEXT, unit_cost REAL, pack_size INTEGER DEFAULT 1, notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(vendor_id, item_id)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS purchase_orders (
    id TEXT PRIMARY KEY, po_number TEXT UNIQUE, vendor_id TEXT NOT NULL,
    order_date TEXT, expected_date TEXT, status TEXT DEFAULT 'draft',
    subtotal REAL DEFAULT 0, tax REAL DEFAULT 0, total REAL DEFAULT 0,
    notes TEXT, created_by TEXT, approved_by TEXT, approved_at TEXT,
    received_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS purchase_order_items (
    id TEXT PRIMARY KEY, po_id TEXT NOT NULL, item_id TEXT NOT NULL,
    quantity_ordered REAL NOT NULL, unit_cost REAL NOT NULL, total_cost REAL,
    quantity_received REAL DEFAULT 0, notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS receiving_logs (
    id TEXT PRIMARY KEY, po_id TEXT, vendor_id TEXT, received_by TEXT,
    received_at TEXT DEFAULT CURRENT_TIMESTAMP, notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS receiving_items (
    id TEXT PRIMARY KEY, receiving_id TEXT NOT NULL, item_id TEXT NOT NULL,
    quantity_expected REAL, quantity_received REAL NOT NULL, unit_cost REAL,
    batch_number TEXT, expiry_date TEXT, condition TEXT DEFAULT 'good',
    notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS stock_adjustments (
    id TEXT PRIMARY KEY, item_id TEXT NOT NULL, adjustment_type TEXT NOT NULL,
    quantity REAL NOT NULL, reason TEXT, reference_type TEXT, reference_id TEXT,
    old_stock REAL, new_stock REAL, adjusted_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS stock_counts (
    id TEXT PRIMARY KEY, count_date TEXT NOT NULL, location TEXT, status TEXT DEFAULT 'in_progress',
    counted_by TEXT, approved_by TEXT, approved_at TEXT, notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS stock_count_items (
    id TEXT PRIMARY KEY, count_id TEXT NOT NULL, item_id TEXT NOT NULL,
    system_quantity REAL, counted_quantity REAL, variance REAL,
    notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  return db;
}

// CATEGORIES
app.get('/categories', async (req, res) => {
  try {
    await ensureTables();
    res.json({ success: true, categories: query(`SELECT * FROM inventory_categories WHERE is_active = 1 ORDER BY name`) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/categories', async (req, res) => {
  try {
    await ensureTables();
    const { name, parent_id, description } = req.body;
    const id = generateId();
    run(`INSERT INTO inventory_categories (id, name, parent_id, description, created_at) VALUES (?, ?, ?, ?, ?)`,
      [id, name, parent_id, description, timestamp()]);
    res.json({ success: true, category: { id, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ITEMS
app.get('/items', async (req, res) => {
  try {
    await ensureTables();
    const { category_id, search, low_stock, active_only } = req.query;
    let sql = `SELECT i.*, c.name as category_name FROM inventory_items i LEFT JOIN inventory_categories c ON i.category_id = c.id WHERE 1=1`;
    const params = [];
    if (category_id) { sql += ` AND i.category_id = ?`; params.push(category_id); }
    if (search) { sql += ` AND (i.name LIKE ? OR i.sku LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
    if (low_stock === 'true') { sql += ` AND i.current_stock <= i.reorder_point`; }
    if (active_only === 'true') { sql += ` AND i.is_active = 1`; }
    sql += ` ORDER BY i.name`;
    res.json({ success: true, items: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/items/:id', async (req, res) => {
  try {
    await ensureTables();
    const item = get(`SELECT i.*, c.name as category_name FROM inventory_items i LEFT JOIN inventory_categories c ON i.category_id = c.id WHERE i.id = ?`, [req.params.id]);
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });
    const vendors = query(`SELECT vi.*, v.name as vendor_name FROM vendor_items vi JOIN vendors v ON vi.vendor_id = v.id WHERE vi.item_id = ?`, [req.params.id]);
    const recentMovements = query(`SELECT * FROM stock_adjustments WHERE item_id = ? ORDER BY created_at DESC LIMIT 20`, [req.params.id]);
    res.json({ success: true, item: { ...item, vendors, recent_movements: recentMovements } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/items', async (req, res) => {
  try {
    await ensureTables();
    const { sku, name, description, category_id, unit, unit_cost, par_level, reorder_point, reorder_quantity, current_stock, storage_location, is_perishable, shelf_life_days, preferred_vendor_id } = req.body;
    const id = generateId();
    const itemSku = sku || `SKU${Date.now().toString(36).toUpperCase()}`;
    run(`INSERT INTO inventory_items (id, sku, name, description, category_id, unit, unit_cost, par_level, reorder_point, reorder_quantity, current_stock, storage_location, is_perishable, shelf_life_days, preferred_vendor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, itemSku, name, description, category_id, unit || 'each', unit_cost || 0, par_level || 0, reorder_point || 0, reorder_quantity || 0, current_stock || 0, storage_location, is_perishable ? 1 : 0, shelf_life_days, preferred_vendor_id, timestamp()]);
    res.json({ success: true, item: { id, sku: itemSku, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/items/:id', async (req, res) => {
  try {
    await ensureTables();
    const { name, description, category_id, unit, unit_cost, par_level, reorder_point, reorder_quantity, storage_location, is_perishable, shelf_life_days, preferred_vendor_id, is_active } = req.body;
    run(`UPDATE inventory_items SET name = COALESCE(?, name), description = COALESCE(?, description), category_id = COALESCE(?, category_id), unit = COALESCE(?, unit), unit_cost = COALESCE(?, unit_cost), par_level = COALESCE(?, par_level), reorder_point = COALESCE(?, reorder_point), reorder_quantity = COALESCE(?, reorder_quantity), storage_location = COALESCE(?, storage_location), is_perishable = COALESCE(?, is_perishable), shelf_life_days = COALESCE(?, shelf_life_days), preferred_vendor_id = COALESCE(?, preferred_vendor_id), is_active = COALESCE(?, is_active), updated_at = ? WHERE id = ?`,
      [name, description, category_id, unit, unit_cost, par_level, reorder_point, reorder_quantity, storage_location, is_perishable, shelf_life_days, preferred_vendor_id, is_active, timestamp(), req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// VENDORS
app.get('/vendors', async (req, res) => {
  try {
    await ensureTables();
    res.json({ success: true, vendors: query(`SELECT * FROM vendors WHERE is_active = 1 ORDER BY name`) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/vendors', async (req, res) => {
  try {
    await ensureTables();
    const { name, contact_name, email, phone, address, payment_terms, lead_time_days, minimum_order, notes } = req.body;
    const id = generateId();
    run(`INSERT INTO vendors (id, name, contact_name, email, phone, address, payment_terms, lead_time_days, minimum_order, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, contact_name, email, phone, address, payment_terms, lead_time_days || 3, minimum_order || 0, notes, timestamp()]);
    res.json({ success: true, vendor: { id, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/vendors/:vendorId/items', async (req, res) => {
  try {
    await ensureTables();
    const { item_id, vendor_sku, unit_cost, pack_size, notes } = req.body;
    const id = generateId();
    run(`INSERT OR REPLACE INTO vendor_items (id, vendor_id, item_id, vendor_sku, unit_cost, pack_size, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.params.vendorId, item_id, vendor_sku, unit_cost, pack_size || 1, notes, timestamp()]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// PURCHASE ORDERS
app.get('/purchase-orders', async (req, res) => {
  try {
    await ensureTables();
    const { vendor_id, status } = req.query;
    let sql = `SELECT po.*, v.name as vendor_name FROM purchase_orders po LEFT JOIN vendors v ON po.vendor_id = v.id WHERE 1=1`;
    const params = [];
    if (vendor_id) { sql += ` AND po.vendor_id = ?`; params.push(vendor_id); }
    if (status) { sql += ` AND po.status = ?`; params.push(status); }
    sql += ` ORDER BY po.created_at DESC`;
    res.json({ success: true, purchase_orders: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/purchase-orders/:id', async (req, res) => {
  try {
    await ensureTables();
    const po = get(`SELECT po.*, v.name as vendor_name FROM purchase_orders po LEFT JOIN vendors v ON po.vendor_id = v.id WHERE po.id = ?`, [req.params.id]);
    if (!po) return res.status(404).json({ success: false, error: 'PO not found' });
    const items = query(`SELECT poi.*, i.name as item_name, i.sku FROM purchase_order_items poi JOIN inventory_items i ON poi.item_id = i.id WHERE poi.po_id = ?`, [req.params.id]);
    res.json({ success: true, purchase_order: { ...po, items } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/purchase-orders', async (req, res) => {
  try {
    await ensureTables();
    const { vendor_id, expected_date, notes, items, created_by } = req.body;
    const id = generateId();
    const poNumber = `PO${Date.now().toString(36).toUpperCase()}`;
    
    run(`INSERT INTO purchase_orders (id, po_number, vendor_id, order_date, expected_date, notes, created_by, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
      [id, poNumber, vendor_id, timestamp(), expected_date, notes, created_by, timestamp()]);
    
    let subtotal = 0;
    for (const item of items || []) {
      const itemId = generateId();
      const totalCost = item.quantity * item.unit_cost;
      subtotal += totalCost;
      run(`INSERT INTO purchase_order_items (id, po_id, item_id, quantity_ordered, unit_cost, total_cost, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [itemId, id, item.item_id, item.quantity, item.unit_cost, totalCost, timestamp()]);
    }
    
    run(`UPDATE purchase_orders SET subtotal = ?, total = ? WHERE id = ?`, [subtotal, subtotal, id]);
    
    res.json({ success: true, purchase_order: { id, po_number: poNumber, subtotal } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/purchase-orders/:id/approve', async (req, res) => {
  try {
    await ensureTables();
    const { approved_by } = req.body;
    run(`UPDATE purchase_orders SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?`,
      [approved_by, timestamp(), req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/purchase-orders/:id/send', async (req, res) => {
  try {
    await ensureTables();
    run(`UPDATE purchase_orders SET status = 'sent' WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// RECEIVING
app.post('/receive', async (req, res) => {
  try {
    await ensureTables();
    const { po_id, vendor_id, items, received_by, notes } = req.body;
    const id = generateId();
    
    run(`INSERT INTO receiving_logs (id, po_id, vendor_id, received_by, received_at, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, po_id, vendor_id, received_by, timestamp(), notes, timestamp()]);
    
    for (const item of items || []) {
      run(`INSERT INTO receiving_items (id, receiving_id, item_id, quantity_expected, quantity_received, unit_cost, batch_number, expiry_date, condition, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), id, item.item_id, item.quantity_expected, item.quantity_received, item.unit_cost, item.batch_number, item.expiry_date, item.condition || 'good', item.notes, timestamp()]);
      
      // Update stock
      const invItem = get(`SELECT current_stock FROM inventory_items WHERE id = ?`, [item.item_id]);
      const oldStock = invItem?.current_stock || 0;
      const newStock = oldStock + item.quantity_received;
      
      run(`UPDATE inventory_items SET current_stock = ?, updated_at = ? WHERE id = ?`, [newStock, timestamp(), item.item_id]);
      
      run(`INSERT INTO stock_adjustments (id, item_id, adjustment_type, quantity, reason, reference_type, reference_id, old_stock, new_stock, adjusted_by, created_at) VALUES (?, ?, 'receiving', ?, 'Received from PO', 'receiving', ?, ?, ?, ?, ?)`,
        [generateId(), item.item_id, item.quantity_received, id, oldStock, newStock, received_by, timestamp()]);
      
      // Update PO item received quantity
      if (po_id) {
        run(`UPDATE purchase_order_items SET quantity_received = quantity_received + ? WHERE po_id = ? AND item_id = ?`,
          [item.quantity_received, po_id, item.item_id]);
      }
    }
    
    // Check if PO is fully received
    if (po_id) {
      const incomplete = get(`SELECT COUNT(*) as count FROM purchase_order_items WHERE po_id = ? AND quantity_received < quantity_ordered`, [po_id]);
      if (!incomplete || incomplete.count === 0) {
        run(`UPDATE purchase_orders SET status = 'received', received_at = ? WHERE id = ?`, [timestamp(), po_id]);
      } else {
        run(`UPDATE purchase_orders SET status = 'partial' WHERE id = ?`, [po_id]);
      }
    }
    
    res.json({ success: true, receiving_id: id });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// STOCK ADJUSTMENTS
app.post('/adjust', async (req, res) => {
  try {
    await ensureTables();
    const { item_id, adjustment_type, quantity, reason, adjusted_by } = req.body;
    
    const item = get(`SELECT current_stock FROM inventory_items WHERE id = ?`, [item_id]);
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });
    
    const oldStock = item.current_stock;
    let newStock;
    if (adjustment_type === 'add') newStock = oldStock + quantity;
    else if (adjustment_type === 'remove') newStock = Math.max(0, oldStock - quantity);
    else if (adjustment_type === 'set') newStock = quantity;
    else return res.status(400).json({ success: false, error: 'Invalid adjustment type' });
    
    run(`UPDATE inventory_items SET current_stock = ?, updated_at = ? WHERE id = ?`, [newStock, timestamp(), item_id]);
    
    const id = generateId();
    run(`INSERT INTO stock_adjustments (id, item_id, adjustment_type, quantity, reason, old_stock, new_stock, adjusted_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, item_id, adjustment_type, quantity, reason, oldStock, newStock, adjusted_by, timestamp()]);
    
    res.json({ success: true, adjustment: { id, old_stock: oldStock, new_stock: newStock } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// STOCK COUNTS
app.post('/counts', async (req, res) => {
  try {
    await ensureTables();
    const { location, counted_by, notes } = req.body;
    const id = generateId();
    const today = new Date().toISOString().split('T')[0];
    run(`INSERT INTO stock_counts (id, count_date, location, counted_by, notes, status, created_at) VALUES (?, ?, ?, ?, ?, 'in_progress', ?)`,
      [id, today, location, counted_by, notes, timestamp()]);
    
    // Pre-populate with current items
    const items = query(`SELECT id, current_stock FROM inventory_items WHERE is_active = 1`);
    for (const item of items) {
      run(`INSERT INTO stock_count_items (id, count_id, item_id, system_quantity, created_at) VALUES (?, ?, ?, ?, ?)`,
        [generateId(), id, item.id, item.current_stock, timestamp()]);
    }
    
    res.json({ success: true, count: { id, item_count: items.length } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/counts/:countId/items/:itemId', async (req, res) => {
  try {
    await ensureTables();
    const { counted_quantity, notes } = req.body;
    const countItem = get(`SELECT system_quantity FROM stock_count_items WHERE count_id = ? AND item_id = ?`, [req.params.countId, req.params.itemId]);
    const variance = counted_quantity - (countItem?.system_quantity || 0);
    run(`UPDATE stock_count_items SET counted_quantity = ?, variance = ?, notes = ? WHERE count_id = ? AND item_id = ?`,
      [counted_quantity, variance, notes, req.params.countId, req.params.itemId]);
    res.json({ success: true, variance });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/counts/:id/finalize', async (req, res) => {
  try {
    await ensureTables();
    const { approved_by, apply_variances } = req.body;
    
    if (apply_variances) {
      const items = query(`SELECT * FROM stock_count_items WHERE count_id = ? AND counted_quantity IS NOT NULL`, [req.params.id]);
      for (const item of items) {
        if (item.variance !== 0) {
          run(`UPDATE inventory_items SET current_stock = ?, updated_at = ? WHERE id = ?`, [item.counted_quantity, timestamp(), item.item_id]);
          run(`INSERT INTO stock_adjustments (id, item_id, adjustment_type, quantity, reason, reference_type, reference_id, old_stock, new_stock, adjusted_by, created_at) VALUES (?, ?, 'count_adjustment', ?, 'Stock count variance', 'count', ?, ?, ?, ?, ?)`,
            [generateId(), item.item_id, Math.abs(item.variance), req.params.id, item.system_quantity, item.counted_quantity, approved_by, timestamp()]);
        }
      }
    }
    
    run(`UPDATE stock_counts SET status = 'completed', approved_by = ?, approved_at = ? WHERE id = ?`, [approved_by, timestamp(), req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ALERTS
app.get('/alerts/low-stock', async (req, res) => {
  try {
    await ensureTables();
    const items = query(`SELECT id, sku, name, current_stock, reorder_point, reorder_quantity, unit FROM inventory_items WHERE is_active = 1 AND current_stock <= reorder_point ORDER BY (current_stock / NULLIF(reorder_point, 0))`);
    res.json({ success: true, items });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/alerts/expiring', async (req, res) => {
  try {
    await ensureTables();
    const { days = 7 } = req.query;
    const items = query(`SELECT ri.*, i.name, i.sku FROM receiving_items ri JOIN inventory_items i ON ri.item_id = i.id WHERE ri.expiry_date IS NOT NULL AND ri.expiry_date <= date('now', '+${parseInt(days)} days') ORDER BY ri.expiry_date`);
    res.json({ success: true, items });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// STATS
app.get('/stats', async (req, res) => {
  try {
    await ensureTables();
    const totalItems = get(`SELECT COUNT(*) as count FROM inventory_items WHERE is_active = 1`);
    const totalValue = get(`SELECT SUM(current_stock * unit_cost) as value FROM inventory_items WHERE is_active = 1`);
    const lowStock = get(`SELECT COUNT(*) as count FROM inventory_items WHERE is_active = 1 AND current_stock <= reorder_point`);
    const pendingPOs = get(`SELECT COUNT(*) as count, SUM(total) as value FROM purchase_orders WHERE status IN ('draft', 'approved', 'sent')`);
    
    res.json({ success: true, stats: {
      total_items: totalItems?.count || 0, inventory_value: totalValue?.value || 0,
      low_stock_items: lowStock?.count || 0, pending_po_count: pendingPOs?.count || 0,
      pending_po_value: pendingPOs?.value || 0
    }});
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

async function start() {
  await ensureTables();
  app.get('*', (req, res) => {
    if (fs.existsSync(path.join(uiPath, 'index.html'))) res.sendFile(path.join(uiPath, 'index.html'));
    else res.json({ service: SERVICE_NAME, mode: 'lite', status: 'running' });
  });
  app.listen(PORT, () => console.log(`✅ ${SERVICE_NAME} (Lite) running on port ${PORT}`));
}

start();
