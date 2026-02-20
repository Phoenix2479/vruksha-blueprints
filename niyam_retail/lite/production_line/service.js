const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8896;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

const initProd = async () => {
  const db = await initDb();
  run(`CREATE TABLE IF NOT EXISTS production_orders (
    id TEXT PRIMARY KEY, product_id TEXT, quantity INTEGER, status TEXT DEFAULT 'pending',
    priority INTEGER DEFAULT 0, notes TEXT, started_at TEXT, completed_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  return db;
};

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'production_line', mode: 'lite' }));

// List production orders
app.get('/production', (req, res) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT po.*, p.name as product_name FROM production_orders po LEFT JOIN products p ON po.product_id = p.id WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND po.status = ?'; params.push(status); }
    sql += ' ORDER BY po.priority DESC, po.created_at';
    res.json({ success: true, orders: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Create production order
app.post('/production', (req, res) => {
  try {
    const { product_id, quantity, priority, notes } = req.body;
    if (!product_id || !quantity) return res.status(400).json({ success: false, error: 'product_id and quantity required' });
    const id = uuidv4();
    run('INSERT INTO production_orders (id, product_id, quantity, priority, notes) VALUES (?, ?, ?, ?, ?)',
      [id, product_id, quantity, priority || 0, notes]);
    res.json({ success: true, order: { id, product_id, quantity, status: 'pending' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Start production
app.post('/production/:id/start', (req, res) => {
  try {
    run('UPDATE production_orders SET status = ?, started_at = ? WHERE id = ?', ['in_progress', new Date().toISOString(), req.params.id]);
    res.json({ success: true, message: 'Production started' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Complete production
app.post('/production/:id/complete', (req, res) => {
  try {
    const order = get('SELECT * FROM production_orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    
    run('UPDATE production_orders SET status = ?, completed_at = ? WHERE id = ?', ['completed', new Date().toISOString(), req.params.id]);
    
    // Add to inventory
    const inv = get('SELECT * FROM inventory WHERE product_id = ?', [order.product_id]);
    if (inv) {
      run('UPDATE inventory SET quantity = ?, updated_at = ? WHERE product_id = ?',
        [inv.quantity + order.quantity, new Date().toISOString(), order.product_id]);
    } else {
      run('INSERT INTO inventory (id, product_id, quantity) VALUES (?, ?, ?)', [uuidv4(), order.product_id, order.quantity]);
    }
    
    res.json({ success: true, message: 'Production completed, inventory updated' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Production stats
app.get('/production/stats', (req, res) => {
  try {
    const pending = get("SELECT COUNT(*) as count FROM production_orders WHERE status = 'pending'");
    const inProgress = get("SELECT COUNT(*) as count FROM production_orders WHERE status = 'in_progress'");
    const completedToday = get("SELECT COUNT(*) as count FROM production_orders WHERE status = 'completed' AND date(completed_at) = date('now')");
    res.json({ success: true, stats: { pending: pending?.count || 0, in_progress: inProgress?.count || 0, completed_today: completedToday?.count || 0 } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'production_line', mode: 'lite', status: 'running' });
});

initProd().then(() => app.listen(PORT, () => console.log(`[Production Line Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
