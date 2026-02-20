// Budgeting + Custom Report Builder Service - Docker/Postgres
// Port: 8857

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

let db;
try { db = require('../../../../db/postgres'); } catch (_) { db = require('@vruksha/platform/db/postgres'); }
const { query } = db;

const app = express();
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
function tid(req) { return (req.headers['x-tenant-id'] || '').trim() || DEFAULT_TENANT_ID; }

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization','X-Tenant-ID'] }));
app.use(express.json());
app.use((req, _r, next) => { console.log(`[Budgeting] ${req.method} ${req.path}`); next(); });

// --- Budget Versions ---
app.get('/api/budget-versions', async (req, res, next) => {
  try {
    const { fiscal_year_id, status } = req.query;
    let sql = 'SELECT * FROM acc_budget_versions WHERE tenant_id = $1';
    const params = [tid(req)]; let idx = 2;
    if (fiscal_year_id) { sql += ` AND fiscal_year_id = $${idx++}`; params.push(fiscal_year_id); }
    if (status) { sql += ` AND status = $${idx++}`; params.push(status); }
    sql += ' ORDER BY created_at DESC';
    const r = await query(sql, params);
    res.json({ success: true, data: r.rows });
  } catch (e) { next(e); }
});

app.post('/api/budget-versions', async (req, res, next) => {
  try {
    const t = tid(req);
    const { name, fiscal_year_id, description } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const r = await query(
      'INSERT INTO acc_budget_versions (tenant_id, name, fiscal_year_id, description) VALUES ($1,$2,$3,$4) RETURNING *',
      [t, name, fiscal_year_id || null, description || null]);
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
});

app.get('/api/budget-versions/:id', async (req, res, next) => {
  try {
    const t = tid(req);
    const r = await query('SELECT * FROM acc_budget_versions WHERE tenant_id = $1 AND id = $2', [t, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Budget version not found' });
    const lines = await query(
      `SELECT bl.*, a.account_code, a.account_name FROM acc_budget_version_lines bl
       LEFT JOIN acc_accounts a ON bl.account_id = a.id WHERE bl.tenant_id = $1 AND bl.budget_version_id = $2 ORDER BY a.account_code`, [t, req.params.id]);
    res.json({ success: true, data: { ...r.rows[0], lines: lines.rows } });
  } catch (e) { next(e); }
});

app.put('/api/budget-versions/:id', async (req, res, next) => {
  try {
    const { name, description } = req.body;
    await query(`UPDATE acc_budget_versions SET name = COALESCE($1,name), description = COALESCE($2,description), updated_at = NOW() WHERE tenant_id = $3 AND id = $4`,
      [name, description, tid(req), req.params.id]);
    const r = await query('SELECT * FROM acc_budget_versions WHERE tenant_id = $1 AND id = $2', [tid(req), req.params.id]);
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
});

app.delete('/api/budget-versions/:id', async (req, res, next) => {
  try {
    const t = tid(req);
    await query('DELETE FROM acc_budget_version_lines WHERE tenant_id = $1 AND budget_version_id = $2', [t, req.params.id]);
    await query('DELETE FROM acc_budget_versions WHERE tenant_id = $1 AND id = $2', [t, req.params.id]);
    res.json({ success: true, message: 'Budget version deleted' });
  } catch (e) { next(e); }
});

// --- Budget Lines ---
app.post('/api/budget-versions/:id/lines', async (req, res, next) => {
  try {
    const t = tid(req);
    const { account_id, period, amount, notes } = req.body;
    if (!account_id || amount === undefined) return res.status(400).json({ error: 'account_id and amount required' });
    const r = await query(
      `INSERT INTO acc_budget_version_lines (tenant_id, budget_version_id, account_id, period, amount, notes)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (tenant_id, budget_version_id, account_id, period) DO UPDATE SET amount = $5, notes = $6
       RETURNING *`,
      [t, req.params.id, account_id, period || 'annual', amount, notes || null]);
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
});

app.post('/api/budget-versions/:id/bulk-lines', async (req, res, next) => {
  try {
    const t = tid(req);
    const { lines } = req.body;
    if (!Array.isArray(lines)) return res.status(400).json({ error: 'lines array required' });
    for (const l of lines) {
      await query(
        `INSERT INTO acc_budget_version_lines (tenant_id, budget_version_id, account_id, period, amount, notes)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (tenant_id, budget_version_id, account_id, period) DO UPDATE SET amount = $5, notes = $6`,
        [t, req.params.id, l.account_id, l.period || 'annual', l.amount || 0, l.notes || null]);
    }
    res.json({ success: true, message: `${lines.length} lines saved` });
  } catch (e) { next(e); }
});

// --- Copy / Approve ---
app.post('/api/budget-versions/:id/copy', async (req, res, next) => {
  try {
    const t = tid(req);
    const { new_name } = req.body;
    const src = await query('SELECT * FROM acc_budget_versions WHERE tenant_id = $1 AND id = $2', [t, req.params.id]);
    if (!src.rows.length) return res.status(404).json({ error: 'Budget not found' });
    const r = await query(
      'INSERT INTO acc_budget_versions (tenant_id, name, fiscal_year_id, description) VALUES ($1,$2,$3,$4) RETURNING *',
      [t, new_name || `${src.rows[0].name} (Copy)`, src.rows[0].fiscal_year_id, src.rows[0].description]);
    await query(
      `INSERT INTO acc_budget_version_lines (tenant_id, budget_version_id, account_id, period, amount, notes)
       SELECT $1, $2, account_id, period, amount, notes FROM acc_budget_version_lines WHERE tenant_id = $1 AND budget_version_id = $3`,
      [t, r.rows[0].id, req.params.id]);
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
});

app.post('/api/budget-versions/:id/approve', async (req, res, next) => {
  try {
    await query(`UPDATE acc_budget_versions SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW() WHERE tenant_id = $2 AND id = $3`,
      [req.body.approved_by || 'admin', tid(req), req.params.id]);
    const r = await query('SELECT * FROM acc_budget_versions WHERE tenant_id = $1 AND id = $2', [tid(req), req.params.id]);
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
});

// --- Budget vs Actual ---
app.get('/api/budget-versions/:id/vs-actual', async (req, res, next) => {
  try {
    const t = tid(req);
    const budget = await query('SELECT * FROM acc_budget_versions WHERE tenant_id = $1 AND id = $2', [t, req.params.id]);
    if (!budget.rows.length) return res.status(404).json({ error: 'Budget not found' });
    const lines = await query(
      `SELECT bl.account_id, a.account_code, a.account_name, bl.period, bl.amount as budget_amount
       FROM acc_budget_version_lines bl LEFT JOIN acc_accounts a ON bl.account_id = a.id
       WHERE bl.tenant_id = $1 AND bl.budget_version_id = $2`, [t, req.params.id]);
    const result = [];
    for (const line of lines.rows) {
      const actual = await query(
        `SELECT COALESCE(SUM(jl.debit_amount), 0) - COALESCE(SUM(jl.credit_amount), 0) as actual_amount
         FROM acc_journal_lines jl JOIN acc_journal_entries je ON jl.journal_entry_id = je.id
         WHERE jl.tenant_id = $1 AND jl.account_id = $2 AND je.status = 'posted'`, [t, line.account_id]);
      const budgetAmt = parseFloat(line.budget_amount) || 0;
      const actualAmt = parseFloat(actual.rows[0].actual_amount) || 0;
      result.push({ ...line, budget_amount: budgetAmt, actual_amount: actualAmt, variance: budgetAmt - actualAmt, variance_pct: budgetAmt !== 0 ? ((budgetAmt - actualAmt) / budgetAmt * 100) : 0 });
    }
    res.json({ success: true, data: { budget: budget.rows[0], comparisons: result } });
  } catch (e) { next(e); }
});

// --- Forecast ---
app.get('/api/budget-versions/:id/forecast', async (req, res, next) => {
  try {
    const t = tid(req);
    const months = parseInt(req.query.months) || 6;
    const lines = await query(
      `SELECT bl.account_id, a.account_name, bl.amount as budget_amount FROM acc_budget_version_lines bl
       LEFT JOIN acc_accounts a ON bl.account_id = a.id WHERE bl.tenant_id = $1 AND bl.budget_version_id = $2`, [t, req.params.id]);
    const forecast = lines.rows.map(l => ({
      account_id: l.account_id, account_name: l.account_name,
      monthly_budget: Math.round((parseFloat(l.budget_amount) || 0) / 12 * 100) / 100,
      forecast_months: months,
      forecast_total: Math.round((parseFloat(l.budget_amount) || 0) / 12 * months * 100) / 100
    }));
    res.json({ success: true, data: forecast });
  } catch (e) { next(e); }
});

// --- Alerts ---
app.get('/api/budget-alerts', async (req, res, next) => {
  try {
    const t = tid(req);
    const threshold = parseFloat(req.query.threshold) || 80;
    const budgets = await query(`SELECT * FROM acc_budget_versions WHERE tenant_id = $1 AND status = 'approved'`, [t]);
    const alerts = [];
    for (const b of budgets.rows) {
      const lines = await query(
        `SELECT bl.account_id, a.account_code, a.account_name, bl.amount as budget_amount FROM acc_budget_version_lines bl
         LEFT JOIN acc_accounts a ON bl.account_id = a.id WHERE bl.tenant_id = $1 AND bl.budget_version_id = $2`, [t, b.id]);
      for (const l of lines.rows) {
        const actual = await query(
          `SELECT COALESCE(SUM(jl.debit_amount), 0) - COALESCE(SUM(jl.credit_amount), 0) as actual FROM acc_journal_lines jl
           JOIN acc_journal_entries je ON jl.journal_entry_id = je.id WHERE jl.tenant_id = $1 AND jl.account_id = $2 AND je.status = 'posted'`, [t, l.account_id]);
        const budgetAmt = parseFloat(l.budget_amount) || 0;
        const actualAmt = parseFloat(actual.rows[0].actual) || 0;
        const usedPct = budgetAmt > 0 ? (actualAmt / budgetAmt * 100) : 0;
        if (usedPct >= threshold) {
          alerts.push({ budget_name: b.name, account_code: l.account_code, account_name: l.account_name, budget: budgetAmt, actual: actualAmt, used_pct: Math.round(usedPct * 100) / 100, severity: usedPct >= 100 ? 'critical' : 'warning' });
        }
      }
    }
    res.json({ success: true, data: alerts });
  } catch (e) { next(e); }
});

// --- CSV/PDF ---
app.get('/api/budget-versions/:id/csv', async (req, res, next) => {
  try {
    const csvGen = require('../shared/csv-generator');
    const lines = await query(
      `SELECT a.account_code, a.account_name, bl.period, bl.amount FROM acc_budget_version_lines bl
       LEFT JOIN acc_accounts a ON bl.account_id = a.id WHERE bl.tenant_id = $1 AND bl.budget_version_id = $2 ORDER BY a.account_code`, [tid(req), req.params.id]);
    csvGen.sendCSV(res, lines.rows, null, 'budget.csv');
  } catch (e) { next(e); }
});

// --- Report Builder ---
const REPORT_TABLES = {
  journal_entries: { table: 'acc_journal_entries', joins: '' },
  journal_lines: { table: 'acc_journal_lines', joins: 'JOIN acc_journal_entries je ON acc_journal_lines.journal_entry_id = je.id' },
  accounts: { table: 'acc_accounts', joins: '' },
  vendors: { table: 'acc_vendors', joins: '' },
  customers: { table: 'acc_customers', joins: '' },
  vouchers: { table: 'acc_vouchers', joins: '' },
  invoices: { table: 'acc_invoices', joins: '' }
};

app.get('/api/report-builder/tables', (_req, res) => {
  res.json({ success: true, data: Object.keys(REPORT_TABLES) });
});

app.get('/api/report-builder/tables/:name/columns', async (req, res, next) => {
  try {
    const tbl = REPORT_TABLES[req.params.name];
    if (!tbl) return res.status(404).json({ error: 'Table not found' });
    const r = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`, [tbl.table]);
    res.json({ success: true, data: r.rows });
  } catch (e) { next(e); }
});

app.get('/api/saved-reports', async (req, res, next) => {
  try {
    const r = await query('SELECT * FROM acc_saved_reports WHERE tenant_id = $1 ORDER BY updated_at DESC', [tid(req)]);
    res.json({ success: true, data: r.rows });
  } catch (e) { next(e); }
});

app.post('/api/saved-reports', async (req, res, next) => {
  try {
    const { name, description, config } = req.body;
    if (!name || !config) return res.status(400).json({ error: 'name and config required' });
    const r = await query(
      'INSERT INTO acc_saved_reports (tenant_id, name, description, config) VALUES ($1,$2,$3,$4) RETURNING *',
      [tid(req), name, description || null, JSON.stringify(config)]);
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
});

app.get('/api/saved-reports/:id', async (req, res, next) => {
  try {
    const r = await query('SELECT * FROM acc_saved_reports WHERE tenant_id = $1 AND id = $2', [tid(req), req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Report not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
});

app.put('/api/saved-reports/:id', async (req, res, next) => {
  try {
    const { name, description, config } = req.body;
    await query(`UPDATE acc_saved_reports SET name = COALESCE($1,name), description = COALESCE($2,description), config = COALESCE($3,config), updated_at = NOW() WHERE tenant_id = $4 AND id = $5`,
      [name, description, config ? JSON.stringify(config) : null, tid(req), req.params.id]);
    const r = await query('SELECT * FROM acc_saved_reports WHERE tenant_id = $1 AND id = $2', [tid(req), req.params.id]);
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
});

app.delete('/api/saved-reports/:id', async (req, res, next) => {
  try {
    await query('DELETE FROM acc_saved_reports WHERE tenant_id = $1 AND id = $2', [tid(req), req.params.id]);
    res.json({ success: true, message: 'Report deleted' });
  } catch (e) { next(e); }
});

app.post('/api/saved-reports/:id/run', async (req, res, next) => {
  try {
    const t = tid(req);
    const r = await query('SELECT * FROM acc_saved_reports WHERE tenant_id = $1 AND id = $2', [t, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Report not found' });
    const config = typeof r.rows[0].config === 'string' ? JSON.parse(r.rows[0].config) : r.rows[0].config;
    const tbl = REPORT_TABLES[config.table];
    if (!tbl) return res.status(400).json({ error: `Unknown table: ${config.table}` });
    const cols = config.columns && config.columns.length ? config.columns.join(', ') : '*';
    let sql = `SELECT ${cols} FROM ${tbl.table} ${tbl.joins} WHERE ${tbl.table}.tenant_id = $1`;
    const params = [t]; let idx = 2;
    if (config.filters) {
      for (const f of config.filters) {
        sql += ` AND ${tbl.table}.${f.column} ${f.operator || '='} $${idx++}`;
        params.push(f.value);
      }
    }
    if (config.order_by) sql += ` ORDER BY ${config.order_by}`;
    if (config.limit) { sql += ` LIMIT $${idx++}`; params.push(config.limit); }
    const result = await query(sql, params);
    res.json({ success: true, data: { report_name: r.rows[0].name, rows: result.rows, row_count: result.rows.length } });
  } catch (e) { next(e); }
});

// Health
app.get('/healthz', (_req, res) => res.json({ status: 'ok', service: 'accounting_budgeting' }));
app.get('/readyz', async (_req, res) => {
  try { await query('SELECT 1'); res.json({ status: 'ready' }); } catch (e) { res.status(503).json({ status: 'not_ready', error: e.message }); }
});
app.use((err, _req, res, _next) => { console.error('[Budgeting] Error:', err); res.status(500).json({ error: err.message }); });

const PORT = process.env.PORT || 8857;
app.listen(PORT, () => console.log(`Budgeting service on port ${PORT}`));
