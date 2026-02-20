const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8865;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'asset_management', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'asset_management' }));

// List assets
app.get('/assets', (req, res) => {
  try {
    const { status, type, location_id, limit = 100 } = req.query;
    let sql = 'SELECT * FROM assets WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (type) { sql += ' AND type = ?'; params.push(type); }
    if (location_id) { sql += ' AND location_id = ?'; params.push(location_id); }
    sql += ' ORDER BY name LIMIT ?';
    params.push(parseInt(limit));
    const assets = query(sql, params);
    res.json({ success: true, assets });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/assets/:id', (req, res) => {
  try {
    const asset = get('SELECT * FROM assets WHERE id = ?', [req.params.id]);
    if (!asset) return res.status(404).json({ success: false, error: 'Asset not found' });
    const maintenanceLogs = query('SELECT * FROM maintenance_logs WHERE asset_id = ? ORDER BY performed_date DESC LIMIT 20', [req.params.id]);
    res.json({ success: true, asset, maintenance_logs: maintenanceLogs });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/assets', (req, res) => {
  try {
    const { name, type, serial_number, location_id, purchase_date, purchase_price, warranty_expiry, notes } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Name required' });
    const id = uuidv4();
    run(`INSERT INTO assets (id, name, type, serial_number, location_id, purchase_date, purchase_price, current_value, warranty_expiry, notes) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, type, serial_number, location_id, purchase_date, purchase_price || 0, purchase_price || 0, warranty_expiry, notes]);
    res.json({ success: true, asset: { id, name, status: 'active' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/assets/:id', (req, res) => {
  try {
    const { name, type, serial_number, location_id, current_value, status, warranty_expiry, notes } = req.body;
    run(`UPDATE assets SET name = COALESCE(?, name), type = COALESCE(?, type), serial_number = COALESCE(?, serial_number),
         location_id = COALESCE(?, location_id), current_value = COALESCE(?, current_value), status = COALESCE(?, status),
         warranty_expiry = COALESCE(?, warranty_expiry), notes = COALESCE(?, notes), updated_at = ? WHERE id = ?`,
      [name, type, serial_number, location_id, current_value, status, warranty_expiry, notes, new Date().toISOString(), req.params.id]);
    res.json({ success: true, message: 'Asset updated' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Log maintenance
app.post('/assets/:id/maintenance', (req, res) => {
  try {
    const { type, description, cost, performed_by, performed_date, next_due } = req.body;
    if (!type) return res.status(400).json({ success: false, error: 'Maintenance type required' });
    const id = uuidv4();
    const date = performed_date || new Date().toISOString();
    run('INSERT INTO maintenance_logs (id, asset_id, type, description, cost, performed_by, performed_date, next_due) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, req.params.id, type, description, cost || 0, performed_by, date, next_due]);
    run('UPDATE assets SET last_maintenance = ?, updated_at = ? WHERE id = ?', [date, new Date().toISOString(), req.params.id]);
    res.json({ success: true, maintenance_log: { id, type, performed_date: date } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get maintenance history
app.get('/assets/:id/maintenance', (req, res) => {
  try {
    const logs = query('SELECT * FROM maintenance_logs WHERE asset_id = ? ORDER BY performed_date DESC', [req.params.id]);
    res.json({ success: true, maintenance_logs: logs });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Upcoming maintenance
app.get('/maintenance/upcoming', (req, res) => {
  try {
    const { days = 30 } = req.query;
    const futureDate = new Date(Date.now() + parseInt(days) * 24 * 60 * 60 * 1000).toISOString();
    const logs = query(`SELECT ml.*, a.name as asset_name FROM maintenance_logs ml 
                        LEFT JOIN assets a ON ml.asset_id = a.id 
                        WHERE ml.next_due IS NOT NULL AND ml.next_due <= ? ORDER BY ml.next_due`, [futureDate]);
    res.json({ success: true, upcoming_maintenance: logs });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Asset depreciation
app.post('/assets/:id/depreciate', (req, res) => {
  try {
    const { depreciation_rate = 10 } = req.body; // default 10% annual
    const asset = get('SELECT * FROM assets WHERE id = ?', [req.params.id]);
    if (!asset) return res.status(404).json({ success: false, error: 'Asset not found' });
    const newValue = asset.current_value * (1 - depreciation_rate / 100);
    run('UPDATE assets SET current_value = ?, updated_at = ? WHERE id = ?', [newValue, new Date().toISOString(), req.params.id]);
    res.json({ success: true, previous_value: asset.current_value, new_value: newValue, depreciation_rate });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Asset stats
app.get('/assets/stats', (req, res) => {
  try {
    const stats = get('SELECT COUNT(*) as total, SUM(current_value) as total_value, SUM(CASE WHEN status = "active" THEN 1 ELSE 0 END) as active FROM assets');
    const byType = query('SELECT type, COUNT(*) as count, SUM(current_value) as value FROM assets GROUP BY type');
    res.json({ success: true, stats: stats || {}, by_type: byType });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Warranty expiring soon
app.get('/assets/warranty-expiring', (req, res) => {
  try {
    const { days = 30 } = req.query;
    const futureDate = new Date(Date.now() + parseInt(days) * 24 * 60 * 60 * 1000).toISOString();
    const assets = query(`SELECT * FROM assets WHERE warranty_expiry IS NOT NULL AND warranty_expiry <= ? AND warranty_expiry >= date('now') ORDER BY warranty_expiry`, [futureDate]);
    res.json({ success: true, assets });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'asset_management', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Asset Management Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
