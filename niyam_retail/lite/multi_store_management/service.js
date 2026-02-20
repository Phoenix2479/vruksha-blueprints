const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8874;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'multi_store_management', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'multi_store_management' }));

// List stores
app.get('/stores', (req, res) => {
  try {
    const { active = '1' } = req.query;
    const stores = query('SELECT * FROM stores WHERE active = ? ORDER BY name', [parseInt(active)]);
    res.json({ success: true, stores });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/stores/:id', (req, res) => {
  try {
    const store = get('SELECT * FROM stores WHERE id = ?', [req.params.id]);
    if (!store) return res.status(404).json({ success: false, error: 'Store not found' });
    res.json({ success: true, store });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/stores', (req, res) => {
  try {
    const { name, address, phone, email, manager } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Name required' });
    const id = uuidv4();
    run('INSERT INTO stores (id, name, address, phone, email, manager) VALUES (?, ?, ?, ?, ?, ?)',
      [id, name, address, phone, email, manager]);
    res.json({ success: true, store: { id, name } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/stores/:id', (req, res) => {
  try {
    const { name, address, phone, email, manager, active } = req.body;
    run(`UPDATE stores SET name = COALESCE(?, name), address = COALESCE(?, address), phone = COALESCE(?, phone),
         email = COALESCE(?, email), manager = COALESCE(?, manager), active = COALESCE(?, active) WHERE id = ?`,
      [name, address, phone, email, manager, active, req.params.id]);
    res.json({ success: true, message: 'Store updated' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Store inventory
app.get('/stores/:id/inventory', (req, res) => {
  try {
    const inventory = query(`SELECT i.*, p.name as product_name, p.sku FROM inventory i 
      LEFT JOIN products p ON i.product_id = p.id WHERE i.location = ?`, [req.params.id]);
    res.json({ success: true, inventory });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Store sales
app.get('/stores/:id/sales', (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    let sql = 'SELECT * FROM sales WHERE 1=1'; // Would need store_id in sales table
    const params = [];
    if (from_date) { sql += ' AND created_at >= ?'; params.push(from_date); }
    if (to_date) { sql += ' AND created_at <= ?'; params.push(to_date); }
    sql += ' ORDER BY created_at DESC LIMIT 100';
    res.json({ success: true, sales: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Transfer inventory between stores
app.post('/stores/transfer', (req, res) => {
  try {
    const { from_store, to_store, product_id, quantity } = req.body;
    if (!from_store || !to_store || !product_id || !quantity) {
      return res.status(400).json({ success: false, error: 'from_store, to_store, product_id, quantity required' });
    }
    
    // Check source inventory
    const source = get('SELECT * FROM inventory WHERE product_id = ? AND location = ?', [product_id, from_store]);
    if (!source || source.quantity < quantity) {
      return res.status(400).json({ success: false, error: 'Insufficient inventory at source' });
    }
    
    // Deduct from source
    run('UPDATE inventory SET quantity = ?, updated_at = ? WHERE product_id = ? AND location = ?',
      [source.quantity - quantity, new Date().toISOString(), product_id, from_store]);
    
    // Add to destination
    const dest = get('SELECT * FROM inventory WHERE product_id = ? AND location = ?', [product_id, to_store]);
    if (dest) {
      run('UPDATE inventory SET quantity = ?, updated_at = ? WHERE product_id = ? AND location = ?',
        [dest.quantity + quantity, new Date().toISOString(), product_id, to_store]);
    } else {
      run('INSERT INTO inventory (id, product_id, location, quantity) VALUES (?, ?, ?, ?)',
        [uuidv4(), product_id, to_store, quantity]);
    }
    
    res.json({ success: true, message: 'Transfer completed', transferred: quantity });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Store comparison
app.get('/stores/compare', (req, res) => {
  try {
    const stores = query('SELECT * FROM stores WHERE active = 1');
    const comparison = stores.map(store => {
      const invValue = get('SELECT SUM(i.quantity * p.price) as value FROM inventory i JOIN products p ON i.product_id = p.id WHERE i.location = ?', [store.id]);
      const itemCount = get('SELECT COUNT(*) as count FROM inventory WHERE location = ?', [store.id]);
      return { ...store, inventory_value: invValue?.value || 0, item_count: itemCount?.count || 0 };
    });
    res.json({ success: true, stores: comparison });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Store stats
app.get('/stores/stats', (req, res) => {
  try {
    const total = get('SELECT COUNT(*) as count FROM stores');
    const active = get('SELECT COUNT(*) as count FROM stores WHERE active = 1');
    res.json({ success: true, stats: { total: total?.count || 0, active: active?.count || 0 } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'multi_store_management', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Multi-Store Management Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
