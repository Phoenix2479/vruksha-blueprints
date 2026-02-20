const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8879;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'mobile_store_ops', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'mobile_store_ops' }));

// Mobile-optimized dashboard
app.get('/mobile/dashboard', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const todaySales = get(`SELECT COUNT(*) as count, SUM(total) as total FROM sales WHERE date(created_at) = date(?)`, [today]);
    const lowStock = get('SELECT COUNT(*) as count FROM inventory WHERE quantity <= min_quantity AND min_quantity > 0');
    const pendingOrders = get("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'");
    
    res.json({
      success: true,
      dashboard: {
        today_sales: todaySales?.total || 0,
        today_count: todaySales?.count || 0,
        low_stock: lowStock?.count || 0,
        pending_orders: pendingOrders?.count || 0
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Quick product lookup (for scanning)
app.get('/mobile/product/scan/:barcode', (req, res) => {
  try {
    const product = get(`SELECT p.*, i.quantity as stock FROM products p 
      LEFT JOIN inventory i ON p.id = i.product_id WHERE p.barcode = ? AND p.active = 1`, [req.params.barcode]);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
    res.json({ success: true, product });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Quick inventory update
app.post('/mobile/inventory/update', (req, res) => {
  try {
    const { product_id, barcode, quantity, action = 'set' } = req.body;
    let productId = product_id;
    if (!productId && barcode) {
      const product = get('SELECT id FROM products WHERE barcode = ?', [barcode]);
      if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
      productId = product.id;
    }
    if (!productId) return res.status(400).json({ success: false, error: 'product_id or barcode required' });
    
    const current = get('SELECT * FROM inventory WHERE product_id = ?', [productId]);
    let newQty = quantity;
    if (action === 'add') newQty = (current?.quantity || 0) + quantity;
    else if (action === 'subtract') newQty = Math.max(0, (current?.quantity || 0) - quantity);
    
    if (current) {
      run('UPDATE inventory SET quantity = ?, updated_at = ? WHERE product_id = ?', [newQty, new Date().toISOString(), productId]);
    } else {
      run('INSERT INTO inventory (id, product_id, quantity) VALUES (?, ?, ?)', [uuidv4(), productId, newQty]);
    }
    
    res.json({ success: true, product_id: productId, new_quantity: newQty });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Quick sale
app.post('/mobile/sale', (req, res) => {
  try {
    const { items, payment_method, customer_id } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Items required' });
    }
    
    let subtotal = 0;
    let tax = 0;
    const processedItems = [];
    
    for (const item of items) {
      let product;
      if (item.product_id) {
        product = get('SELECT * FROM products WHERE id = ?', [item.product_id]);
      } else if (item.barcode) {
        product = get('SELECT * FROM products WHERE barcode = ?', [item.barcode]);
      }
      if (!product) continue;
      
      const qty = item.quantity || 1;
      const lineTotal = product.price * qty;
      const lineTax = lineTotal * (product.tax_rate || 0) / 100;
      subtotal += lineTotal;
      tax += lineTax;
      processedItems.push({ product_id: product.id, name: product.name, quantity: qty, price: product.price, total: lineTotal });
      
      // Update inventory
      const inv = get('SELECT * FROM inventory WHERE product_id = ?', [product.id]);
      if (inv) run('UPDATE inventory SET quantity = ? WHERE product_id = ?', [Math.max(0, inv.quantity - qty), product.id]);
    }
    
    const total = subtotal + tax;
    const saleId = uuidv4();
    run('INSERT INTO sales (id, customer_id, items, subtotal, tax, total, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [saleId, customer_id, JSON.stringify(processedItems), subtotal, tax, total, payment_method || 'cash']);
    
    res.json({ success: true, sale: { id: saleId, subtotal, tax, total, items: processedItems } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Products list (paginated for mobile)
app.get('/mobile/products', (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let sql = 'SELECT p.*, i.quantity as stock FROM products p LEFT JOIN inventory i ON p.id = i.product_id WHERE p.active = 1';
    const params = [];
    if (search) { sql += ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    sql += ' ORDER BY p.name LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);
    res.json({ success: true, products: query(sql, params), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Today's sales
app.get('/mobile/sales/today', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const sales = query(`SELECT * FROM sales WHERE date(created_at) = date(?) ORDER BY created_at DESC`, [today]);
    const total = sales.reduce((sum, s) => sum + (s.total || 0), 0);
    res.json({ success: true, sales, count: sales.length, total });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Low stock alerts
app.get('/mobile/alerts/low-stock', (req, res) => {
  try {
    const items = query(`SELECT p.id, p.name, p.sku, p.barcode, i.quantity, i.min_quantity 
      FROM inventory i JOIN products p ON i.product_id = p.id 
      WHERE i.quantity <= i.min_quantity AND i.min_quantity > 0 ORDER BY i.quantity`);
    res.json({ success: true, alerts: items });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'mobile_store_ops', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Mobile Store Ops Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
