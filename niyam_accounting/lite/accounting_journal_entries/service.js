/**
 * Journal Entries - Lite Version (SQLite)
 * Port: 8853
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');
const { sendCSV } = require('../shared/csv-generator');
const { sendPDF, sendLandscapePDF, addHeader, addTable, fmtCurrency, fmtDate } = require('../shared/pdf-generator');

const app = express();
const PORT = process.env.PORT || 8853;

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'accounting_journal_entries', mode: 'lite' });
});

// List journal entries
app.get('/api/journal-entries', (req, res) => {
  try {
    const { status, start_date, end_date, limit } = req.query;
    let sql = 'SELECT * FROM acc_journal_entries WHERE 1=1';
    const params = [];

    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (start_date) { sql += ' AND entry_date >= ?'; params.push(start_date); }
    if (end_date) { sql += ' AND entry_date <= ?'; params.push(end_date); }

    sql += ' ORDER BY entry_date DESC, created_at DESC';
    if (limit) { sql += ' LIMIT ?'; params.push(parseInt(limit)); }

    const entries = query(sql, params);
    res.json({ success: true, data: entries });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get single entry with lines
app.get('/api/journal-entries/:id', (req, res) => {
  try {
    const entry = get('SELECT * FROM acc_journal_entries WHERE id = ?', [req.params.id]);
    if (!entry) return res.status(404).json({ success: false, error: 'Journal entry not found' });

    const lines = query(`
      SELECT jl.*, a.account_code, a.account_name
      FROM acc_journal_lines jl
      JOIN acc_accounts a ON jl.account_id = a.id
      WHERE jl.journal_entry_id = ?
      ORDER BY jl.line_number
    `, [req.params.id]);

    res.json({ success: true, data: { ...entry, lines } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create journal entry with lines
app.post('/api/journal-entries', (req, res) => {
  try {
    const { entry_date, entry_type, description, reference, lines } = req.body;
    if (!entry_date || !lines || lines.length < 2) {
      return res.status(400).json({ success: false, error: 'entry_date and at least 2 lines required' });
    }

    let totalDebit = 0, totalCredit = 0;
    for (const line of lines) {
      totalDebit += line.debit_amount || 0;
      totalCredit += line.credit_amount || 0;
    }

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return res.status(400).json({ success: false, error: `Entry not balanced: debit=${totalDebit}, credit=${totalCredit}` });
    }

    const id = uuidv4();
    const count = query('SELECT COUNT(*) as cnt FROM acc_journal_entries')[0].cnt;
    const entryNumber = `JE-${String(count + 1).padStart(6, '0')}`;

    run(
      `INSERT INTO acc_journal_entries (id, entry_number, entry_date, entry_type, description, reference, total_debit, total_credit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, entryNumber, entry_date, entry_type || 'STD', description || null, reference || null, totalDebit, totalCredit]
    );

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      run(
        `INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount, cost_center_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), id, i + 1, line.account_id, line.description || null, line.debit_amount || 0, line.credit_amount || 0, line.cost_center_id || null]
      );
    }

    const created = get('SELECT * FROM acc_journal_entries WHERE id = ?', [id]);
    const createdLines = query('SELECT * FROM acc_journal_lines WHERE journal_entry_id = ? ORDER BY line_number', [id]);
    res.status(201).json({ success: true, data: { ...created, lines: createdLines } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Post (finalize) a journal entry -> creates ledger entries
app.post('/api/journal-entries/:id/post', (req, res) => {
  try {
    const entry = get('SELECT * FROM acc_journal_entries WHERE id = ?', [req.params.id]);
    if (!entry) return res.status(404).json({ success: false, error: 'Not found' });
    if (entry.status === 'posted') return res.status(400).json({ success: false, error: 'Already posted' });

    const lines = query('SELECT * FROM acc_journal_lines WHERE journal_entry_id = ?', [req.params.id]);

    for (const line of lines) {
      const account = get('SELECT * FROM acc_accounts WHERE id = ?', [line.account_id]);
      if (!account) continue;

      const newBalance = account.current_balance + (line.debit_amount || 0) - (line.credit_amount || 0);
      run(
        `INSERT INTO acc_ledger_entries (id, account_id, journal_entry_id, entry_date, description, debit_amount, credit_amount, running_balance)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), line.account_id, req.params.id, entry.entry_date, line.description, line.debit_amount || 0, line.credit_amount || 0, newBalance]
      );
      run('UPDATE acc_accounts SET current_balance = ?, updated_at = datetime(\'now\') WHERE id = ?', [newBalance, line.account_id]);
    }

    run("UPDATE acc_journal_entries SET status = 'posted', posted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", [req.params.id]);

    const updated = get('SELECT * FROM acc_journal_entries WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Void a journal entry
app.post('/api/journal-entries/:id/void', (req, res) => {
  try {
    const entry = get('SELECT * FROM acc_journal_entries WHERE id = ?', [req.params.id]);
    if (!entry) return res.status(404).json({ success: false, error: 'Not found' });

    run("UPDATE acc_journal_entries SET status = 'void', updated_at = datetime('now') WHERE id = ?", [req.params.id]);
    res.json({ success: true, message: 'Journal entry voided' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// EXPORT
// =============================================================================

app.get('/api/journal-entries/export/csv', (req, res) => {
  try {
    const { status, start_date, end_date } = req.query;
    let sql = 'SELECT * FROM acc_journal_entries WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (start_date) { sql += ' AND entry_date >= ?'; params.push(start_date); }
    if (end_date) { sql += ' AND entry_date <= ?'; params.push(end_date); }
    sql += ' ORDER BY entry_date DESC';
    sendCSV(res, query(sql, params), [
      { key: 'entry_number', label: 'Entry #' }, { key: 'entry_date', label: 'Date' },
      { key: 'entry_type', label: 'Type' }, { key: 'description', label: 'Description' },
      { key: 'total_debit', label: 'Total Debit' }, { key: 'total_credit', label: 'Total Credit' },
      { key: 'status', label: 'Status' }
    ], 'journal_entries.csv');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/journal-entries/export/pdf', (req, res) => {
  try {
    const { status, start_date, end_date } = req.query;
    let sql = 'SELECT * FROM acc_journal_entries WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (start_date) { sql += ' AND entry_date >= ?'; params.push(start_date); }
    if (end_date) { sql += ' AND entry_date <= ?'; params.push(end_date); }
    sql += ' ORDER BY entry_date DESC';
    const data = query(sql, params);
    sendLandscapePDF(res, (doc) => {
      addHeader(doc, 'Journal Entries', `${start_date || 'All'} to ${end_date || 'Present'}`);
      addTable(doc, [
        { key: 'entry_number', label: 'Entry #', width: 1.5 },
        { key: 'entry_date', label: 'Date', width: 1, formatter: fmtDate },
        { key: 'entry_type', label: 'Type', width: 0.7 },
        { key: 'description', label: 'Description', width: 3 },
        { key: 'total_debit', label: 'Debit', width: 1.2, align: 'right', formatter: fmtCurrency },
        { key: 'total_credit', label: 'Credit', width: 1.2, align: 'right', formatter: fmtCurrency },
        { key: 'status', label: 'Status', width: 0.8 }
      ], data);
    }, 'journal_entries.pdf');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================
// APPROVAL WORKFLOWS
// ============================================

app.get('/api/approval-rules', (req, res) => {
  try {
    const { entity_type } = req.query;
    let sql = 'SELECT * FROM acc_approval_rules WHERE 1=1';
    const params = [];
    if (entity_type) { sql += ' AND entity_type = ?'; params.push(entity_type); }
    sql += ' ORDER BY entity_type, sequence';
    res.json({ success: true, data: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/approval-rules', (req, res) => {
  try {
    const { entity_type, min_amount, max_amount, approver_role, sequence } = req.body;
    if (!entity_type || !approver_role) return res.status(400).json({ success: false, error: 'entity_type and approver_role required' });
    const id = uuidv4();
    run('INSERT INTO acc_approval_rules (id, entity_type, min_amount, max_amount, approver_role, sequence) VALUES (?, ?, ?, ?, ?, ?)',
      [id, entity_type, min_amount || 0, max_amount || null, approver_role, sequence || 1]);
    res.status(201).json({ success: true, data: get('SELECT * FROM acc_approval_rules WHERE id = ?', [id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/approval-rules/:id', (req, res) => {
  try {
    const { entity_type, min_amount, max_amount, approver_role, sequence, active } = req.body;
    run('UPDATE acc_approval_rules SET entity_type = COALESCE(?, entity_type), min_amount = COALESCE(?, min_amount), max_amount = COALESCE(?, max_amount), approver_role = COALESCE(?, approver_role), sequence = COALESCE(?, sequence), active = COALESCE(?, active) WHERE id = ?',
      [entity_type, min_amount, max_amount, approver_role, sequence, active, req.params.id]);
    res.json({ success: true, data: get('SELECT * FROM acc_approval_rules WHERE id = ?', [req.params.id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/approval-rules/:id', (req, res) => {
  try {
    run('DELETE FROM acc_approval_rules WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Rule deleted' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/pending-approvals', (req, res) => {
  try {
    const { entity_type } = req.query;
    const tables = {
      journal_entry: { table: 'acc_journal_entries', fields: 'id, entry_number as ref, description, total_debit as amount' },
      bill: { table: 'acc_bills', fields: 'id, bill_number as ref, description, total_amount as amount' },
      purchase_order: { table: 'acc_purchase_orders', fields: 'id, po_number as ref, notes as description, total as amount' },
      expense_claim: { table: 'acc_expense_claims', fields: 'id, claim_number as ref, notes as description, total as amount' },
      payroll_run: { table: 'acc_payroll_runs', fields: 'id, run_number as ref, \'Payroll\' as description, total_gross as amount' },
    };
    const results = [];
    const types = entity_type ? [entity_type] : Object.keys(tables);
    for (const type of types) {
      const cfg = tables[type];
      if (!cfg) continue;
      const items = query(`SELECT ${cfg.fields}, '${type}' as entity_type FROM ${cfg.table} WHERE status = 'pending_approval'`, []);
      results.push(...items);
    }
    res.json({ success: true, data: results });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/approve/:entity_type/:id', (req, res) => {
  try {
    const { entity_type, id } = req.params;
    const { actor_id, actor_name, comments } = req.body;
    const tables = { journal_entry: 'acc_journal_entries', bill: 'acc_bills', purchase_order: 'acc_purchase_orders', expense_claim: 'acc_expense_claims', payroll_run: 'acc_payroll_runs' };
    const table = tables[entity_type];
    if (!table) return res.status(400).json({ success: false, error: 'Invalid entity_type' });
    run(`UPDATE ${table} SET status = 'approved', approved_by = ?, approved_at = datetime('now') WHERE id = ?`, [actor_name || actor_id || 'system', id]);
    const histId = uuidv4();
    run('INSERT INTO acc_approval_history (id, entity_type, entity_id, action, actor_id, actor_name, comments) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [histId, entity_type, id, 'approved', actor_id || null, actor_name || null, comments || null]);
    res.json({ success: true, message: `${entity_type} approved` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/reject/:entity_type/:id', (req, res) => {
  try {
    const { entity_type, id } = req.params;
    const { actor_id, actor_name, comments } = req.body;
    const tables = { journal_entry: 'acc_journal_entries', bill: 'acc_bills', purchase_order: 'acc_purchase_orders', expense_claim: 'acc_expense_claims', payroll_run: 'acc_payroll_runs' };
    const table = tables[entity_type];
    if (!table) return res.status(400).json({ success: false, error: 'Invalid entity_type' });
    run(`UPDATE ${table} SET status = 'rejected' WHERE id = ?`, [id]);
    const histId = uuidv4();
    run('INSERT INTO acc_approval_history (id, entity_type, entity_id, action, actor_id, actor_name, comments) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [histId, entity_type, id, 'rejected', actor_id || null, actor_name || null, comments || null]);
    res.json({ success: true, message: `${entity_type} rejected` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/approval-history/:entity_type/:id', (req, res) => {
  try {
    const history = query('SELECT * FROM acc_approval_history WHERE entity_type = ? AND entity_id = ? ORDER BY created_at', [req.params.entity_type, req.params.id]);
    res.json({ success: true, data: history });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  if (req.accepts('html') && fs.existsSync(path.join(uiPath, 'index.html'))) {
    return res.sendFile(path.join(uiPath, 'index.html'));
  }
  res.status(404).json({ error: 'Not found' });
});

initDb().then(() => {
  app.listen(PORT, () => console.log(`Journal Entries (lite) on port ${PORT}`));
}).catch(err => { console.error('Failed to init DB:', err); process.exit(1); });

module.exports = app;
