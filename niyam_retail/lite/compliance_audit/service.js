const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8873;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'compliance_audit', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'compliance_audit' }));

// Get audit log
app.get('/audit-log', (req, res) => {
  try {
    const { user_id, action, entity_type, from_date, to_date, limit = 100 } = req.query;
    let sql = 'SELECT * FROM audit_log WHERE 1=1';
    const params = [];
    if (user_id) { sql += ' AND user_id = ?'; params.push(user_id); }
    if (action) { sql += ' AND action = ?'; params.push(action); }
    if (entity_type) { sql += ' AND entity_type = ?'; params.push(entity_type); }
    if (from_date) { sql += ' AND created_at >= ?'; params.push(from_date); }
    if (to_date) { sql += ' AND created_at <= ?'; params.push(to_date); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    res.json({ success: true, audit_log: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Log audit event
app.post('/audit-log', (req, res) => {
  try {
    const { user_id, action, entity_type, entity_id, old_value, new_value, ip_address } = req.body;
    if (!action) return res.status(400).json({ success: false, error: 'Action required' });
    const id = uuidv4();
    run('INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, old_value, new_value, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, user_id, action, entity_type, entity_id, old_value ? JSON.stringify(old_value) : null, new_value ? JSON.stringify(new_value) : null, ip_address]);
    res.json({ success: true, audit_entry: { id, action } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get entity history
app.get('/audit-log/entity/:entity_type/:entity_id', (req, res) => {
  try {
    const { entity_type, entity_id } = req.params;
    const history = query('SELECT * FROM audit_log WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC', [entity_type, entity_id]);
    res.json({ success: true, history });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Audit summary
app.get('/audit-log/summary', (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    let dateFilter = '';
    const params = [];
    if (from_date) { dateFilter += ' AND created_at >= ?'; params.push(from_date); }
    if (to_date) { dateFilter += ' AND created_at <= ?'; params.push(to_date); }
    
    const byAction = query(`SELECT action, COUNT(*) as count FROM audit_log WHERE 1=1${dateFilter} GROUP BY action ORDER BY count DESC`, params);
    const byUser = query(`SELECT user_id, COUNT(*) as count FROM audit_log WHERE user_id IS NOT NULL${dateFilter} GROUP BY user_id ORDER BY count DESC LIMIT 10`, params);
    const byEntity = query(`SELECT entity_type, COUNT(*) as count FROM audit_log WHERE entity_type IS NOT NULL${dateFilter} GROUP BY entity_type ORDER BY count DESC`, params);
    
    res.json({ success: true, summary: { by_action: byAction, by_user: byUser, by_entity: byEntity } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Compliance checks (simple rules)
app.get('/compliance/check', (req, res) => {
  try {
    const issues = [];
    
    // Check for products without prices
    const noPrice = get('SELECT COUNT(*) as count FROM products WHERE price = 0 OR price IS NULL');
    if (noPrice?.count > 0) issues.push({ type: 'warning', message: `${noPrice.count} products have no price set` });
    
    // Check for low inventory
    const lowStock = get('SELECT COUNT(*) as count FROM inventory WHERE quantity <= min_quantity AND min_quantity > 0');
    if (lowStock?.count > 0) issues.push({ type: 'warning', message: `${lowStock.count} items are at or below minimum stock` });
    
    // Check for unfiled tax reports
    const unfiledTax = get("SELECT COUNT(*) as count FROM tax_reports WHERE status = 'draft'");
    if (unfiledTax?.count > 0) issues.push({ type: 'info', message: `${unfiledTax.count} tax reports pending filing` });
    
    // Check for expired warranties still active
    const expiredWarranties = get("SELECT COUNT(*) as count FROM warranties WHERE status = 'active' AND end_date < date('now')");
    if (expiredWarranties?.count > 0) issues.push({ type: 'info', message: `${expiredWarranties.count} warranties need status update (expired)` });
    
    res.json({ success: true, compliant: issues.length === 0, issues });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Export audit log
app.get('/audit-log/export', (req, res) => {
  try {
    const { from_date, to_date, format = 'json' } = req.query;
    let sql = 'SELECT * FROM audit_log WHERE 1=1';
    const params = [];
    if (from_date) { sql += ' AND created_at >= ?'; params.push(from_date); }
    if (to_date) { sql += ' AND created_at <= ?'; params.push(to_date); }
    sql += ' ORDER BY created_at DESC';
    const data = query(sql, params);
    
    if (format === 'csv') {
      const header = 'id,user_id,action,entity_type,entity_id,created_at\n';
      const rows = data.map(r => `${r.id},${r.user_id || ''},${r.action},${r.entity_type || ''},${r.entity_id || ''},${r.created_at}`).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=audit_log.csv');
      res.send(header + rows);
    } else {
      res.json({ success: true, data });
    }
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'compliance_audit', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Compliance Audit Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
