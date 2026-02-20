const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8897;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

const initBridge = async () => {
  const db = await initDb();
  run(`CREATE TABLE IF NOT EXISTS marketplace_listings (
    id TEXT PRIMARY KEY, product_id TEXT, marketplace TEXT, external_id TEXT, status TEXT DEFAULT 'active',
    price REAL, quantity INTEGER, last_sync TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  return db;
};

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'marketplace_inventory_bridge', mode: 'lite' }));

// List marketplace connections
app.get('/marketplaces', (req, res) => {
  res.json({ success: true, marketplaces: ['amazon', 'ebay', 'shopify', 'etsy', 'walmart'] });
});

// List product listings
app.get('/listings', (req, res) => {
  try {
    const { marketplace, product_id } = req.query;
    let sql = 'SELECT ml.*, p.name as product_name, p.sku FROM marketplace_listings ml LEFT JOIN products p ON ml.product_id = p.id WHERE 1=1';
    const params = [];
    if (marketplace) { sql += ' AND ml.marketplace = ?'; params.push(marketplace); }
    if (product_id) { sql += ' AND ml.product_id = ?'; params.push(product_id); }
    sql += ' ORDER BY ml.marketplace, p.name';
    res.json({ success: true, listings: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Create listing
app.post('/listings', (req, res) => {
  try {
    const { product_id, marketplace, external_id, price } = req.body;
    if (!product_id || !marketplace) return res.status(400).json({ success: false, error: 'product_id and marketplace required' });
    
    const product = get('SELECT * FROM products WHERE id = ?', [product_id]);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
    
    const inv = get('SELECT quantity FROM inventory WHERE product_id = ?', [product_id]);
    const id = uuidv4();
    run('INSERT INTO marketplace_listings (id, product_id, marketplace, external_id, price, quantity, last_sync) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, product_id, marketplace, external_id, price || product.price, inv?.quantity || 0, new Date().toISOString()]);
    
    res.json({ success: true, listing: { id, marketplace, product_id } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Sync inventory to marketplaces
app.post('/sync', (req, res) => {
  try {
    const { marketplace } = req.body;
    let sql = 'SELECT ml.*, p.price as base_price FROM marketplace_listings ml JOIN products p ON ml.product_id = p.id WHERE ml.status = "active"';
    const params = [];
    if (marketplace) { sql += ' AND ml.marketplace = ?'; params.push(marketplace); }
    const listings = query(sql, params);
    
    let synced = 0;
    for (const listing of listings) {
      const inv = get('SELECT quantity FROM inventory WHERE product_id = ?', [listing.product_id]);
      run('UPDATE marketplace_listings SET quantity = ?, last_sync = ? WHERE id = ?',
        [inv?.quantity || 0, new Date().toISOString(), listing.id]);
      synced++;
    }
    
    res.json({ success: true, synced, message: `Synced ${synced} listings` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Update listing
app.put('/listings/:id', (req, res) => {
  try {
    const { price, status, external_id } = req.body;
    run('UPDATE marketplace_listings SET price = COALESCE(?, price), status = COALESCE(?, status), external_id = COALESCE(?, external_id) WHERE id = ?',
      [price, status, external_id, req.params.id]);
    res.json({ success: true, message: 'Listing updated' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Sync status
app.get('/sync/status', (req, res) => {
  try {
    const byMarketplace = query('SELECT marketplace, COUNT(*) as count, MAX(last_sync) as last_sync FROM marketplace_listings GROUP BY marketplace');
    const needsSync = get("SELECT COUNT(*) as count FROM marketplace_listings WHERE last_sync < datetime('now', '-1 hour') OR last_sync IS NULL");
    res.json({ success: true, status: { by_marketplace: byMarketplace, needs_sync: needsSync?.count || 0 } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'marketplace_inventory_bridge', mode: 'lite', status: 'running' });
});

initBridge().then(() => app.listen(PORT, () => console.log(`[Marketplace Inventory Bridge Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
