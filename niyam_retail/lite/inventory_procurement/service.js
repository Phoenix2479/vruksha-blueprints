const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8893;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'inventory_procurement', mode: 'lite' }));

// Reorder needs
app.get('/procurement/reorder-needs', (req, res) => {
  try {
    const items = query(`SELECT i.*, p.name, p.sku, p.cost FROM inventory i 
      JOIN products p ON i.product_id = p.id WHERE i.quantity <= i.min_quantity AND i.min_quantity > 0`);
    const needs = items.map(item => ({
      ...item,
      reorder_qty: (item.max_quantity || item.min_quantity * 3) - item.quantity,
      estimated_cost: ((item.max_quantity || item.min_quantity * 3) - item.quantity) * (item.cost || 0)
    }));
    res.json({ success: true, needs, total_estimated: needs.reduce((sum, n) => sum + n.estimated_cost, 0) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Auto-generate PO
app.post('/procurement/auto-generate-po', (req, res) => {
  try {
    const { supplier_id } = req.body;
    const items = query(`SELECT i.*, p.name, p.sku, p.cost FROM inventory i 
      JOIN products p ON i.product_id = p.id WHERE i.quantity <= i.min_quantity AND i.min_quantity > 0`);
    
    if (items.length === 0) return res.json({ success: true, message: 'No items need reorder', po: null });
    
    const poItems = items.map(item => ({
      product_id: item.product_id,
      name: item.name,
      quantity: (item.max_quantity || item.min_quantity * 3) - item.quantity,
      unit_cost: item.cost || 0
    }));
    
    const total = poItems.reduce((sum, i) => sum + (i.quantity * i.unit_cost), 0);
    const poId = uuidv4();
    const poNumber = `PO-AUTO-${Date.now()}`;
    
    run('INSERT INTO purchase_orders (id, po_number, supplier_id, items, total, subtotal, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [poId, poNumber, supplier_id, JSON.stringify(poItems), total, total, 'Auto-generated based on reorder points']);
    
    res.json({ success: true, po: { id: poId, po_number: poNumber, items: poItems.length, total } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Inventory levels overview
app.get('/procurement/inventory-levels', (req, res) => {
  try {
    const levels = query(`SELECT 
      CASE WHEN i.quantity = 0 THEN 'out_of_stock'
           WHEN i.quantity <= i.min_quantity THEN 'critical'
           WHEN i.quantity <= i.min_quantity * 1.5 THEN 'low'
           WHEN i.quantity >= i.max_quantity THEN 'overstock'
           ELSE 'normal' END as level,
      COUNT(*) as count
      FROM inventory i WHERE i.min_quantity > 0 GROUP BY level`);
    res.json({ success: true, levels });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Procurement history
app.get('/procurement/history', (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const orders = query(`SELECT po.*, s.name as supplier_name FROM purchase_orders po 
      LEFT JOIN suppliers s ON po.supplier_id = s.id ORDER BY po.created_at DESC LIMIT ?`, [parseInt(limit)]);
    res.json({ success: true, orders });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'inventory_procurement', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Inventory Procurement Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
