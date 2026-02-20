/**
 * General Ledger - Lite Version (SQLite)
 * Port: 8852
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');
const { sendCSV } = require('../shared/csv-generator');
const { sendPDF, sendLandscapePDF, addHeader, addTable, fmtCurrency, fmtDate } = require('../shared/pdf-generator');
const { initAudit, getAuditLog, getRecordHistory, cleanupAuditLog } = require('../shared/audit');
const { initAuth, login, logout, authMiddleware } = require('../shared/auth');

const app = express();
const PORT = process.env.PORT || 8852;

app.use(cors());
app.use(express.json());
app.use(authMiddleware);

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'accounting_general_ledger', mode: 'lite' });
});

// Ledger entries for an account
app.get('/api/ledger/:accountId', (req, res) => {
  try {
    const { accountId } = req.params;
    const { start_date, end_date } = req.query;

    let sql = `
      SELECT le.*, a.account_code, a.account_name, je.entry_number
      FROM acc_ledger_entries le
      JOIN acc_accounts a ON le.account_id = a.id
      LEFT JOIN acc_journal_entries je ON le.journal_entry_id = je.id
      WHERE le.account_id = ?
    `;
    const params = [accountId];

    if (start_date) { sql += ' AND le.entry_date >= ?'; params.push(start_date); }
    if (end_date) { sql += ' AND le.entry_date <= ?'; params.push(end_date); }

    sql += ' ORDER BY le.entry_date, le.created_at';
    const entries = query(sql, params);
    res.json({ success: true, data: entries });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Trial balance
app.get('/api/trial-balance', (req, res) => {
  try {
    const { as_of_date } = req.query;
    let dateSql = '';
    const params = [];

    if (as_of_date) {
      dateSql = 'AND le.entry_date <= ?';
      params.push(as_of_date);
    }

    const balances = query(`
      SELECT a.id, a.account_code, a.account_name, at.category, at.normal_balance,
             COALESCE(SUM(le.debit_amount), 0) as total_debit,
             COALESCE(SUM(le.credit_amount), 0) as total_credit,
             COALESCE(SUM(le.debit_amount), 0) - COALESCE(SUM(le.credit_amount), 0) as net_balance
      FROM acc_accounts a
      LEFT JOIN acc_account_types at ON a.account_type_id = at.id
      LEFT JOIN acc_ledger_entries le ON a.id = le.account_id ${dateSql}
      WHERE a.is_active = 1
      GROUP BY a.id, a.account_code, a.account_name, at.category, at.normal_balance
      HAVING total_debit != 0 OR total_credit != 0
      ORDER BY a.account_code
    `, params);

    const totals = balances.reduce((acc, row) => {
      acc.total_debit += row.total_debit;
      acc.total_credit += row.total_credit;
      return acc;
    }, { total_debit: 0, total_credit: 0 });

    res.json({
      success: true,
      data: { balances, totals, is_balanced: Math.abs(totals.total_debit - totals.total_credit) < 0.01 }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Account balances summary
app.get('/api/balances', (req, res) => {
  try {
    const balances = query(`
      SELECT at.category,
             COUNT(a.id) as account_count,
             COALESCE(SUM(a.current_balance), 0) as total_balance
      FROM acc_accounts a
      JOIN acc_account_types at ON a.account_type_id = at.id
      WHERE a.is_active = 1
      GROUP BY at.category
      ORDER BY at.display_order
    `);
    res.json({ success: true, data: balances });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Post a ledger entry (usually called internally when journal entries are posted)
app.post('/api/ledger', (req, res) => {
  try {
    const { account_id, journal_entry_id, entry_date, description, debit_amount, credit_amount } = req.body;
    if (!account_id || !entry_date) {
      return res.status(400).json({ success: false, error: 'account_id and entry_date required' });
    }

    const account = get('SELECT * FROM acc_accounts WHERE id = ?', [account_id]);
    if (!account) return res.status(404).json({ success: false, error: 'Account not found' });

    const id = uuidv4();
    const debit = debit_amount || 0;
    const credit = credit_amount || 0;
    const newBalance = account.current_balance + debit - credit;

    run(
      `INSERT INTO acc_ledger_entries (id, account_id, journal_entry_id, entry_date, description, debit_amount, credit_amount, running_balance)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, account_id, journal_entry_id || null, entry_date, description || null, debit, credit, newBalance]
    );

    run('UPDATE acc_accounts SET current_balance = ?, updated_at = datetime(\'now\') WHERE id = ?', [newBalance, account_id]);

    const entry = get('SELECT * FROM acc_ledger_entries WHERE id = ?', [id]);
    res.status(201).json({ success: true, data: entry });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// EXPORT
// =============================================================================

app.get('/api/ledger/:accountId/export/csv', (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let sql = `SELECT le.entry_date, je.entry_number, le.description, le.debit_amount, le.credit_amount, le.running_balance
      FROM acc_ledger_entries le LEFT JOIN acc_journal_entries je ON le.journal_entry_id = je.id WHERE le.account_id = ?`;
    const params = [req.params.accountId];
    if (start_date) { sql += ' AND le.entry_date >= ?'; params.push(start_date); }
    if (end_date) { sql += ' AND le.entry_date <= ?'; params.push(end_date); }
    sql += ' ORDER BY le.entry_date, le.created_at';
    const account = get('SELECT account_code, account_name FROM acc_accounts WHERE id = ?', [req.params.accountId]);
    sendCSV(res, query(sql, params), [
      { key: 'entry_date', label: 'Date' }, { key: 'entry_number', label: 'Entry #' },
      { key: 'description', label: 'Description' }, { key: 'debit_amount', label: 'Debit' },
      { key: 'credit_amount', label: 'Credit' }, { key: 'running_balance', label: 'Balance' }
    ], `ledger_${account?.account_code || 'account'}.csv`);
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/trial-balance/export/csv', (req, res) => {
  try {
    const { as_of_date } = req.query;
    let dateSql = ''; const params = [];
    if (as_of_date) { dateSql = 'AND le.entry_date <= ?'; params.push(as_of_date); }
    const data = query(`SELECT a.account_code, a.account_name, at.category,
      COALESCE(SUM(le.debit_amount),0) as total_debit, COALESCE(SUM(le.credit_amount),0) as total_credit
      FROM acc_accounts a LEFT JOIN acc_account_types at ON a.account_type_id = at.id
      LEFT JOIN acc_ledger_entries le ON a.id = le.account_id ${dateSql}
      WHERE a.is_active = 1 GROUP BY a.id HAVING total_debit != 0 OR total_credit != 0 ORDER BY a.account_code`, params);
    sendCSV(res, data, [
      { key: 'account_code', label: 'Code' }, { key: 'account_name', label: 'Account' },
      { key: 'category', label: 'Category' }, { key: 'total_debit', label: 'Total Debit' },
      { key: 'total_credit', label: 'Total Credit' }
    ], 'trial_balance.csv');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/trial-balance/export/pdf', (req, res) => {
  try {
    const { as_of_date } = req.query;
    let dateSql = ''; const params = [];
    if (as_of_date) { dateSql = 'AND le.entry_date <= ?'; params.push(as_of_date); }
    const data = query(`SELECT a.account_code, a.account_name, at.category,
      COALESCE(SUM(le.debit_amount),0) as total_debit, COALESCE(SUM(le.credit_amount),0) as total_credit
      FROM acc_accounts a LEFT JOIN acc_account_types at ON a.account_type_id = at.id
      LEFT JOIN acc_ledger_entries le ON a.id = le.account_id ${dateSql}
      WHERE a.is_active = 1 GROUP BY a.id HAVING total_debit != 0 OR total_credit != 0 ORDER BY a.account_code`, params);
    sendPDF(res, (doc) => {
      addHeader(doc, 'Trial Balance', as_of_date ? `As of ${fmtDate(as_of_date)}` : 'Current');
      addTable(doc, [
        { key: 'account_code', label: 'Code', width: 1 }, { key: 'account_name', label: 'Account', width: 2.5 },
        { key: 'category', label: 'Category', width: 1 },
        { key: 'total_debit', label: 'Debit', width: 1.2, align: 'right', formatter: fmtCurrency },
        { key: 'total_credit', label: 'Credit', width: 1.2, align: 'right', formatter: fmtCurrency }
      ], data);
    }, 'trial_balance.pdf');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =============================================================================
// AUDIT TRAIL
// =============================================================================

app.get('/api/audit-log', (req, res) => {
  try {
    const data = getAuditLog(req.query);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/audit-log/:recordId/history', (req, res) => {
  try {
    const data = getRecordHistory(req.params.recordId);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/audit-settings', (req, res) => {
  try {
    let settings = get('SELECT * FROM acc_audit_settings WHERE id = ?', ['default']);
    if (!settings) {
      run('INSERT OR IGNORE INTO acc_audit_settings (id) VALUES (?)', ['default']);
      settings = get('SELECT * FROM acc_audit_settings WHERE id = ?', ['default']);
    }
    res.json({ success: true, data: settings });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/audit-settings', (req, res) => {
  try {
    const { retention_days, enabled } = req.body;
    run('INSERT OR REPLACE INTO acc_audit_settings (id, retention_days, enabled, updated_at) VALUES (?, ?, ?, datetime(\'now\'))',
      ['default', retention_days || 1095, enabled !== undefined ? (enabled ? 1 : 0) : 1]);
    if (retention_days) cleanupAuditLog();
    res.json({ success: true, data: get('SELECT * FROM acc_audit_settings WHERE id = ?', ['default']) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/audit-log/export/csv', (req, res) => {
  try {
    const data = getAuditLog({ ...req.query, limit: 10000 });
    sendCSV(res, data, [
      { key: 'created_at', label: 'Timestamp' }, { key: 'table_name', label: 'Table' },
      { key: 'record_id', label: 'Record ID' }, { key: 'action', label: 'Action' },
      { key: 'user_id', label: 'User' }, { key: 'ip_address', label: 'IP' }
    ], 'audit_log.csv');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =============================================================================
// AUTH (login/logout served from GL as central auth endpoint)
// =============================================================================

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, error: 'username and password required' });
    const result = login(username, password, req.ip);
    if (!result.success) return res.status(401).json(result);
    res.json(result);
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/auth/logout', (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    logout(token);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/auth/me', (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'Not authenticated' });
  const roles = query('SELECT r.* FROM acc_roles r JOIN acc_user_roles ur ON r.id = ur.role_id WHERE ur.user_id = ?', [req.user.id]);
  res.json({ success: true, data: { ...req.user, roles: roles.map(r => ({ id: r.id, name: r.name })) } });
});

// Users management
app.get('/api/users', (req, res) => {
  try {
    const users = query(`SELECT u.id, u.username, u.email, u.full_name, u.is_active, u.last_login, u.created_at,
      GROUP_CONCAT(r.name) as roles FROM acc_users u LEFT JOIN acc_user_roles ur ON u.id = ur.user_id
      LEFT JOIN acc_roles r ON ur.role_id = r.id GROUP BY u.id ORDER BY u.created_at`);
    res.json({ success: true, data: users });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/users', (req, res) => {
  try {
    const { username, email, password, full_name, role_ids } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, error: 'username and password required' });
    const { hashPassword } = require('../shared/auth');
    const id = uuidv4();
    run('INSERT INTO acc_users (id, username, email, password_hash, full_name) VALUES (?, ?, ?, ?, ?)',
      [id, username, email || null, hashPassword(password), full_name || username]);
    if (role_ids && role_ids.length) {
      role_ids.forEach(rid => run('INSERT OR IGNORE INTO acc_user_roles (user_id, role_id) VALUES (?, ?)', [id, rid]));
    }
    res.status(201).json({ success: true, data: get('SELECT id, username, email, full_name, is_active FROM acc_users WHERE id = ?', [id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/users/:id', (req, res) => {
  try {
    const { email, full_name, is_active, password, role_ids } = req.body;
    const user = get('SELECT * FROM acc_users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    if (email !== undefined) run('UPDATE acc_users SET email = ? WHERE id = ?', [email, req.params.id]);
    if (full_name !== undefined) run('UPDATE acc_users SET full_name = ? WHERE id = ?', [full_name, req.params.id]);
    if (is_active !== undefined) run('UPDATE acc_users SET is_active = ? WHERE id = ?', [is_active ? 1 : 0, req.params.id]);
    if (password) {
      const { hashPassword } = require('../shared/auth');
      run('UPDATE acc_users SET password_hash = ? WHERE id = ?', [hashPassword(password), req.params.id]);
    }
    if (role_ids) {
      run('DELETE FROM acc_user_roles WHERE user_id = ?', [req.params.id]);
      role_ids.forEach(rid => run('INSERT OR IGNORE INTO acc_user_roles (user_id, role_id) VALUES (?, ?)', [req.params.id, rid]));
    }
    res.json({ success: true, data: get('SELECT id, username, email, full_name, is_active FROM acc_users WHERE id = ?', [req.params.id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/users/:id', (req, res) => {
  try {
    run('DELETE FROM acc_user_roles WHERE user_id = ?', [req.params.id]);
    run('DELETE FROM acc_sessions WHERE user_id = ?', [req.params.id]);
    run('DELETE FROM acc_users WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/roles', (req, res) => {
  try {
    res.json({ success: true, data: query('SELECT * FROM acc_roles ORDER BY name') });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================
// MULTI-USER COLLABORATION
// ============================================

const locks = new Map();

app.post('/api/record-locks', (req, res) => {
  try {
    const { entity_type, entity_id, user_id, user_name } = req.body;
    if (!entity_type || !entity_id) return res.status(400).json({ success: false, error: 'entity_type and entity_id required' });
    const key = `${entity_type}:${entity_id}`;
    const existing = locks.get(key);
    if (existing && existing.user_id !== user_id && (Date.now() - existing.locked_at < 5 * 60 * 1000)) {
      return res.status(409).json({ success: false, error: `Record locked by ${existing.user_name || existing.user_id}`, locked_by: existing });
    }
    const lock = { entity_type, entity_id, user_id: user_id || 'anonymous', user_name: user_name || null, locked_at: Date.now() };
    locks.set(key, lock);
    res.json({ success: true, data: lock });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/record-locks/:entity_type/:entity_id', (req, res) => {
  try {
    const key = `${req.params.entity_type}:${req.params.entity_id}`;
    locks.delete(key);
    res.json({ success: true, message: 'Lock released' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/record-locks', (req, res) => {
  try {
    const now = Date.now();
    const activeLocks = [];
    for (const [key, lock] of locks) {
      if (now - lock.locked_at < 5 * 60 * 1000) activeLocks.push(lock);
      else locks.delete(key);
    }
    res.json({ success: true, data: activeLocks });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/activity-log', (req, res) => {
  try {
    const { entity_type, entity_id, user_id, limit: lmt } = req.query;
    let sql = 'SELECT * FROM acc_audit_log WHERE 1=1';
    const params = [];
    if (entity_type) { sql += ' AND entity_type = ?'; params.push(entity_type); }
    if (entity_id) { sql += ' AND entity_id = ?'; params.push(entity_id); }
    if (user_id) { sql += ' AND user_id = ?'; params.push(user_id); }
    sql += ` ORDER BY created_at DESC LIMIT ${parseInt(lmt) || 100}`;
    res.json({ success: true, data: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  if (req.accepts('html') && fs.existsSync(path.join(uiPath, 'index.html'))) {
    return res.sendFile(path.join(uiPath, 'index.html'));
  }
  res.status(404).json({ error: 'Not found' });
});

initDb().then(() => {
  initAudit({ query, run, get });
  initAuth({ query, run, get });
  app.listen(PORT, () => console.log(`General Ledger (lite) on port ${PORT}`));
}).catch(err => { console.error('Failed to init DB:', err); process.exit(1); });

module.exports = app;
