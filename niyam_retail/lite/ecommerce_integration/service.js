const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8816;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'ecommerce', mode: 'lite' }));

app.get('/api/products', (req, res) => {
  try {
    const products = query('SELECT p.*, i.quantity as stock FROM products p LEFT JOIN inventory i ON p.id = i.product_id WHERE p.active = 1');
    res.json({ success: true, data: products });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/orders', (req, res) => {
  try { res.json({ success: true, data: query('SELECT o.*, c.name as customer_name FROM orders o LEFT JOIN customers c ON o.customer_id = c.id ORDER BY o.created_at DESC') }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/orders', (req, res) => {
  try {
    const { customer_id, items, subtotal, shipping, tax, total, shipping_address } = req.body;
    const id = uuidv4();
    run('INSERT INTO orders (id, customer_id, items, subtotal, shipping, tax, total, shipping_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, customer_id, JSON.stringify(items), subtotal, shipping || 0, tax || 0, total, shipping_address]);
    const parsedItems = typeof items === 'string' ? JSON.parse(items) : items;
    for (const item of parsedItems) {
      const curr = get('SELECT quantity FROM inventory WHERE product_id = ?', [item.product_id]);
      run('UPDATE inventory SET quantity = ? WHERE product_id = ?', [(curr?.quantity || 0) - item.quantity, item.product_id]);
    }
    res.json({ success: true, data: { id } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/orders/:id/status', (req, res) => {
  try {
    const { status, tracking_number } = req.body;
    run('UPDATE orders SET status=?, tracking_number=? WHERE id=?', [status, tracking_number, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'ecommerce', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Ecommerce] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
