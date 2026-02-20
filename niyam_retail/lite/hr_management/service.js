const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8866;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'hr_management', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'hr_management' }));

// === EMPLOYEES (Extended) ===
app.get('/employees', (req, res) => {
  try {
    const { department, role, active = '1' } = req.query;
    let sql = 'SELECT * FROM employees WHERE active = ?';
    const params = [parseInt(active)];
    if (department) { sql += ' AND department = ?'; params.push(department); }
    if (role) { sql += ' AND role = ?'; params.push(role); }
    sql += ' ORDER BY name';
    res.json({ success: true, employees: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/employees/:id', (req, res) => {
  try {
    const employee = get('SELECT * FROM employees WHERE id = ?', [req.params.id]);
    if (!employee) return res.status(404).json({ success: false, error: 'Employee not found' });
    const leaves = query('SELECT * FROM leave_requests WHERE employee_id = ? ORDER BY created_at DESC LIMIT 10', [req.params.id]);
    const payroll = query('SELECT * FROM payroll WHERE employee_id = ? ORDER BY period_end DESC LIMIT 6', [req.params.id]);
    res.json({ success: true, employee, leave_requests: leaves, payroll_history: payroll });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/employees', (req, res) => {
  try {
    const { name, email, phone, role, department, hire_date, hourly_rate, commission_rate } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Name required' });
    const id = uuidv4();
    run(`INSERT INTO employees (id, name, email, phone, role, department, hire_date, hourly_rate, commission_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, email, phone, role, department, hire_date || new Date().toISOString(), hourly_rate || 0, commission_rate || 0]);
    res.json({ success: true, employee: { id, name } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// === PAYROLL ===
app.get('/payroll', (req, res) => {
  try {
    const { employee_id, status, period } = req.query;
    let sql = 'SELECT p.*, e.name as employee_name FROM payroll p LEFT JOIN employees e ON p.employee_id = e.id WHERE 1=1';
    const params = [];
    if (employee_id) { sql += ' AND p.employee_id = ?'; params.push(employee_id); }
    if (status) { sql += ' AND p.status = ?'; params.push(status); }
    if (period) { sql += ' AND p.period_start <= ? AND p.period_end >= ?'; params.push(period, period); }
    sql += ' ORDER BY p.period_end DESC LIMIT 100';
    res.json({ success: true, payroll: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/payroll/generate', (req, res) => {
  try {
    const { employee_id, period_start, period_end, base_pay, overtime_pay, commission, deductions } = req.body;
    if (!employee_id || !period_start || !period_end) return res.status(400).json({ success: false, error: 'employee_id, period_start, period_end required' });
    const id = uuidv4();
    const netPay = (base_pay || 0) + (overtime_pay || 0) + (commission || 0) - (deductions || 0);
    run(`INSERT INTO payroll (id, employee_id, period_start, period_end, base_pay, overtime_pay, commission, deductions, net_pay) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, employee_id, period_start, period_end, base_pay || 0, overtime_pay || 0, commission || 0, deductions || 0, netPay]);
    res.json({ success: true, payroll: { id, net_pay: netPay, status: 'pending' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/payroll/:id/process', (req, res) => {
  try {
    run('UPDATE payroll SET status = ?, paid_date = ? WHERE id = ?', ['paid', new Date().toISOString(), req.params.id]);
    res.json({ success: true, message: 'Payroll processed' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Bulk payroll generation
app.post('/payroll/generate-bulk', (req, res) => {
  try {
    const { period_start, period_end, department } = req.body;
    if (!period_start || !period_end) return res.status(400).json({ success: false, error: 'period_start, period_end required' });
    
    let sql = 'SELECT * FROM employees WHERE active = 1';
    const params = [];
    if (department) { sql += ' AND department = ?'; params.push(department); }
    const employees = query(sql, params);
    
    const results = [];
    for (const emp of employees) {
      // Calculate hours from time logs
      const logs = query(`SELECT * FROM time_logs WHERE employee_id = ? AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp`,
        [emp.id, period_start, period_end]);
      
      // Simple calculation - count clock_in/clock_out pairs
      let totalHours = 0;
      let clockIn = null;
      for (const log of logs) {
        if (log.action === 'clock_in') clockIn = new Date(log.timestamp);
        else if (log.action === 'clock_out' && clockIn) {
          totalHours += (new Date(log.timestamp) - clockIn) / (1000 * 60 * 60);
          clockIn = null;
        }
      }
      
      const basePay = totalHours * (emp.hourly_rate || 0);
      const id = uuidv4();
      run(`INSERT INTO payroll (id, employee_id, period_start, period_end, base_pay, net_pay) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, emp.id, period_start, period_end, basePay, basePay]);
      results.push({ employee_id: emp.id, name: emp.name, hours: totalHours, base_pay: basePay });
    }
    
    res.json({ success: true, generated: results.length, payroll: results });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// === LEAVE MANAGEMENT ===
app.get('/leave-requests', (req, res) => {
  try {
    const { employee_id, status } = req.query;
    let sql = 'SELECT lr.*, e.name as employee_name FROM leave_requests lr LEFT JOIN employees e ON lr.employee_id = e.id WHERE 1=1';
    const params = [];
    if (employee_id) { sql += ' AND lr.employee_id = ?'; params.push(employee_id); }
    if (status) { sql += ' AND lr.status = ?'; params.push(status); }
    sql += ' ORDER BY lr.created_at DESC';
    res.json({ success: true, leave_requests: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/leave-requests', (req, res) => {
  try {
    const { employee_id, type, start_date, end_date, reason } = req.body;
    if (!employee_id || !start_date || !end_date) return res.status(400).json({ success: false, error: 'employee_id, start_date, end_date required' });
    const id = uuidv4();
    run('INSERT INTO leave_requests (id, employee_id, type, start_date, end_date, reason) VALUES (?, ?, ?, ?, ?, ?)',
      [id, employee_id, type || 'vacation', start_date, end_date, reason]);
    res.json({ success: true, leave_request: { id, status: 'pending' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.patch('/leave-requests/:id', (req, res) => {
  try {
    const { status, approved_by } = req.body;
    run('UPDATE leave_requests SET status = ?, approved_by = ? WHERE id = ?', [status, approved_by, req.params.id]);
    res.json({ success: true, message: 'Leave request updated' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// HR Stats
app.get('/hr/stats', (req, res) => {
  try {
    const empStats = get('SELECT COUNT(*) as total, SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) as active FROM employees');
    const byDept = query('SELECT department, COUNT(*) as count FROM employees WHERE active = 1 GROUP BY department');
    const pendingLeaves = get("SELECT COUNT(*) as count FROM leave_requests WHERE status = 'pending'");
    const pendingPayroll = get("SELECT COUNT(*) as count FROM payroll WHERE status = 'pending'");
    res.json({ success: true, stats: { employees: empStats || {}, by_department: byDept, pending_leaves: pendingLeaves?.count || 0, pending_payroll: pendingPayroll?.count || 0 } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'hr_management', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[HR Management Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
