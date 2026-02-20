/**
 * Project / Job Costing - Lite Version (SQLite)
 * Port: 8905
 * Track project costs, revenue, and profitability
 * Split from fiscal_periods for clean separation
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');
const { sendCSV } = require('../shared/csv-generator');

const app = express();
const PORT = process.env.PORT || 8905;

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'accounting_project_costing', mode: 'lite' });
});

// =============================================================================
// PROJECTS
// =============================================================================

app.get('/api/projects', (req, res) => {
  try {
    const { status, customer_id } = req.query;
    let sql = 'SELECT * FROM acc_projects WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (customer_id) { sql += ' AND customer_id = ?'; params.push(customer_id); }
    sql += ' ORDER BY created_at DESC';
    res.json({ success: true, data: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/projects/summary', (req, res) => {
  try {
    const projects = query('SELECT p.*, COALESCE(c.total_cost, 0) as total_cost, COALESCE(r.total_revenue, 0) as total_revenue FROM acc_projects p LEFT JOIN (SELECT project_id, SUM(amount) as total_cost FROM acc_project_costs GROUP BY project_id) c ON p.id = c.project_id LEFT JOIN (SELECT project_id, SUM(amount) as total_revenue FROM acc_project_revenue GROUP BY project_id) r ON p.id = r.project_id ORDER BY p.created_at DESC', []);
    const data = projects.map(p => ({ ...p, profit: (p.total_revenue || 0) - (p.total_cost || 0) }));
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/projects/csv', (req, res) => {
  try {
    const data = query('SELECT p.*, COALESCE(c.total_cost, 0) as total_cost, COALESCE(r.total_revenue, 0) as total_revenue FROM acc_projects p LEFT JOIN (SELECT project_id, SUM(amount) as total_cost FROM acc_project_costs GROUP BY project_id) c ON p.id = c.project_id LEFT JOIN (SELECT project_id, SUM(amount) as total_revenue FROM acc_project_revenue GROUP BY project_id) r ON p.id = r.project_id', []);
    sendCSV(res, data, 'projects.csv');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/projects', (req, res) => {
  try {
    const { code, name, customer_id, manager_id, budget, start_date, end_date, billing_type } = req.body;
    if (!code || !name) return res.status(400).json({ success: false, error: 'code and name required' });
    const id = uuidv4();
    run('INSERT INTO acc_projects (id, code, name, customer_id, manager_id, budget, start_date, end_date, billing_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, code, name, customer_id || null, manager_id || null, budget || 0, start_date || null, end_date || null, billing_type || 'fixed']);
    res.status(201).json({ success: true, data: get('SELECT * FROM acc_projects WHERE id = ?', [id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/projects/:id', (req, res) => {
  try {
    const project = get('SELECT * FROM acc_projects WHERE id = ?', [req.params.id]);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    const costs = query('SELECT * FROM acc_project_costs WHERE project_id = ? ORDER BY cost_date DESC', [req.params.id]);
    const revenue = query('SELECT * FROM acc_project_revenue WHERE project_id = ? ORDER BY revenue_date DESC', [req.params.id]);
    const totalCost = costs.reduce((s, c) => s + (c.amount || 0), 0);
    const totalRevenue = revenue.reduce((s, r) => s + (r.amount || 0), 0);
    res.json({ success: true, data: { ...project, costs, revenue, total_cost: totalCost, total_revenue: totalRevenue, profit: totalRevenue - totalCost } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/projects/:id', (req, res) => {
  try {
    const { name, customer_id, manager_id, budget, start_date, end_date, status, billing_type } = req.body;
    run('UPDATE acc_projects SET name = COALESCE(?, name), customer_id = COALESCE(?, customer_id), manager_id = COALESCE(?, manager_id), budget = COALESCE(?, budget), start_date = COALESCE(?, start_date), end_date = COALESCE(?, end_date), status = COALESCE(?, status), billing_type = COALESCE(?, billing_type), updated_at = datetime(\'now\') WHERE id = ?',
      [name, customer_id, manager_id, budget, start_date, end_date, status, billing_type, req.params.id]);
    res.json({ success: true, data: get('SELECT * FROM acc_projects WHERE id = ?', [req.params.id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/projects/:id', (req, res) => {
  try {
    run('UPDATE acc_projects SET status = \'archived\', updated_at = datetime(\'now\') WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Project archived' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =============================================================================
// COST ALLOCATION
// =============================================================================

app.post('/api/projects/:id/allocate-cost', (req, res) => {
  try {
    const { cost_type, source_type, source_id, description, amount, cost_date } = req.body;
    if (!amount) return res.status(400).json({ success: false, error: 'amount required' });
    const id = uuidv4();
    run('INSERT INTO acc_project_costs (id, project_id, cost_type, source_type, source_id, description, amount, cost_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, req.params.id, cost_type || 'direct', source_type || null, source_id || null, description || null, amount, cost_date || new Date().toISOString().split('T')[0]]);
    res.status(201).json({ success: true, data: get('SELECT * FROM acc_project_costs WHERE id = ?', [id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/projects/:id/add-revenue', (req, res) => {
  try {
    const { description, amount, revenue_date, invoice_id } = req.body;
    if (!amount) return res.status(400).json({ success: false, error: 'amount required' });
    const id = uuidv4();
    run('INSERT INTO acc_project_revenue (id, project_id, description, amount, revenue_date, invoice_id) VALUES (?, ?, ?, ?, ?, ?)',
      [id, req.params.id, description || null, amount, revenue_date || new Date().toISOString().split('T')[0], invoice_id || null]);
    res.status(201).json({ success: true, data: get('SELECT * FROM acc_project_revenue WHERE id = ?', [id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =============================================================================
// PROFITABILITY
// =============================================================================

app.get('/api/projects/:id/profitability', (req, res) => {
  try {
    const project = get('SELECT * FROM acc_projects WHERE id = ?', [req.params.id]);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    const costs = query('SELECT cost_type, SUM(amount) as total FROM acc_project_costs WHERE project_id = ? GROUP BY cost_type', [req.params.id]);
    const revenue = get('SELECT SUM(amount) as total FROM acc_project_revenue WHERE project_id = ?', [req.params.id]);
    const totalCost = costs.reduce((s, c) => s + (c.total || 0), 0);
    const totalRev = revenue?.total || 0;
    res.json({ success: true, data: { project_id: req.params.id, project_name: project.name, budget: project.budget, total_revenue: totalRev, cost_breakdown: costs, total_cost: totalCost, profit: totalRev - totalCost, margin_pct: totalRev > 0 ? Math.round((totalRev - totalCost) / totalRev * 10000) / 100 : 0, budget_utilization_pct: project.budget > 0 ? Math.round(totalCost / project.budget * 10000) / 100 : 0 } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/projects/:id/budget-vs-actual', (req, res) => {
  try {
    const project = get('SELECT * FROM acc_projects WHERE id = ?', [req.params.id]);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    const monthlyCosts = query('SELECT substr(cost_date, 1, 7) as month, SUM(amount) as total FROM acc_project_costs WHERE project_id = ? GROUP BY month ORDER BY month', [req.params.id]);
    const totalSpent = monthlyCosts.reduce((s, m) => s + (m.total || 0), 0);
    res.json({ success: true, data: { project_id: req.params.id, budget: project.budget, total_spent: totalSpent, remaining: (project.budget || 0) - totalSpent, variance_pct: project.budget > 0 ? Math.round((totalSpent - project.budget) / project.budget * 10000) / 100 : 0, monthly_breakdown: monthlyCosts } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// SPA fallback
app.get('*', (req, res) => {
  if (req.accepts('html') && fs.existsSync(path.join(uiPath, 'index.html'))) {
    return res.sendFile(path.join(uiPath, 'index.html'));
  }
  res.status(404).json({ error: 'Not found' });
});

initDb().then(() => {
  app.listen(PORT, () => console.log(`Project Costing (lite) on port ${PORT}`));
}).catch(err => { console.error('Failed to init DB:', err); process.exit(1); });

module.exports = app;
