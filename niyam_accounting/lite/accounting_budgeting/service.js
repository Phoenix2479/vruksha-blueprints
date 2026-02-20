/**
 * Advanced Budgeting & Report Builder - Lite Version (SQLite)
 * Port: 8907
 * Budget versions, forecasts, alerts, and custom report builder
 * Split from financial_reports for clean separation
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');
const { sendCSV } = require('../shared/csv-generator');

const app = express();
const PORT = process.env.PORT || 8907;

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'accounting_budgeting', mode: 'lite' });
});

// =============================================================================
// BUDGET VERSIONS
// =============================================================================

app.get('/api/budget-versions', (req, res) => {
  try {
    const { fiscal_year_id, status } = req.query;
    let sql = 'SELECT * FROM acc_budget_versions WHERE 1=1';
    const params = [];
    if (fiscal_year_id) { sql += ' AND fiscal_year_id = ?'; params.push(fiscal_year_id); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY created_at DESC';
    res.json({ success: true, data: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/budget-versions', (req, res) => {
  try {
    const { name, fiscal_year_id } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'name required' });
    const id = uuidv4();
    const fyId = fiscal_year_id || null;
    const maxVersion = fyId
      ? get('SELECT MAX(version) as v FROM acc_budget_versions WHERE fiscal_year_id = ?', [fyId])
      : get('SELECT MAX(version) as v FROM acc_budget_versions WHERE fiscal_year_id IS NULL');
    run('INSERT INTO acc_budget_versions (id, name, fiscal_year_id, version) VALUES (?, ?, ?, ?)',
      [id, name, fyId, (maxVersion?.v || 0) + 1]);
    res.status(201).json({ success: true, data: get('SELECT * FROM acc_budget_versions WHERE id = ?', [id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/budget-versions/:id', (req, res) => {
  try {
    const version = get('SELECT * FROM acc_budget_versions WHERE id = ?', [req.params.id]);
    if (!version) return res.status(404).json({ success: false, error: 'Budget version not found' });
    const lines = query('SELECT bl.*, a.account_name FROM acc_budget_version_lines bl LEFT JOIN acc_accounts a ON bl.account_id = a.id WHERE bl.version_id = ? ORDER BY bl.period, a.account_name', [req.params.id]);
    res.json({ success: true, data: { ...version, lines } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/budget-versions/:id/copy', (req, res) => {
  try {
    const source = get('SELECT * FROM acc_budget_versions WHERE id = ?', [req.params.id]);
    if (!source) return res.status(404).json({ success: false, error: 'Budget version not found' });
    const newId = uuidv4();
    const fyId = source.fiscal_year_id || null;
    const maxVersion = fyId
      ? get('SELECT MAX(version) as v FROM acc_budget_versions WHERE fiscal_year_id = ?', [fyId])
      : get('SELECT MAX(version) as v FROM acc_budget_versions WHERE fiscal_year_id IS NULL');
    run('INSERT INTO acc_budget_versions (id, name, fiscal_year_id, version) VALUES (?, ?, ?, ?)',
      [newId, source.name + ' (copy)', fyId, (maxVersion?.v || 0) + 1]);
    const lines = query('SELECT * FROM acc_budget_version_lines WHERE version_id = ?', [req.params.id]);
    for (const line of lines) {
      run('INSERT INTO acc_budget_version_lines (id, version_id, account_id, cost_center_id, period, amount, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuidv4(), newId, line.account_id, line.cost_center_id, line.period, line.amount, line.notes]);
    }
    res.status(201).json({ success: true, data: get('SELECT * FROM acc_budget_versions WHERE id = ?', [newId]), lines_copied: lines.length });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/budget-versions/:id/lines', (req, res) => {
  try {
    const { lines } = req.body;
    if (!lines || !Array.isArray(lines)) return res.status(400).json({ success: false, error: 'lines array required' });
    for (const line of lines) {
      if (line.id) {
        run('UPDATE acc_budget_version_lines SET amount = ?, notes = ? WHERE id = ? AND version_id = ?', [line.amount || 0, line.notes || null, line.id, req.params.id]);
      } else {
        run('INSERT INTO acc_budget_version_lines (id, version_id, account_id, cost_center_id, period, amount, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [uuidv4(), req.params.id, line.account_id, line.cost_center_id || null, line.period, line.amount || 0, line.notes || null]);
      }
    }
    const allLines = query('SELECT * FROM acc_budget_version_lines WHERE version_id = ? ORDER BY period, account_id', [req.params.id]);
    res.json({ success: true, data: allLines });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/budget-versions/:id/approve', (req, res) => {
  try {
    run('UPDATE acc_budget_versions SET status = \'approved\' WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: get('SELECT * FROM acc_budget_versions WHERE id = ?', [req.params.id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/budget-versions/:id', (req, res) => {
  try {
    const v = get('SELECT status FROM acc_budget_versions WHERE id = ?', [req.params.id]);
    if (v && v.status === 'approved') return res.status(400).json({ success: false, error: 'Cannot delete approved budget' });
    run('DELETE FROM acc_budget_version_lines WHERE version_id = ?', [req.params.id]);
    run('DELETE FROM acc_budget_versions WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Budget version deleted' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =============================================================================
// BUDGET VS ACTUAL
// =============================================================================

app.get('/api/budget-versions/:id/vs-actual', (req, res) => {
  try {
    const budgetLines = query('SELECT bl.account_id, a.account_name, bl.period, SUM(bl.amount) as budgeted FROM acc_budget_version_lines bl LEFT JOIN acc_accounts a ON bl.account_id = a.id WHERE bl.version_id = ? GROUP BY bl.account_id, bl.period ORDER BY bl.period, a.account_name', [req.params.id]);
    const result = budgetLines.map(bl => {
      const actual = get('SELECT SUM(debit_amount - credit_amount) as actual FROM acc_journal_lines jl JOIN acc_journal_entries je ON jl.journal_entry_id = je.id WHERE jl.account_id = ? AND substr(je.entry_date, 1, 7) = ? AND je.status = \'posted\'', [bl.account_id, bl.period]);
      const actualAmt = actual?.actual || 0;
      return { account_id: bl.account_id, account_name: bl.account_name, period: bl.period, budgeted: bl.budgeted, actual: actualAmt, variance: actualAmt - bl.budgeted, variance_pct: bl.budgeted ? Math.round((actualAmt - bl.budgeted) / bl.budgeted * 10000) / 100 : 0 };
    });
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =============================================================================
// FORECASTING & ALERTS
// =============================================================================

app.get('/api/budget-forecast', (req, res) => {
  try {
    const { months } = req.query;
    const periods = parseInt(months) || 12;
    const forecast = [];
    for (let m = 0; m < periods; m++) {
      const d = new Date(); d.setMonth(d.getMonth() + m);
      const period = d.toISOString().substring(0, 7);
      const budgeted = get('SELECT SUM(bl.amount) as total FROM acc_budget_version_lines bl JOIN acc_budget_versions bv ON bl.version_id = bv.id WHERE bl.period = ? AND bv.status = \'approved\'', [period]);
      const actual = get('SELECT SUM(jl.debit_amount) as total FROM acc_journal_lines jl JOIN acc_journal_entries je ON jl.journal_entry_id = je.id WHERE substr(je.entry_date, 1, 7) = ? AND je.status = \'posted\'', [period]);
      forecast.push({ period, budgeted: budgeted?.total || 0, actual: actual?.total || 0 });
    }
    res.json({ success: true, data: forecast });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/budget-alerts', (req, res) => {
  try {
    const { threshold } = req.query;
    const thresholdPct = parseInt(threshold) || 80;
    const currentPeriod = new Date().toISOString().substring(0, 7);
    const budgetLines = query('SELECT bl.account_id, a.account_name, bl.period, SUM(bl.amount) as budgeted FROM acc_budget_version_lines bl JOIN acc_budget_versions bv ON bl.version_id = bv.id LEFT JOIN acc_accounts a ON bl.account_id = a.id WHERE bv.status = \'approved\' AND bl.period = ? GROUP BY bl.account_id', [currentPeriod]);
    const alerts = [];
    for (const bl of budgetLines) {
      if (!bl.budgeted || bl.budgeted <= 0) continue;
      const actual = get('SELECT SUM(debit_amount - credit_amount) as actual FROM acc_journal_lines jl JOIN acc_journal_entries je ON jl.journal_entry_id = je.id WHERE jl.account_id = ? AND substr(je.entry_date, 1, 7) = ? AND je.status = \'posted\'', [bl.account_id, currentPeriod]);
      const actualAmt = Math.abs(actual?.actual || 0);
      const pct = Math.round(actualAmt / bl.budgeted * 100);
      if (pct >= thresholdPct) {
        alerts.push({ account_id: bl.account_id, account_name: bl.account_name, period: currentPeriod, budgeted: bl.budgeted, actual: actualAmt, utilization_pct: pct, severity: pct >= 100 ? 'over_budget' : 'warning' });
      }
    }
    res.json({ success: true, data: alerts });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =============================================================================
// CUSTOM REPORT BUILDER
// =============================================================================

const REPORT_TABLES = { accounts: 'acc_accounts', journal_entries: 'acc_journal_entries', journal_lines: 'acc_journal_lines', vendors: 'acc_vendors', bills: 'acc_bills', customers: 'acc_customers', invoices: 'acc_invoices', payments: 'acc_payments', purchase_orders: 'acc_purchase_orders', expense_claims: 'acc_expense_claims', fixed_assets: 'acc_fixed_assets', projects: 'acc_projects', employees: 'acc_employees', payroll_runs: 'acc_payroll_runs' };

app.get('/api/report-tables', (req, res) => {
  res.json({ success: true, data: Object.keys(REPORT_TABLES).map(k => ({ id: k, table: REPORT_TABLES[k] })) });
});

app.get('/api/saved-reports', (req, res) => {
  try {
    const reports = query('SELECT id, name, description, created_by, is_public, created_at, updated_at FROM acc_saved_reports ORDER BY updated_at DESC', []);
    res.json({ success: true, data: reports });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/saved-reports', (req, res) => {
  try {
    const { name, description, query_config, columns, filters, created_by, is_public } = req.body;
    if (!name || !query_config) return res.status(400).json({ success: false, error: 'name and query_config required' });
    const id = uuidv4();
    run('INSERT INTO acc_saved_reports (id, name, description, query_config, columns, filters, created_by, is_public) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, name, description || null, JSON.stringify(query_config), columns ? JSON.stringify(columns) : null, filters ? JSON.stringify(filters) : null, created_by || null, is_public ? 1 : 0]);
    res.status(201).json({ success: true, data: get('SELECT * FROM acc_saved_reports WHERE id = ?', [id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/saved-reports/:id', (req, res) => {
  try {
    const report = get('SELECT * FROM acc_saved_reports WHERE id = ?', [req.params.id]);
    if (!report) return res.status(404).json({ success: false, error: 'Report not found' });
    res.json({ success: true, data: { ...report, query_config: JSON.parse(report.query_config || '{}'), columns: JSON.parse(report.columns || '[]'), filters: JSON.parse(report.filters || '[]') } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/saved-reports/:id', (req, res) => {
  try {
    const { name, description, query_config, columns, filters, is_public } = req.body;
    run('UPDATE acc_saved_reports SET name = COALESCE(?, name), description = COALESCE(?, description), query_config = COALESCE(?, query_config), columns = COALESCE(?, columns), filters = COALESCE(?, filters), is_public = COALESCE(?, is_public), updated_at = datetime(\'now\') WHERE id = ?',
      [name, description, query_config ? JSON.stringify(query_config) : null, columns ? JSON.stringify(columns) : null, filters ? JSON.stringify(filters) : null, is_public, req.params.id]);
    res.json({ success: true, data: get('SELECT * FROM acc_saved_reports WHERE id = ?', [req.params.id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/saved-reports/:id', (req, res) => {
  try {
    run('DELETE FROM acc_saved_reports WHERE id = ?', [req.params.id]);
    run('DELETE FROM acc_report_schedules WHERE report_id = ?', [req.params.id]);
    res.json({ success: true, message: 'Report deleted' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/saved-reports/:id/run', (req, res) => {
  try {
    const report = get('SELECT * FROM acc_saved_reports WHERE id = ?', [req.params.id]);
    if (!report) return res.status(404).json({ success: false, error: 'Report not found' });
    const config = JSON.parse(report.query_config || '{}');
    const baseTable = REPORT_TABLES[config.table];
    if (!baseTable) return res.status(400).json({ success: false, error: 'Invalid table in report config' });
    const cols = (config.columns || ['*']).join(', ');
    let sql = `SELECT ${cols} FROM ${baseTable}`;
    const params = [];
    if (config.where) {
      const conditions = [];
      for (const [field, op, value] of config.where) {
        conditions.push(`${field} ${op} ?`);
        params.push(value);
      }
      if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    }
    if (config.group_by) sql += ` GROUP BY ${config.group_by}`;
    if (config.order_by) sql += ` ORDER BY ${config.order_by}`;
    sql += ` LIMIT ${config.limit || 1000}`;
    const data = query(sql, params);
    res.json({ success: true, data, count: data.length, report_name: report.name });
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
  app.listen(PORT, () => console.log(`Budgeting & Report Builder (lite) on port ${PORT}`));
}).catch(err => { console.error('Failed to init DB:', err); process.exit(1); });

module.exports = app;
