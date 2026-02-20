const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8815;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'product_catalog', mode: 'lite' }));

app.get('/api/products', (req, res) => {
  try {
    const { category, search } = req.query;
    let products = query('SELECT * FROM products WHERE active = 1');
    if (category) products = products.filter(p => p.category === category);
    if (search) products = products.filter(p => p.name?.toLowerCase().includes(search.toLowerCase()) || p.description?.toLowerCase().includes(search.toLowerCase()));
    res.json({ success: true, data: products });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/categories', (req, res) => {
  try {
    const products = query('SELECT DISTINCT category FROM products WHERE active = 1 AND category IS NOT NULL');
    res.json({ success: true, data: products.map(p => p.category).filter(Boolean) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'product_catalog', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Product Catalog] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
