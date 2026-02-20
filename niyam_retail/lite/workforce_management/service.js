const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8850;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'workforce_management', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'workforce_management' }));

// === EMPLOYEES ===
app.get('/employees', (req, res) => {
  try {
    const { active = '1' } = req.query;
    const employees = query('SELECT * FROM employees WHERE active = ? ORDER BY name', [parseInt(active)]);
    res.json({ success: true, employees });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/employees', (req, res) => {
  try {
    const { name, email, phone, role, department, hire_date, hourly_rate, commission_rate } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Name required' });
    const id = uuidv4();
    run(`INSERT INTO employees (id, name, email, phone, role, department, hire_date, hourly_rate, commission_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, email, phone, role, department, hire_date, hourly_rate || 0, commission_rate || 0]);
    res.json({ success: true, employee: { id, name } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/employees/:id', (req, res) => {
  try {
    const employee = get('SELECT * FROM employees WHERE id = ?', [req.params.id]);
    if (!employee) return res.status(404).json({ success: false, error: 'Employee not found' });
    res.json({ success: true, employee });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/employees/:id', (req, res) => {
  try {
    const { name, email, phone, role, department, hourly_rate, commission_rate, active } = req.body;
    run(`UPDATE employees SET name = COALESCE(?, name), email = COALESCE(?, email), phone = COALESCE(?, phone), 
         role = COALESCE(?, role), department = COALESCE(?, department), hourly_rate = COALESCE(?, hourly_rate), 
         commission_rate = COALESCE(?, commission_rate), active = COALESCE(?, active), updated_at = ? WHERE id = ?`,
      [name, email, phone, role, department, hourly_rate, commission_rate, active, new Date().toISOString(), req.params.id]);
    res.json({ success: true, message: 'Employee updated' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// === SHIFTS ===
app.get('/shifts', (req, res) => {
  try {
    const { employee_id, from, to, location_id } = req.query;
    let sql = 'SELECT s.*, e.name as employee_name FROM shifts s LEFT JOIN employees e ON s.employee_id = e.id WHERE 1=1';
    const params = [];
    if (employee_id) { sql += ' AND s.employee_id = ?'; params.push(employee_id); }
    if (location_id) { sql += ' AND s.location_id = ?'; params.push(location_id); }
    if (from) { sql += ' AND s.start_time >= ?'; params.push(from); }
    if (to) { sql += ' AND s.end_time <= ?'; params.push(to); }
    sql += ' ORDER BY s.start_time';
    const shifts = query(sql, params);
    res.json({ success: true, shifts });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/shifts', (req, res) => {
  try {
    const { employee_id, location_id, start_time, end_time, notes } = req.body;
    if (!employee_id || !start_time || !end_time) return res.status(400).json({ success: false, error: 'employee_id, start_time, end_time required' });
    const id = uuidv4();
    run('INSERT INTO shifts (id, employee_id, location_id, start_time, end_time, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [id, employee_id, location_id, start_time, end_time, notes]);
    res.json({ success: true, shift: { id, employee_id, start_time, end_time } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/shifts/:id', (req, res) => {
  try {
    run('DELETE FROM shifts WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Shift deleted' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// === TIME CLOCK ===
app.post('/time-clock', (req, res) => {
  try {
    const { employee_id, action, location_id } = req.body;
    if (!employee_id || !action) return res.status(400).json({ success: false, error: 'employee_id and action required' });
    const valid = ['clock_in', 'clock_out', 'break_start', 'break_end'];
    if (!valid.includes(action)) return res.status(400).json({ success: false, error: 'Invalid action' });
    
    const id = uuidv4();
    const timestamp = new Date().toISOString();
    run('INSERT INTO time_logs (id, employee_id, action, location_id, timestamp) VALUES (?, ?, ?, ?, ?)',
      [id, employee_id, action, location_id, timestamp]);
    
    res.json({ success: true, message: `${action} recorded`, timestamp });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/time-clock/:employee_id', (req, res) => {
  try {
    const { from, to } = req.query;
    let sql = 'SELECT * FROM time_logs WHERE employee_id = ?';
    const params = [req.params.employee_id];
    if (from) { sql += ' AND timestamp >= ?'; params.push(from); }
    if (to) { sql += ' AND timestamp <= ?'; params.push(to); }
    sql += ' ORDER BY timestamp DESC';
    const logs = query(sql, params);
    res.json({ success: true, time_logs: logs });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// === COMMISSIONS ===
app.post('/commissions/calculate', (req, res) => {
  try {
    const { employee_id, period_start, period_end } = req.body;
    if (!employee_id) return res.status(400).json({ success: false, error: 'employee_id required' });
    
    const employee = get('SELECT * FROM employees WHERE id = ?', [employee_id]);
    if (!employee) return res.status(404).json({ success: false, error: 'Employee not found' });
    
    // Get sales for this employee in period (simplified - would need salesperson tracking in sales table)
    let sql = 'SELECT SUM(total) as total_sales FROM sales WHERE 1=1';
    const params = [];
    if (period_start) { sql += ' AND created_at >= ?'; params.push(period_start); }
    if (period_end) { sql += ' AND created_at <= ?'; params.push(period_end); }
    const result = get(sql, params);
    
    const totalSales = result?.total_sales || 0;
    const commissionRate = employee.commission_rate || 0.02;
    const commissionAmount = totalSales * commissionRate;
    
    res.json({ success: true, employee_id, total_sales: totalSales, commission_rate: commissionRate, commission_amount: commissionAmount });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// === LEAVE REQUESTS ===
app.get('/leave-requests', (req, res) => {
  try {
    const { employee_id, status } = req.query;
    let sql = 'SELECT lr.*, e.name as employee_name FROM leave_requests lr LEFT JOIN employees e ON lr.employee_id = e.id WHERE 1=1';
    const params = [];
    if (employee_id) { sql += ' AND lr.employee_id = ?'; params.push(employee_id); }
    if (status) { sql += ' AND lr.status = ?'; params.push(status); }
    sql += ' ORDER BY lr.created_at DESC';
    const requests = query(sql, params);
    res.json({ success: true, leave_requests: requests });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/leave-requests', (req, res) => {
  try {
    const { employee_id, type, start_date, end_date, reason } = req.body;
    if (!employee_id || !start_date || !end_date) return res.status(400).json({ success: false, error: 'employee_id, start_date, end_date required' });
    const id = uuidv4();
    run('INSERT INTO leave_requests (id, employee_id, type, start_date, end_date, reason) VALUES (?, ?, ?, ?, ?, ?)',
      [id, employee_id, type, start_date, end_date, reason]);
    res.json({ success: true, leave_request: { id, status: 'pending' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.patch('/leave-requests/:id', (req, res) => {
  try {
    const { status, approved_by } = req.body;
    if (!status) return res.status(400).json({ success: false, error: 'status required' });
    run('UPDATE leave_requests SET status = ?, approved_by = ? WHERE id = ?', [status, approved_by, req.params.id]);
    res.json({ success: true, message: 'Leave request updated' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'workforce_management', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Workforce Management Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
