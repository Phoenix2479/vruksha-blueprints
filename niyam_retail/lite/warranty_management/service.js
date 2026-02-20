const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8868;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'warranty_management', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'warranty_management' }));

// === WARRANTIES ===
app.get('/warranties', (req, res) => {
  try {
    const { customer_id, product_id, status, limit = 100 } = req.query;
    let sql = 'SELECT w.*, p.name as product_name, c.name as customer_name FROM warranties w LEFT JOIN products p ON w.product_id = p.id LEFT JOIN customers c ON w.customer_id = c.id WHERE 1=1';
    const params = [];
    if (customer_id) { sql += ' AND w.customer_id = ?'; params.push(customer_id); }
    if (product_id) { sql += ' AND w.product_id = ?'; params.push(product_id); }
    if (status) { sql += ' AND w.status = ?'; params.push(status); }
    sql += ' ORDER BY w.end_date LIMIT ?';
    params.push(parseInt(limit));
    res.json({ success: true, warranties: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/warranties/:id', (req, res) => {
  try {
    const warranty = get('SELECT w.*, p.name as product_name, c.name as customer_name FROM warranties w LEFT JOIN products p ON w.product_id = p.id LEFT JOIN customers c ON w.customer_id = c.id WHERE w.id = ?', [req.params.id]);
    if (!warranty) return res.status(404).json({ success: false, error: 'Warranty not found' });
    const claims = query('SELECT * FROM warranty_claims WHERE warranty_id = ? ORDER BY created_at DESC', [req.params.id]);
    res.json({ success: true, warranty, claims });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/warranties', (req, res) => {
  try {
    const { product_id, sale_id, customer_id, serial_number, start_date, end_date, type } = req.body;
    if (!product_id) return res.status(400).json({ success: false, error: 'product_id required' });
    const id = uuidv4();
    const startDt = start_date || new Date().toISOString();
    const endDt = end_date || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year default
    run(`INSERT INTO warranties (id, product_id, sale_id, customer_id, serial_number, start_date, end_date, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, product_id, sale_id, customer_id, serial_number, startDt, endDt, type || 'standard']);
    res.json({ success: true, warranty: { id, start_date: startDt, end_date: endDt, status: 'active' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Check warranty status
app.get('/warranties/check/:serial_number', (req, res) => {
  try {
    const warranty = get('SELECT w.*, p.name as product_name FROM warranties w LEFT JOIN products p ON w.product_id = p.id WHERE w.serial_number = ?', [req.params.serial_number]);
    if (!warranty) return res.status(404).json({ success: false, error: 'Warranty not found for this serial number' });
    
    const now = new Date();
    const endDate = new Date(warranty.end_date);
    const isValid = warranty.status === 'active' && endDate > now;
    const daysRemaining = isValid ? Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)) : 0;
    
    res.json({ success: true, warranty, valid: isValid, days_remaining: daysRemaining });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// === WARRANTY CLAIMS ===
app.get('/warranty-claims', (req, res) => {
  try {
    const { status, warranty_id, limit = 100 } = req.query;
    let sql = 'SELECT wc.*, w.serial_number, p.name as product_name FROM warranty_claims wc LEFT JOIN warranties w ON wc.warranty_id = w.id LEFT JOIN products p ON w.product_id = p.id WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND wc.status = ?'; params.push(status); }
    if (warranty_id) { sql += ' AND wc.warranty_id = ?'; params.push(warranty_id); }
    sql += ' ORDER BY wc.created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    res.json({ success: true, claims: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/warranty-claims', (req, res) => {
  try {
    const { warranty_id, customer_id, issue } = req.body;
    if (!warranty_id || !issue) return res.status(400).json({ success: false, error: 'warranty_id and issue required' });
    
    // Check warranty validity
    const warranty = get('SELECT * FROM warranties WHERE id = ?', [warranty_id]);
    if (!warranty) return res.status(404).json({ success: false, error: 'Warranty not found' });
    if (warranty.status !== 'active') return res.status(400).json({ success: false, error: 'Warranty not active' });
    if (new Date(warranty.end_date) < new Date()) return res.status(400).json({ success: false, error: 'Warranty expired' });
    
    const id = uuidv4();
    run('INSERT INTO warranty_claims (id, warranty_id, customer_id, issue) VALUES (?, ?, ?, ?)',
      [id, warranty_id, customer_id || warranty.customer_id, issue]);
    res.json({ success: true, claim: { id, status: 'pending' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.patch('/warranty-claims/:id', (req, res) => {
  try {
    const { status, resolution, cost } = req.body;
    const valid = ['pending', 'approved', 'rejected', 'in_progress', 'completed'];
    if (status && !valid.includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });
    const resolvedAt = status === 'completed' ? new Date().toISOString() : null;
    run('UPDATE warranty_claims SET status = COALESCE(?, status), resolution = COALESCE(?, resolution), cost = COALESCE(?, cost), resolved_at = COALESCE(?, resolved_at) WHERE id = ?',
      [status, resolution, cost, resolvedAt, req.params.id]);
    res.json({ success: true, message: 'Claim updated' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Expiring warranties
app.get('/warranties/expiring', (req, res) => {
  try {
    const { days = 30 } = req.query;
    const futureDate = new Date(Date.now() + parseInt(days) * 24 * 60 * 60 * 1000).toISOString();
    const warranties = query(`SELECT w.*, p.name as product_name, c.name as customer_name FROM warranties w 
      LEFT JOIN products p ON w.product_id = p.id LEFT JOIN customers c ON w.customer_id = c.id
      WHERE w.status = 'active' AND w.end_date <= ? AND w.end_date >= date('now') ORDER BY w.end_date`, [futureDate]);
    res.json({ success: true, warranties });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Warranty stats
app.get('/warranty/stats', (req, res) => {
  try {
    const stats = get(`SELECT COUNT(*) as total, 
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired FROM warranties`);
    const claims = get(`SELECT COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(cost) as total_cost FROM warranty_claims`);
    res.json({ success: true, warranties: stats || {}, claims: claims || {} });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'warranty_management', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Warranty Management Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
