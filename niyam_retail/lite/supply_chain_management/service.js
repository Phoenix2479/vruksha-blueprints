const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8875;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'supply_chain_management', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'supply_chain_management' }));

// Supply chain overview
app.get('/supply-chain/overview', (req, res) => {
  try {
    const suppliers = get('SELECT COUNT(*) as count FROM suppliers WHERE active = 1');
    const pendingPOs = get("SELECT COUNT(*) as count, SUM(total) as value FROM purchase_orders WHERE status IN ('draft', 'sent', 'confirmed')");
    const inTransit = get("SELECT COUNT(*) as count FROM shipments WHERE status = 'in_transit'");
    const lowStock = get('SELECT COUNT(*) as count FROM inventory WHERE quantity <= min_quantity AND min_quantity > 0');
    
    res.json({
      success: true,
      overview: {
        active_suppliers: suppliers?.count || 0,
        pending_orders: pendingPOs?.count || 0,
        pending_value: pendingPOs?.value || 0,
        in_transit: inTransit?.count || 0,
        low_stock_items: lowStock?.count || 0
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Demand forecast (simple moving average)
app.get('/supply-chain/forecast/:product_id', (req, res) => {
  try {
    const { days = 30 } = req.query;
    // Get historical sales (simplified - would need sales items breakdown)
    const current = get('SELECT quantity FROM inventory WHERE product_id = ?', [req.params.product_id]);
    const product = get('SELECT * FROM products WHERE id = ?', [req.params.product_id]);
    
    // Simple forecast based on current stock and reorder point
    const currentQty = current?.quantity || 0;
    const minQty = current?.min_quantity || 10;
    const daysOfStock = minQty > 0 ? Math.floor(currentQty / (minQty / 7)) : 999;
    const shouldReorder = currentQty <= minQty;
    
    res.json({
      success: true,
      product: product?.name,
      forecast: {
        current_stock: currentQty,
        min_stock: minQty,
        days_of_stock: daysOfStock,
        should_reorder: shouldReorder,
        suggested_order_qty: shouldReorder ? minQty * 2 : 0
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Reorder suggestions
app.get('/supply-chain/reorder-suggestions', (req, res) => {
  try {
    const items = query(`SELECT i.*, p.name, p.sku, p.cost, s.name as supplier_name 
      FROM inventory i 
      LEFT JOIN products p ON i.product_id = p.id 
      LEFT JOIN suppliers s ON p.id = s.id
      WHERE i.quantity <= i.min_quantity AND i.min_quantity > 0
      ORDER BY (i.min_quantity - i.quantity) DESC`);
    
    const suggestions = items.map(item => ({
      ...item,
      suggested_qty: (item.max_quantity || item.min_quantity * 3) - item.quantity,
      estimated_cost: ((item.max_quantity || item.min_quantity * 3) - item.quantity) * (item.cost || 0)
    }));
    
    res.json({ success: true, suggestions });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Lead time tracking
app.get('/supply-chain/lead-times', (req, res) => {
  try {
    const leadTimes = query(`SELECT s.id, s.name, 
      AVG(julianday(po.received_date) - julianday(po.created_at)) as avg_lead_days,
      COUNT(po.id) as order_count
      FROM suppliers s
      LEFT JOIN purchase_orders po ON s.id = po.supplier_id AND po.status = 'received' AND po.received_date IS NOT NULL
      GROUP BY s.id
      HAVING order_count > 0
      ORDER BY avg_lead_days`);
    res.json({ success: true, lead_times: leadTimes });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Supplier performance
app.get('/supply-chain/supplier-performance', (req, res) => {
  try {
    const performance = query(`SELECT s.id, s.name, s.rating,
      COUNT(po.id) as total_orders,
      SUM(CASE WHEN po.status = 'received' THEN 1 ELSE 0 END) as completed_orders,
      SUM(po.total) as total_value
      FROM suppliers s
      LEFT JOIN purchase_orders po ON s.id = po.supplier_id
      WHERE s.active = 1
      GROUP BY s.id
      ORDER BY s.rating DESC, total_value DESC`);
    res.json({ success: true, performance });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Inventory velocity
app.get('/supply-chain/inventory-velocity', (req, res) => {
  try {
    // Items that haven't moved (no recent restocks)
    const slowMoving = query(`SELECT i.*, p.name, p.sku 
      FROM inventory i 
      LEFT JOIN products p ON i.product_id = p.id
      WHERE i.last_restock IS NULL OR i.last_restock < date('now', '-90 days')
      ORDER BY i.last_restock`);
    res.json({ success: true, slow_moving: slowMoving });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Cost analysis
app.get('/supply-chain/cost-analysis', (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    let dateFilter = '';
    const params = [];
    if (from_date) { dateFilter += ' AND created_at >= ?'; params.push(from_date); }
    if (to_date) { dateFilter += ' AND created_at <= ?'; params.push(to_date); }
    
    const poTotal = get(`SELECT SUM(total) as total FROM purchase_orders WHERE status = 'received'${dateFilter}`, params);
    const shippingTotal = get(`SELECT SUM(cost) as total FROM shipments WHERE status = 'delivered'${dateFilter}`, params);
    
    res.json({
      success: true,
      costs: {
        procurement: poTotal?.total || 0,
        shipping: shippingTotal?.total || 0,
        total: (poTotal?.total || 0) + (shippingTotal?.total || 0)
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'supply_chain_management', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Supply Chain Management Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
