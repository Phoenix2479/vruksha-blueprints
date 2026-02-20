const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8888;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'retail_kiosk_flow', mode: 'lite' }));

// Kiosk product listing (simplified for touch UI)
app.get('/kiosk/products', (req, res) => {
  try {
    const { category } = req.query;
    let sql = 'SELECT p.id, p.name, p.price, p.image_url, p.category, i.quantity as stock FROM products p LEFT JOIN inventory i ON p.id = i.product_id WHERE p.active = 1';
    const params = [];
    if (category) { sql += ' AND p.category = ?'; params.push(category); }
    sql += ' AND (i.quantity > 0 OR i.quantity IS NULL) ORDER BY p.name';
    res.json({ success: true, products: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/kiosk/categories', (req, res) => {
  try {
    const categories = query('SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND active = 1 ORDER BY category');
    res.json({ success: true, categories: categories.map(c => c.category) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Kiosk order
app.post('/kiosk/order', (req, res) => {
  try {
    const { items, customer_name, customer_phone, payment_method } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ success: false, error: 'Items required' });
    
    let subtotal = 0;
    const orderItems = [];
    for (const item of items) {
      const product = get('SELECT * FROM products WHERE id = ?', [item.product_id]);
      if (product) {
        const lineTotal = product.price * (item.quantity || 1);
        subtotal += lineTotal;
        orderItems.push({ product_id: product.id, name: product.name, quantity: item.quantity || 1, price: product.price, total: lineTotal });
      }
    }
    
    const tax = subtotal * 0.1; // 10% tax
    const total = subtotal + tax;
    const orderId = uuidv4();
    const orderNumber = `KIOSK-${Date.now().toString(36).toUpperCase()}`;
    
    run('INSERT INTO orders (id, items, subtotal, tax, total, status) VALUES (?, ?, ?, ?, ?, ?)',
      [orderId, JSON.stringify(orderItems), subtotal, tax, total, 'pending']);
    
    // Update inventory
    for (const item of orderItems) {
      const inv = get('SELECT * FROM inventory WHERE product_id = ?', [item.product_id]);
      if (inv) run('UPDATE inventory SET quantity = ? WHERE product_id = ?', [Math.max(0, inv.quantity - item.quantity), item.product_id]);
    }
    
    res.json({ success: true, order: { id: orderId, order_number: orderNumber, items: orderItems, subtotal, tax, total } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Order status check
app.get('/kiosk/order/:id', (req, res) => {
  try {
    const order = get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    res.json({ success: true, order: { ...order, items: JSON.parse(order.items || '[]') } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'retail_kiosk_flow', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Retail Kiosk Flow Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
