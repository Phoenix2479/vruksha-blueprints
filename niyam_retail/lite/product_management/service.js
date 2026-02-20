const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8883;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'product_management', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'product_management' }));

// List products
app.get('/products', (req, res) => {
  try {
    const { category, active = '1', search, limit = 100 } = req.query;
    let sql = 'SELECT p.*, i.quantity as stock FROM products p LEFT JOIN inventory i ON p.id = i.product_id WHERE p.active = ?';
    const params = [parseInt(active)];
    if (category) { sql += ' AND p.category = ?'; params.push(category); }
    if (search) { sql += ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    sql += ' ORDER BY p.name LIMIT ?';
    params.push(parseInt(limit));
    res.json({ success: true, products: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/products/:id', (req, res) => {
  try {
    const product = get('SELECT p.*, i.quantity as stock, i.min_quantity, i.max_quantity FROM products p LEFT JOIN inventory i ON p.id = i.product_id WHERE p.id = ?', [req.params.id]);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
    res.json({ success: true, product });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/products', (req, res) => {
  try {
    const { sku, name, description, category, price, cost, tax_rate, barcode, image_url, initial_stock } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Name required' });
    
    const id = uuidv4();
    const productSku = sku || `SKU-${Date.now()}`;
    run(`INSERT INTO products (id, sku, name, description, category, price, cost, tax_rate, barcode, image_url) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, productSku, name, description, category, price || 0, cost || 0, tax_rate || 0, barcode, image_url]);
    
    if (initial_stock !== undefined) {
      run('INSERT INTO inventory (id, product_id, quantity) VALUES (?, ?, ?)', [uuidv4(), id, initial_stock]);
    }
    
    res.json({ success: true, product: { id, sku: productSku, name } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/products/:id', (req, res) => {
  try {
    const { name, description, category, price, cost, tax_rate, barcode, image_url, active } = req.body;
    run(`UPDATE products SET name = COALESCE(?, name), description = COALESCE(?, description), category = COALESCE(?, category),
         price = COALESCE(?, price), cost = COALESCE(?, cost), tax_rate = COALESCE(?, tax_rate), barcode = COALESCE(?, barcode),
         image_url = COALESCE(?, image_url), active = COALESCE(?, active), updated_at = ? WHERE id = ?`,
      [name, description, category, price, cost, tax_rate, barcode, image_url, active, new Date().toISOString(), req.params.id]);
    res.json({ success: true, message: 'Product updated' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/products/:id', (req, res) => {
  try {
    run('UPDATE products SET active = 0, updated_at = ? WHERE id = ?', [new Date().toISOString(), req.params.id]);
    res.json({ success: true, message: 'Product deactivated' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Bulk import
app.post('/products/bulk', (req, res) => {
  try {
    const { products } = req.body;
    if (!products || !Array.isArray(products)) return res.status(400).json({ success: false, error: 'products array required' });
    let imported = 0;
    for (const p of products) {
      if (p.name) {
        const id = uuidv4();
        run(`INSERT INTO products (id, sku, name, description, category, price, cost, tax_rate, barcode) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, p.sku || `SKU-${Date.now()}-${imported}`, p.name, p.description, p.category, p.price || 0, p.cost || 0, p.tax_rate || 0, p.barcode]);
        imported++;
      }
    }
    res.json({ success: true, imported });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Categories
app.get('/categories', (req, res) => {
  try {
    const categories = query('SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND active = 1 ORDER BY category');
    res.json({ success: true, categories: categories.map(c => c.category) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Product stats
app.get('/products/stats', (req, res) => {
  try {
    const total = get('SELECT COUNT(*) as count FROM products WHERE active = 1');
    const noStock = get('SELECT COUNT(*) as count FROM products p LEFT JOIN inventory i ON p.id = i.product_id WHERE p.active = 1 AND (i.quantity IS NULL OR i.quantity = 0)');
    const byCategory = query('SELECT category, COUNT(*) as count FROM products WHERE active = 1 AND category IS NOT NULL GROUP BY category');
    res.json({ success: true, stats: { total: total?.count || 0, no_stock: noStock?.count || 0, by_category: byCategory } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'product_management', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Product Management Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
