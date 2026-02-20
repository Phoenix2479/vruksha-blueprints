const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8899;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'quality_control', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'quality_control' }));

// List quality checks
app.get('/quality-checks', (req, res) => {
  try {
    const { status, product_id, limit = 100 } = req.query;
    let sql = 'SELECT qc.*, p.name as product_name FROM quality_checks qc LEFT JOIN products p ON qc.product_id = p.id WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND qc.status = ?'; params.push(status); }
    if (product_id) { sql += ' AND qc.product_id = ?'; params.push(product_id); }
    sql += ' ORDER BY qc.created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    const checks = query(sql, params);
    res.json({ success: true, quality_checks: checks });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get single check
app.get('/quality-checks/:id', (req, res) => {
  try {
    const check = get('SELECT qc.*, p.name as product_name FROM quality_checks qc LEFT JOIN products p ON qc.product_id = p.id WHERE qc.id = ?', [req.params.id]);
    if (!check) return res.status(404).json({ success: false, error: 'Check not found' });
    res.json({ success: true, quality_check: { ...check, defects: JSON.parse(check.defects || '[]') } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Create quality check
app.post('/quality-checks', (req, res) => {
  try {
    const { product_id, batch_number, inspector_id, check_type, notes } = req.body;
    if (!product_id) return res.status(400).json({ success: false, error: 'product_id required' });
    const id = uuidv4();
    run('INSERT INTO quality_checks (id, product_id, batch_number, inspector_id, check_type, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [id, product_id, batch_number, inspector_id, check_type || 'standard', notes]);
    res.json({ success: true, quality_check: { id, status: 'pending' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Complete quality check
app.post('/quality-checks/:id/complete', (req, res) => {
  try {
    const { score, status, defects, notes } = req.body;
    if (!status) return res.status(400).json({ success: false, error: 'status required' });
    const valid = ['passed', 'failed', 'needs_review'];
    if (!valid.includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });
    
    run('UPDATE quality_checks SET score = ?, status = ?, defects = ?, notes = COALESCE(?, notes) WHERE id = ?',
      [score, status, defects ? JSON.stringify(defects) : null, notes, req.params.id]);
    res.json({ success: true, message: 'Quality check completed' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Add defect
app.post('/quality-checks/:id/defects', (req, res) => {
  try {
    const { type, severity, description, quantity } = req.body;
    if (!type) return res.status(400).json({ success: false, error: 'defect type required' });
    
    const check = get('SELECT * FROM quality_checks WHERE id = ?', [req.params.id]);
    if (!check) return res.status(404).json({ success: false, error: 'Check not found' });
    
    const defects = JSON.parse(check.defects || '[]');
    defects.push({ id: uuidv4(), type, severity: severity || 'minor', description, quantity: quantity || 1, reported_at: new Date().toISOString() });
    
    run('UPDATE quality_checks SET defects = ? WHERE id = ?', [JSON.stringify(defects), req.params.id]);
    res.json({ success: true, message: 'Defect added', defects });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Quality stats
app.get('/quality/stats', (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    let sql = 'SELECT status, COUNT(*) as count FROM quality_checks WHERE 1=1';
    const params = [];
    if (from_date) { sql += ' AND created_at >= ?'; params.push(from_date); }
    if (to_date) { sql += ' AND created_at <= ?'; params.push(to_date); }
    sql += ' GROUP BY status';
    const stats = query(sql, params);
    
    const avgScore = get('SELECT AVG(score) as avg FROM quality_checks WHERE score IS NOT NULL');
    
    res.json({ success: true, stats, average_score: avgScore?.avg || 0 });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Product quality history
app.get('/products/:product_id/quality', (req, res) => {
  try {
    const checks = query('SELECT * FROM quality_checks WHERE product_id = ? ORDER BY created_at DESC LIMIT 50', [req.params.product_id]);
    const avgScore = get('SELECT AVG(score) as avg FROM quality_checks WHERE product_id = ? AND score IS NOT NULL', [req.params.product_id]);
    res.json({ success: true, quality_checks: checks, average_score: avgScore?.avg || 0 });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'quality_control', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Quality Control Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
