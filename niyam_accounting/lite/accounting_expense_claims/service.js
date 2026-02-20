/**
 * Expense Claims - Lite Version (SQLite)
 * Port: 8902
 * Split from accounts_payable for clean separation
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');
const { sendCSV } = require('../shared/csv-generator');

const app = express();
const PORT = process.env.PORT || 8902;

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'accounting_expense_claims', mode: 'lite' });
});

// =============================================================================
// EXPENSE CATEGORIES
// =============================================================================

app.get('/api/expense-categories', (req, res) => {
  try { res.json({ success: true, data: query('SELECT * FROM acc_expense_categories WHERE active = 1 ORDER BY name', []) }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/expense-categories', (req, res) => {
  try {
    const { name, gl_account_id, requires_receipt, max_amount } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'name required' });
    const id = uuidv4();
    run('INSERT INTO acc_expense_categories (id, name, gl_account_id, requires_receipt, max_amount) VALUES (?, ?, ?, ?, ?)',
      [id, name, gl_account_id || null, requires_receipt ? 1 : 0, max_amount || null]);
    res.status(201).json({ success: true, data: get('SELECT * FROM acc_expense_categories WHERE id = ?', [id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/expense-categories/:id', (req, res) => {
  try {
    const { name, gl_account_id, requires_receipt, max_amount, active } = req.body;
    run('UPDATE acc_expense_categories SET name = COALESCE(?, name), gl_account_id = COALESCE(?, gl_account_id), requires_receipt = COALESCE(?, requires_receipt), max_amount = COALESCE(?, max_amount), active = COALESCE(?, active) WHERE id = ?',
      [name, gl_account_id, requires_receipt !== undefined ? (requires_receipt ? 1 : 0) : null, max_amount, active !== undefined ? (active ? 1 : 0) : null, req.params.id]);
    res.json({ success: true, data: get('SELECT * FROM acc_expense_categories WHERE id = ?', [req.params.id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =============================================================================
// EXPENSE CLAIMS
// =============================================================================

app.get('/api/expense-claims', (req, res) => {
  try {
    const { status, employee_id } = req.query;
    let sql = 'SELECT * FROM acc_expense_claims WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (employee_id) { sql += ' AND employee_id = ?'; params.push(employee_id); }
    sql += ' ORDER BY created_at DESC';
    res.json({ success: true, data: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/expense-claims/csv', (req, res) => {
  try {
    const data = query('SELECT * FROM acc_expense_claims ORDER BY created_at DESC', []);
    sendCSV(res, data, 'expense-claims.csv');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/expense-claims/summary', (req, res) => {
  try {
    const byStatus = query('SELECT status, COUNT(*) as count, SUM(total) as total FROM acc_expense_claims GROUP BY status', []);
    const byEmployee = query('SELECT employee_name, COUNT(*) as claims, SUM(total) as total FROM acc_expense_claims GROUP BY employee_name ORDER BY total DESC LIMIT 20', []);
    res.json({ success: true, data: { by_status: byStatus, by_employee: byEmployee } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/expense-claims', (req, res) => {
  try {
    const { employee_id, employee_name, claim_date, notes } = req.body;
    if (!employee_name) return res.status(400).json({ success: false, error: 'employee_name required' });
    const id = uuidv4();
    const claimNumber = `EXP-${Date.now().toString(36).toUpperCase()}`;
    run('INSERT INTO acc_expense_claims (id, claim_number, employee_id, employee_name, claim_date, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [id, claimNumber, employee_id || null, employee_name, claim_date || new Date().toISOString().split('T')[0], notes || null]);
    res.status(201).json({ success: true, data: get('SELECT * FROM acc_expense_claims WHERE id = ?', [id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/expense-claims/:id', (req, res) => {
  try {
    const claim = get('SELECT * FROM acc_expense_claims WHERE id = ?', [req.params.id]);
    if (!claim) return res.status(404).json({ success: false, error: 'Claim not found' });
    const lines = query('SELECT * FROM acc_expense_lines WHERE claim_id = ? ORDER BY expense_date', [req.params.id]);
    res.json({ success: true, data: { ...claim, lines } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/expense-claims/:id', (req, res) => {
  try {
    const { employee_name, claim_date, notes } = req.body;
    run('UPDATE acc_expense_claims SET employee_name = COALESCE(?, employee_name), claim_date = COALESCE(?, claim_date), notes = COALESCE(?, notes), updated_at = datetime(\'now\') WHERE id = ? AND status = \'draft\'',
      [employee_name, claim_date, notes, req.params.id]);
    res.json({ success: true, data: get('SELECT * FROM acc_expense_claims WHERE id = ?', [req.params.id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/expense-claims/:id/submit', (req, res) => {
  try {
    run('UPDATE acc_expense_claims SET status = \'pending_approval\', updated_at = datetime(\'now\') WHERE id = ? AND status = \'draft\'', [req.params.id]);
    res.json({ success: true, data: get('SELECT * FROM acc_expense_claims WHERE id = ?', [req.params.id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/expense-claims/:id/approve', (req, res) => {
  try {
    const { approved_by } = req.body;
    run('UPDATE acc_expense_claims SET status = \'approved\', updated_at = datetime(\'now\') WHERE id = ? AND status = \'pending_approval\'', [req.params.id]);
    res.json({ success: true, data: get('SELECT * FROM acc_expense_claims WHERE id = ?', [req.params.id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/expense-claims/:id/reject', (req, res) => {
  try {
    const { reason } = req.body;
    run('UPDATE acc_expense_claims SET status = \'rejected\', updated_at = datetime(\'now\') WHERE id = ? AND status = \'pending_approval\'', [req.params.id]);
    res.json({ success: true, data: get('SELECT * FROM acc_expense_claims WHERE id = ?', [req.params.id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/expense-claims/:id/add-line', (req, res) => {
  try {
    const { expense_date, category, description, amount, tax, receipt_url, project_id } = req.body;
    if (!amount) return res.status(400).json({ success: false, error: 'amount required' });
    const lineId = uuidv4();
    run('INSERT INTO acc_expense_lines (id, claim_id, expense_date, category, description, amount, tax, receipt_url, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [lineId, req.params.id, expense_date || new Date().toISOString().split('T')[0], category || null, description || null, amount, tax || 0, receipt_url || null, project_id || null]);
    const total = query('SELECT SUM(amount + COALESCE(tax, 0)) as total FROM acc_expense_lines WHERE claim_id = ?', [req.params.id]);
    run('UPDATE acc_expense_claims SET total = ?, updated_at = datetime(\'now\') WHERE id = ?', [total[0]?.total || 0, req.params.id]);
    res.status(201).json({ success: true, data: get('SELECT * FROM acc_expense_lines WHERE id = ?', [lineId]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/expense-claims/:id/lines/:lineId', (req, res) => {
  try {
    run('DELETE FROM acc_expense_lines WHERE id = ? AND claim_id = ?', [req.params.lineId, req.params.id]);
    const total = query('SELECT SUM(amount + COALESCE(tax, 0)) as total FROM acc_expense_lines WHERE claim_id = ?', [req.params.id]);
    run('UPDATE acc_expense_claims SET total = ?, updated_at = datetime(\'now\') WHERE id = ?', [total[0]?.total || 0, req.params.id]);
    res.json({ success: true, message: 'Line removed' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/expense-claims/:id/pay', (req, res) => {
  try {
    const claim = get('SELECT * FROM acc_expense_claims WHERE id = ?', [req.params.id]);
    if (!claim) return res.status(404).json({ success: false, error: 'Claim not found' });
    if (claim.status !== 'approved') return res.status(400).json({ success: false, error: 'Claim must be approved before payment' });
    run('UPDATE acc_expense_claims SET status = \'paid\', paid_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: { claim_id: req.params.id, amount_paid: claim.total, message: 'Expense claim paid' } });
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
  app.listen(PORT, () => console.log(`Expense Claims (lite) on port ${PORT}`));
}).catch(err => { console.error('Failed to init DB:', err); process.exit(1); });

module.exports = app;
