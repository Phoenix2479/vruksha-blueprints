const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8887;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

const initPickup = async () => {
  const db = await initDb();
  run(`CREATE TABLE IF NOT EXISTS pickup_schedules (
    id TEXT PRIMARY KEY, order_id TEXT, customer_id TEXT, customer_name TEXT, customer_phone TEXT,
    pickup_date TEXT, pickup_time TEXT, status TEXT DEFAULT 'scheduled', vehicle_info TEXT, notes TEXT,
    checked_in_at TEXT, completed_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  return db;
};

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'curbside_pickup_scheduler', mode: 'lite' }));

app.get('/pickups', (req, res) => {
  try {
    const { date, status } = req.query;
    let sql = 'SELECT * FROM pickup_schedules WHERE 1=1';
    const params = [];
    if (date) { sql += ' AND pickup_date = ?'; params.push(date); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY pickup_date, pickup_time';
    res.json({ success: true, pickups: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/pickups', (req, res) => {
  try {
    const { order_id, customer_id, customer_name, customer_phone, pickup_date, pickup_time, vehicle_info, notes } = req.body;
    if (!pickup_date || !pickup_time) return res.status(400).json({ success: false, error: 'pickup_date and pickup_time required' });
    const id = uuidv4();
    run(`INSERT INTO pickup_schedules (id, order_id, customer_id, customer_name, customer_phone, pickup_date, pickup_time, vehicle_info, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, order_id, customer_id, customer_name, customer_phone, pickup_date, pickup_time, vehicle_info, notes]);
    res.json({ success: true, pickup: { id, pickup_date, pickup_time, status: 'scheduled' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/pickups/:id/checkin', (req, res) => {
  try {
    run('UPDATE pickup_schedules SET status = ?, checked_in_at = ? WHERE id = ?', ['checked_in', new Date().toISOString(), req.params.id]);
    res.json({ success: true, message: 'Customer checked in' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/pickups/:id/complete', (req, res) => {
  try {
    run('UPDATE pickup_schedules SET status = ?, completed_at = ? WHERE id = ?', ['completed', new Date().toISOString(), req.params.id]);
    res.json({ success: true, message: 'Pickup completed' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/pickups/today', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const pickups = query('SELECT * FROM pickup_schedules WHERE pickup_date = ? ORDER BY pickup_time', [today]);
    res.json({ success: true, pickups, date: today });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'curbside_pickup_scheduler', mode: 'lite', status: 'running' });
});

initPickup().then(() => app.listen(PORT, () => console.log(`[Curbside Pickup Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
