const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8878;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'competitor_analysis', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'competitor_analysis' }));

// List competitor prices
app.get('/competitor-prices', (req, res) => {
  try {
    const { product_id, competitor_name, limit = 100 } = req.query;
    let sql = 'SELECT cp.*, p.name as product_name, p.sku, p.price as our_price FROM competitor_prices cp LEFT JOIN products p ON cp.product_id = p.id WHERE 1=1';
    const params = [];
    if (product_id) { sql += ' AND cp.product_id = ?'; params.push(product_id); }
    if (competitor_name) { sql += ' AND cp.competitor_name = ?'; params.push(competitor_name); }
    sql += ' ORDER BY cp.checked_at DESC LIMIT ?';
    params.push(parseInt(limit));
    const prices = query(sql, params);
    res.json({ success: true, prices: prices.map(p => ({ ...p, price_diff: p.our_price - p.price, price_diff_percent: p.our_price > 0 ? ((p.our_price - p.price) / p.our_price * 100) : 0 })) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Add competitor price
app.post('/competitor-prices', (req, res) => {
  try {
    const { product_id, competitor_name, price, url } = req.body;
    if (!product_id || !competitor_name || price === undefined) {
      return res.status(400).json({ success: false, error: 'product_id, competitor_name, price required' });
    }
    const id = uuidv4();
    run('INSERT INTO competitor_prices (id, product_id, competitor_name, price, url, checked_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, product_id, competitor_name, price, url, new Date().toISOString()]);
    res.json({ success: true, entry: { id, product_id, competitor_name, price } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Bulk update prices
app.post('/competitor-prices/bulk', (req, res) => {
  try {
    const { prices } = req.body;
    if (!prices || !Array.isArray(prices)) return res.status(400).json({ success: false, error: 'prices array required' });
    let added = 0;
    for (const p of prices) {
      if (p.product_id && p.competitor_name && p.price !== undefined) {
        const id = uuidv4();
        run('INSERT INTO competitor_prices (id, product_id, competitor_name, price, url, checked_at) VALUES (?, ?, ?, ?, ?, ?)',
          [id, p.product_id, p.competitor_name, p.price, p.url, new Date().toISOString()]);
        added++;
      }
    }
    res.json({ success: true, added });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Price comparison for product
app.get('/competitor-prices/compare/:product_id', (req, res) => {
  try {
    const product = get('SELECT * FROM products WHERE id = ?', [req.params.product_id]);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
    
    const competitors = query(`SELECT competitor_name, price, url, checked_at FROM competitor_prices 
      WHERE product_id = ? ORDER BY checked_at DESC`, [req.params.product_id]);
    
    // Get latest price per competitor
    const latest = {};
    for (const c of competitors) {
      if (!latest[c.competitor_name]) latest[c.competitor_name] = c;
    }
    
    const comparison = Object.values(latest).map(c => ({
      ...c,
      our_price: product.price,
      difference: product.price - c.price,
      we_are: product.price > c.price ? 'higher' : product.price < c.price ? 'lower' : 'same'
    }));
    
    res.json({ success: true, product: { id: product.id, name: product.name, price: product.price }, competitors: comparison });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Products where we're more expensive
app.get('/competitor-prices/overpriced', (req, res) => {
  try {
    const { threshold = 0 } = req.query;
    const results = query(`SELECT p.id, p.name, p.sku, p.price as our_price, cp.competitor_name, cp.price as competitor_price,
      (p.price - cp.price) as difference
      FROM products p
      JOIN competitor_prices cp ON p.id = cp.product_id
      WHERE p.price > cp.price + ?
      ORDER BY difference DESC`, [parseFloat(threshold)]);
    res.json({ success: true, products: results });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Competitors list
app.get('/competitors', (req, res) => {
  try {
    const competitors = query('SELECT DISTINCT competitor_name, COUNT(*) as products_tracked FROM competitor_prices GROUP BY competitor_name ORDER BY products_tracked DESC');
    res.json({ success: true, competitors });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Price history for product
app.get('/competitor-prices/history/:product_id', (req, res) => {
  try {
    const { competitor_name } = req.query;
    let sql = 'SELECT * FROM competitor_prices WHERE product_id = ?';
    const params = [req.params.product_id];
    if (competitor_name) { sql += ' AND competitor_name = ?'; params.push(competitor_name); }
    sql += ' ORDER BY checked_at DESC LIMIT 100';
    res.json({ success: true, history: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Summary
app.get('/competitor-prices/summary', (req, res) => {
  try {
    const total = get('SELECT COUNT(DISTINCT product_id) as products, COUNT(DISTINCT competitor_name) as competitors FROM competitor_prices');
    const overpriced = get(`SELECT COUNT(DISTINCT p.id) as count FROM products p 
      JOIN competitor_prices cp ON p.id = cp.product_id WHERE p.price > cp.price`);
    const underpriced = get(`SELECT COUNT(DISTINCT p.id) as count FROM products p 
      JOIN competitor_prices cp ON p.id = cp.product_id WHERE p.price < cp.price`);
    res.json({
      success: true,
      summary: {
        products_tracked: total?.products || 0,
        competitors_tracked: total?.competitors || 0,
        products_overpriced: overpriced?.count || 0,
        products_underpriced: underpriced?.count || 0
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'competitor_analysis', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Competitor Analysis Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
