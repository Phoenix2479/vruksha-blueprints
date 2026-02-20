/**
 * Workforce Scheduling Service - Niyam Hospitality (Max Lite)
 * Staff scheduling, shifts, time tracking, labor management
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8936;
const SERVICE_NAME = 'workforce_scheduling';

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) { app.use(express.static(uiPath)); }

app.get('/health', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME, mode: 'lite' }));

async function ensureTables() {
  const db = await initDb();
  
  db.run(`CREATE TABLE IF NOT EXISTS staff_members (
    id TEXT PRIMARY KEY, employee_id TEXT UNIQUE, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
    email TEXT, phone TEXT, department TEXT, position TEXT, hourly_rate REAL,
    employment_type TEXT DEFAULT 'full_time', hire_date TEXT, skills TEXT,
    certifications TEXT, max_hours_per_week INTEGER DEFAULT 40, is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS shift_templates (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, department TEXT, start_time TEXT NOT NULL,
    end_time TEXT NOT NULL, break_minutes INTEGER DEFAULT 30, color TEXT,
    is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS scheduled_shifts (
    id TEXT PRIMARY KEY, staff_id TEXT NOT NULL, template_id TEXT, shift_date TEXT NOT NULL,
    start_time TEXT NOT NULL, end_time TEXT NOT NULL, break_minutes INTEGER DEFAULT 30,
    department TEXT, position TEXT, notes TEXT, status TEXT DEFAULT 'scheduled',
    published INTEGER DEFAULT 0, published_at TEXT, created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS time_entries (
    id TEXT PRIMARY KEY, staff_id TEXT NOT NULL, shift_id TEXT, entry_date TEXT NOT NULL,
    clock_in TEXT, clock_out TEXT, break_start TEXT, break_end TEXT,
    total_hours REAL, overtime_hours REAL DEFAULT 0, status TEXT DEFAULT 'pending',
    approved_by TEXT, approved_at TEXT, notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS time_off_requests (
    id TEXT PRIMARY KEY, staff_id TEXT NOT NULL, request_type TEXT NOT NULL,
    start_date TEXT NOT NULL, end_date TEXT NOT NULL, reason TEXT,
    status TEXT DEFAULT 'pending', reviewed_by TEXT, reviewed_at TEXT, review_notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS shift_swaps (
    id TEXT PRIMARY KEY, original_shift_id TEXT NOT NULL, requesting_staff_id TEXT NOT NULL,
    target_staff_id TEXT, status TEXT DEFAULT 'open', approved_by TEXT, approved_at TEXT,
    notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS labor_budgets (
    id TEXT PRIMARY KEY, department TEXT NOT NULL, period_start TEXT NOT NULL,
    period_end TEXT NOT NULL, budgeted_hours REAL, budgeted_amount REAL,
    actual_hours REAL DEFAULT 0, actual_amount REAL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  return db;
}

// STAFF
app.get('/staff', async (req, res) => {
  try {
    await ensureTables();
    const { department, position, active_only } = req.query;
    let sql = `SELECT * FROM staff_members WHERE 1=1`;
    const params = [];
    if (department) { sql += ` AND department = ?`; params.push(department); }
    if (position) { sql += ` AND position = ?`; params.push(position); }
    if (active_only === 'true') { sql += ` AND is_active = 1`; }
    sql += ` ORDER BY last_name, first_name`;
    res.json({ success: true, staff: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/staff/:id', async (req, res) => {
  try {
    await ensureTables();
    const staff = get(`SELECT * FROM staff_members WHERE id = ?`, [req.params.id]);
    if (!staff) return res.status(404).json({ success: false, error: 'Staff not found' });
    res.json({ success: true, staff: { ...staff, skills: JSON.parse(staff.skills || '[]'), certifications: JSON.parse(staff.certifications || '[]') } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/staff', async (req, res) => {
  try {
    await ensureTables();
    const { employee_id, first_name, last_name, email, phone, department, position, hourly_rate, employment_type, hire_date, skills, certifications, max_hours_per_week } = req.body;
    const id = generateId();
    const empId = employee_id || `EMP${Date.now().toString(36).toUpperCase()}`;
    run(`INSERT INTO staff_members (id, employee_id, first_name, last_name, email, phone, department, position, hourly_rate, employment_type, hire_date, skills, certifications, max_hours_per_week, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, empId, first_name, last_name, email, phone, department, position, hourly_rate, employment_type || 'full_time', hire_date, JSON.stringify(skills || []), JSON.stringify(certifications || []), max_hours_per_week || 40, timestamp()]);
    res.json({ success: true, staff: { id, employee_id: empId, name: `${first_name} ${last_name}` } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/staff/:id', async (req, res) => {
  try {
    await ensureTables();
    const { first_name, last_name, email, phone, department, position, hourly_rate, employment_type, skills, certifications, max_hours_per_week, is_active } = req.body;
    run(`UPDATE staff_members SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name), email = COALESCE(?, email), phone = COALESCE(?, phone), department = COALESCE(?, department), position = COALESCE(?, position), hourly_rate = COALESCE(?, hourly_rate), employment_type = COALESCE(?, employment_type), skills = COALESCE(?, skills), certifications = COALESCE(?, certifications), max_hours_per_week = COALESCE(?, max_hours_per_week), is_active = COALESCE(?, is_active) WHERE id = ?`,
      [first_name, last_name, email, phone, department, position, hourly_rate, employment_type, skills ? JSON.stringify(skills) : null, certifications ? JSON.stringify(certifications) : null, max_hours_per_week, is_active, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// SHIFT TEMPLATES
app.get('/templates', async (req, res) => {
  try {
    await ensureTables();
    const { department } = req.query;
    let sql = `SELECT * FROM shift_templates WHERE is_active = 1`;
    const params = [];
    if (department) { sql += ` AND department = ?`; params.push(department); }
    sql += ` ORDER BY start_time`;
    res.json({ success: true, templates: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/templates', async (req, res) => {
  try {
    await ensureTables();
    const { name, department, start_time, end_time, break_minutes, color } = req.body;
    const id = generateId();
    run(`INSERT INTO shift_templates (id, name, department, start_time, end_time, break_minutes, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, department, start_time, end_time, break_minutes || 30, color, timestamp()]);
    res.json({ success: true, template: { id, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// SCHEDULED SHIFTS
app.get('/shifts', async (req, res) => {
  try {
    await ensureTables();
    const { staff_id, department, from_date, to_date, status } = req.query;
    let sql = `SELECT ss.*, sm.first_name, sm.last_name, sm.employee_id FROM scheduled_shifts ss LEFT JOIN staff_members sm ON ss.staff_id = sm.id WHERE 1=1`;
    const params = [];
    if (staff_id) { sql += ` AND ss.staff_id = ?`; params.push(staff_id); }
    if (department) { sql += ` AND ss.department = ?`; params.push(department); }
    if (from_date) { sql += ` AND ss.shift_date >= ?`; params.push(from_date); }
    if (to_date) { sql += ` AND ss.shift_date <= ?`; params.push(to_date); }
    if (status) { sql += ` AND ss.status = ?`; params.push(status); }
    sql += ` ORDER BY ss.shift_date, ss.start_time`;
    res.json({ success: true, shifts: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/shifts', async (req, res) => {
  try {
    await ensureTables();
    const { staff_id, template_id, shift_date, start_time, end_time, break_minutes, department, position, notes, created_by } = req.body;
    
    // Check for conflicts
    const conflict = get(`SELECT id FROM scheduled_shifts WHERE staff_id = ? AND shift_date = ? AND status != 'cancelled' AND ((start_time <= ? AND end_time > ?) OR (start_time < ? AND end_time >= ?) OR (start_time >= ? AND end_time <= ?))`,
      [staff_id, shift_date, start_time, start_time, end_time, end_time, start_time, end_time]);
    if (conflict) return res.status(400).json({ success: false, error: 'Shift conflicts with existing schedule' });
    
    const id = generateId();
    run(`INSERT INTO scheduled_shifts (id, staff_id, template_id, shift_date, start_time, end_time, break_minutes, department, position, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, staff_id, template_id, shift_date, start_time, end_time, break_minutes || 30, department, position, notes, created_by, timestamp()]);
    res.json({ success: true, shift: { id } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/shifts/:id', async (req, res) => {
  try {
    await ensureTables();
    const { staff_id, shift_date, start_time, end_time, break_minutes, department, position, notes, status } = req.body;
    run(`UPDATE scheduled_shifts SET staff_id = COALESCE(?, staff_id), shift_date = COALESCE(?, shift_date), start_time = COALESCE(?, start_time), end_time = COALESCE(?, end_time), break_minutes = COALESCE(?, break_minutes), department = COALESCE(?, department), position = COALESCE(?, position), notes = COALESCE(?, notes), status = COALESCE(?, status) WHERE id = ?`,
      [staff_id, shift_date, start_time, end_time, break_minutes, department, position, notes, status, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/shifts/publish', async (req, res) => {
  try {
    await ensureTables();
    const { from_date, to_date, department } = req.body;
    let sql = `UPDATE scheduled_shifts SET published = 1, published_at = ? WHERE shift_date BETWEEN ? AND ? AND published = 0`;
    const params = [timestamp(), from_date, to_date];
    if (department) { sql += ` AND department = ?`; params.push(department); }
    run(sql, params);
    res.json({ success: true, message: 'Schedule published' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// TIME TRACKING
app.post('/time/clock-in', async (req, res) => {
  try {
    await ensureTables();
    const { staff_id, shift_id, notes } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const now = timestamp();
    
    // Check if already clocked in
    const existing = get(`SELECT id FROM time_entries WHERE staff_id = ? AND entry_date = ? AND clock_out IS NULL`, [staff_id, today]);
    if (existing) return res.status(400).json({ success: false, error: 'Already clocked in' });
    
    const id = generateId();
    run(`INSERT INTO time_entries (id, staff_id, shift_id, entry_date, clock_in, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, staff_id, shift_id, today, now, notes, now]);
    res.json({ success: true, entry: { id, clock_in: now } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/time/clock-out', async (req, res) => {
  try {
    await ensureTables();
    const { staff_id, notes } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const now = timestamp();
    
    const entry = get(`SELECT * FROM time_entries WHERE staff_id = ? AND entry_date = ? AND clock_out IS NULL`, [staff_id, today]);
    if (!entry) return res.status(400).json({ success: false, error: 'No active clock-in found' });
    
    // Calculate hours
    const clockIn = new Date(entry.clock_in);
    const clockOut = new Date(now);
    const totalMs = clockOut - clockIn;
    const breakMs = (entry.break_end && entry.break_start) ? (new Date(entry.break_end) - new Date(entry.break_start)) : 0;
    const totalHours = (totalMs - breakMs) / (1000 * 60 * 60);
    const overtime = Math.max(0, totalHours - 8);
    
    run(`UPDATE time_entries SET clock_out = ?, total_hours = ?, overtime_hours = ?, notes = COALESCE(?, notes) WHERE id = ?`,
      [now, Math.round(totalHours * 100) / 100, Math.round(overtime * 100) / 100, notes, entry.id]);
    
    res.json({ success: true, entry: { id: entry.id, clock_out: now, total_hours: totalHours } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/time/break-start', async (req, res) => {
  try {
    await ensureTables();
    const { staff_id } = req.body;
    const today = new Date().toISOString().split('T')[0];
    run(`UPDATE time_entries SET break_start = ? WHERE staff_id = ? AND entry_date = ? AND clock_out IS NULL`, [timestamp(), staff_id, today]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/time/break-end', async (req, res) => {
  try {
    await ensureTables();
    const { staff_id } = req.body;
    const today = new Date().toISOString().split('T')[0];
    run(`UPDATE time_entries SET break_end = ? WHERE staff_id = ? AND entry_date = ? AND clock_out IS NULL`, [timestamp(), staff_id, today]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/time', async (req, res) => {
  try {
    await ensureTables();
    const { staff_id, from_date, to_date, status } = req.query;
    let sql = `SELECT te.*, sm.first_name, sm.last_name FROM time_entries te LEFT JOIN staff_members sm ON te.staff_id = sm.id WHERE 1=1`;
    const params = [];
    if (staff_id) { sql += ` AND te.staff_id = ?`; params.push(staff_id); }
    if (from_date) { sql += ` AND te.entry_date >= ?`; params.push(from_date); }
    if (to_date) { sql += ` AND te.entry_date <= ?`; params.push(to_date); }
    if (status) { sql += ` AND te.status = ?`; params.push(status); }
    sql += ` ORDER BY te.entry_date DESC, te.clock_in DESC`;
    res.json({ success: true, entries: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/time/:id/approve', async (req, res) => {
  try {
    await ensureTables();
    const { approved_by } = req.body;
    run(`UPDATE time_entries SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?`, [approved_by, timestamp(), req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// TIME OFF
app.get('/time-off', async (req, res) => {
  try {
    await ensureTables();
    const { staff_id, status } = req.query;
    let sql = `SELECT tor.*, sm.first_name, sm.last_name FROM time_off_requests tor LEFT JOIN staff_members sm ON tor.staff_id = sm.id WHERE 1=1`;
    const params = [];
    if (staff_id) { sql += ` AND tor.staff_id = ?`; params.push(staff_id); }
    if (status) { sql += ` AND tor.status = ?`; params.push(status); }
    sql += ` ORDER BY tor.created_at DESC`;
    res.json({ success: true, requests: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/time-off', async (req, res) => {
  try {
    await ensureTables();
    const { staff_id, request_type, start_date, end_date, reason } = req.body;
    const id = generateId();
    run(`INSERT INTO time_off_requests (id, staff_id, request_type, start_date, end_date, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, staff_id, request_type, start_date, end_date, reason, timestamp()]);
    res.json({ success: true, request: { id } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/time-off/:id/review', async (req, res) => {
  try {
    await ensureTables();
    const { status, reviewed_by, review_notes } = req.body;
    run(`UPDATE time_off_requests SET status = ?, reviewed_by = ?, reviewed_at = ?, review_notes = ? WHERE id = ?`,
      [status, reviewed_by, timestamp(), review_notes, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// LABOR STATS
app.get('/labor/stats', async (req, res) => {
  try {
    await ensureTables();
    const { from_date, to_date, department } = req.query;
    let sql = `SELECT SUM(total_hours) as hours, SUM(overtime_hours) as overtime FROM time_entries WHERE entry_date BETWEEN ? AND ?`;
    const params = [from_date, to_date];
    const stats = get(sql, params);
    
    const staffCount = get(`SELECT COUNT(*) as count FROM staff_members WHERE is_active = 1`);
    const scheduledHours = get(`SELECT COUNT(*) * 8 as hours FROM scheduled_shifts WHERE shift_date BETWEEN ? AND ? AND status = 'scheduled'`, [from_date, to_date]);
    
    res.json({ success: true, stats: {
      total_hours: stats?.hours || 0, overtime_hours: stats?.overtime || 0,
      scheduled_hours: scheduledHours?.hours || 0, active_staff: staffCount?.count || 0
    }});
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

async function start() {
  await ensureTables();
  app.get('*', (req, res) => {
    if (fs.existsSync(path.join(uiPath, 'index.html'))) res.sendFile(path.join(uiPath, 'index.html'));
    else res.json({ service: SERVICE_NAME, mode: 'lite', status: 'running' });
  });
  app.listen(PORT, () => console.log(`✅ ${SERVICE_NAME} (Lite) running on port ${PORT}`));
}

start();
