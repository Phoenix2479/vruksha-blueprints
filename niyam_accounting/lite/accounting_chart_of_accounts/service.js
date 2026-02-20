/**
 * Chart of Accounts - Lite Version (SQLite)
 * Port: 8851
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');
const { sendCSV } = require('../shared/csv-generator');
const { sendPDF, addHeader, addTable, fmtCurrency } = require('../shared/pdf-generator');

const app = express();
const PORT = process.env.PORT || 8851;

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) {
  app.use(express.static(uiPath));
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'accounting_chart_of_accounts', mode: 'lite' });
});

// Account Types
app.get('/api/account-types', (req, res) => {
  try {
    const types = query('SELECT * FROM acc_account_types ORDER BY display_order, name');
    res.json({ success: true, data: types });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/account-types', (req, res) => {
  try {
    const { code, name, category, normal_balance, description, display_order } = req.body;
    if (!code || !name || !category || !normal_balance) {
      return res.status(400).json({ success: false, error: 'code, name, category, normal_balance required' });
    }
    const id = uuidv4();
    run(
      `INSERT INTO acc_account_types (id, code, name, category, normal_balance, description, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, code, name, category, normal_balance, description || null, display_order || 0]
    );
    const created = get('SELECT * FROM acc_account_types WHERE id = ?', [id]);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Accounts
app.get('/api/accounts', (req, res) => {
  try {
    const { category, is_active, search } = req.query;
    let sql = `
      SELECT a.*, at.name as type_name, at.category, at.normal_balance,
             p.account_name as parent_name
      FROM acc_accounts a
      LEFT JOIN acc_account_types at ON a.account_type_id = at.id
      LEFT JOIN acc_accounts p ON a.parent_account_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (category) {
      sql += ' AND at.category = ?';
      params.push(category);
    }
    if (is_active !== undefined) {
      sql += ' AND a.is_active = ?';
      params.push(is_active === 'true' ? 1 : 0);
    }
    if (search) {
      sql += ' AND (a.account_name LIKE ? OR a.account_code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY a.account_code';
    const accounts = query(sql, params);
    res.json({ success: true, data: accounts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/accounts/:id', (req, res) => {
  try {
    const account = get(`
      SELECT a.*, at.name as type_name, at.category, at.normal_balance
      FROM acc_accounts a
      LEFT JOIN acc_account_types at ON a.account_type_id = at.id
      WHERE a.id = ?
    `, [req.params.id]);
    if (!account) return res.status(404).json({ success: false, error: 'Account not found' });
    res.json({ success: true, data: account });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/accounts', (req, res) => {
  try {
    const { account_code, account_name, account_type_id, parent_account_id, description, gst_applicable, hsn_code, opening_balance } = req.body;
    if (!account_code || !account_name) {
      return res.status(400).json({ success: false, error: 'account_code and account_name required' });
    }
    const existing = get('SELECT id FROM acc_accounts WHERE account_code = ?', [account_code]);
    if (existing) return res.status(400).json({ success: false, error: 'Account code already exists' });

    const id = uuidv4();
    run(
      `INSERT INTO acc_accounts (id, account_code, account_name, account_type_id, parent_account_id, description, gst_applicable, hsn_code, opening_balance, current_balance)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, account_code, account_name, account_type_id || null, parent_account_id || null, description || null, gst_applicable ? 1 : 0, hsn_code || null, opening_balance || 0, opening_balance || 0]
    );
    const created = get('SELECT * FROM acc_accounts WHERE id = ?', [id]);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/accounts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = get('SELECT * FROM acc_accounts WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Account not found' });

    const fields = ['account_name', 'description', 'account_type_id', 'parent_account_id', 'is_active', 'gst_applicable', 'hsn_code'];
    const updates = [];
    const params = [];

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        params.push(field === 'is_active' || field === 'gst_applicable' ? (req.body[field] ? 1 : 0) : req.body[field]);
      }
    }

    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

    updates.push("updated_at = datetime('now')");
    params.push(id);
    run(`UPDATE acc_accounts SET ${updates.join(', ')} WHERE id = ?`, params);

    const updated = get('SELECT * FROM acc_accounts WHERE id = ?', [id]);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/accounts/:id', (req, res) => {
  try {
    const account = get('SELECT * FROM acc_accounts WHERE id = ?', [req.params.id]);
    if (!account) return res.status(404).json({ success: false, error: 'Account not found' });
    if (account.is_system) return res.status(400).json({ success: false, error: 'Cannot delete system account' });

    run("UPDATE acc_accounts SET is_active = 0, updated_at = datetime('now') WHERE id = ?", [req.params.id]);
    res.json({ success: true, message: 'Account deactivated' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Init default account types
app.post('/api/init-coa', (req, res) => {
  try {
    const existing = query('SELECT COUNT(*) as count FROM acc_account_types');
    if (existing[0].count > 0) {
      return res.json({ success: true, message: 'Chart of accounts already initialized' });
    }

    const defaults = [
      { code: 'ASSET', name: 'Assets', category: 'asset', normal_balance: 'debit', order: 1 },
      { code: 'LIABILITY', name: 'Liabilities', category: 'liability', normal_balance: 'credit', order: 2 },
      { code: 'EQUITY', name: 'Equity', category: 'equity', normal_balance: 'credit', order: 3 },
      { code: 'REVENUE', name: 'Revenue', category: 'revenue', normal_balance: 'credit', order: 4 },
      { code: 'EXPENSE', name: 'Expenses', category: 'expense', normal_balance: 'debit', order: 5 },
    ];

    for (const t of defaults) {
      run(
        'INSERT INTO acc_account_types (id, code, name, category, normal_balance, display_order) VALUES (?, ?, ?, ?, ?, ?)',
        [uuidv4(), t.code, t.name, t.category, t.normal_balance, t.order]
      );
    }

    res.json({ success: true, message: 'Default account types created' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// EXPORT
// =============================================================================

app.get('/api/accounts/export/csv', (req, res) => {
  try {
    const data = query(`
      SELECT a.account_code, a.account_name, at.category, at.name as type_name,
        a.current_balance, a.opening_balance, CASE WHEN a.is_active THEN 'Active' ELSE 'Inactive' END as status
      FROM acc_accounts a LEFT JOIN acc_account_types at ON a.account_type_id = at.id ORDER BY a.account_code
    `);
    sendCSV(res, data, [
      { key: 'account_code', label: 'Account Code' },
      { key: 'account_name', label: 'Account Name' },
      { key: 'category', label: 'Category' },
      { key: 'type_name', label: 'Type' },
      { key: 'opening_balance', label: 'Opening Balance' },
      { key: 'current_balance', label: 'Current Balance' },
      { key: 'status', label: 'Status' }
    ], 'chart_of_accounts.csv');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/accounts/export/pdf', (req, res) => {
  try {
    const data = query(`
      SELECT a.account_code, a.account_name, at.category, at.name as type_name,
        a.current_balance, a.opening_balance
      FROM acc_accounts a LEFT JOIN acc_account_types at ON a.account_type_id = at.id
      WHERE a.is_active = 1 ORDER BY a.account_code
    `);
    sendPDF(res, (doc) => {
      addHeader(doc, 'Chart of Accounts', `Generated ${new Date().toLocaleDateString('en-IN')}`);
      addTable(doc, [
        { key: 'account_code', label: 'Code', width: 1 },
        { key: 'account_name', label: 'Account Name', width: 2.5 },
        { key: 'category', label: 'Category', width: 1 },
        { key: 'type_name', label: 'Type', width: 1 },
        { key: 'current_balance', label: 'Balance', width: 1.2, align: 'right', formatter: fmtCurrency }
      ], data);
    }, 'chart_of_accounts.pdf');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =============================================================================
// MULTI-CURRENCY
// =============================================================================

app.get('/api/currencies', (req, res) => {
  try { res.json({ success: true, data: query('SELECT * FROM acc_currencies ORDER BY is_base DESC, code') }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/currencies', (req, res) => {
  try {
    const { code, name, symbol, decimal_places, exchange_rate } = req.body;
    if (!code || !name) return res.status(400).json({ success: false, error: 'code and name required' });
    const id = uuidv4();
    run('INSERT INTO acc_currencies (id, code, name, symbol, decimal_places, exchange_rate, rate_date) VALUES (?, ?, ?, ?, ?, ?, date(\'now\'))',
      [id, code.toUpperCase(), name, symbol || '', decimal_places || 2, exchange_rate || 1.0]);
    res.status(201).json({ success: true, data: get('SELECT * FROM acc_currencies WHERE id = ?', [id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/currencies/:id', (req, res) => {
  try {
    const { name, symbol, decimal_places, exchange_rate, is_active } = req.body;
    const cur = get('SELECT * FROM acc_currencies WHERE id = ?', [req.params.id]);
    if (!cur) return res.status(404).json({ success: false, error: 'Currency not found' });
    run(`UPDATE acc_currencies SET name = COALESCE(?, name), symbol = COALESCE(?, symbol),
      decimal_places = COALESCE(?, decimal_places), exchange_rate = COALESCE(?, exchange_rate),
      is_active = COALESCE(?, is_active), rate_date = date('now') WHERE id = ?`,
      [name, symbol, decimal_places, exchange_rate, is_active, req.params.id]);
    res.json({ success: true, data: get('SELECT * FROM acc_currencies WHERE id = ?', [req.params.id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/exchange-rates', (req, res) => {
  try {
    const { from_currency, to_currency } = req.query;
    let sql = 'SELECT * FROM acc_exchange_rates WHERE 1=1';
    const params = [];
    if (from_currency) { sql += ' AND from_currency = ?'; params.push(from_currency); }
    if (to_currency) { sql += ' AND to_currency = ?'; params.push(to_currency); }
    sql += ' ORDER BY effective_date DESC LIMIT 100';
    res.json({ success: true, data: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/exchange-rates', (req, res) => {
  try {
    const { from_currency, to_currency, rate, effective_date } = req.body;
    if (!from_currency || !to_currency || !rate) return res.status(400).json({ success: false, error: 'from_currency, to_currency, rate required' });
    const id = uuidv4();
    run('INSERT INTO acc_exchange_rates (id, from_currency, to_currency, rate, effective_date) VALUES (?, ?, ?, ?, ?)',
      [id, from_currency, to_currency, rate, effective_date || new Date().toISOString().split('T')[0]]);
    run('UPDATE acc_currencies SET exchange_rate = ?, rate_date = ? WHERE code = ?', [rate, effective_date || new Date().toISOString().split('T')[0], from_currency]);
    res.status(201).json({ success: true, data: get('SELECT * FROM acc_exchange_rates WHERE id = ?', [id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/convert-currency', (req, res) => {
  try {
    const { amount, from_currency, to_currency } = req.body;
    if (!amount || !from_currency || !to_currency) return res.status(400).json({ success: false, error: 'amount, from_currency, to_currency required' });
    const rate = get('SELECT rate FROM acc_exchange_rates WHERE from_currency = ? AND to_currency = ? ORDER BY effective_date DESC LIMIT 1', [from_currency, to_currency]);
    if (!rate) {
      const fromCur = get('SELECT exchange_rate FROM acc_currencies WHERE code = ?', [from_currency]);
      const toCur = get('SELECT exchange_rate FROM acc_currencies WHERE code = ?', [to_currency]);
      if (fromCur && toCur) {
        const converted = amount * (toCur.exchange_rate / fromCur.exchange_rate);
        return res.json({ success: true, data: { amount, from_currency, to_currency, rate: toCur.exchange_rate / fromCur.exchange_rate, converted_amount: Math.round(converted * 100) / 100 } });
      }
      return res.status(404).json({ success: false, error: 'No exchange rate found' });
    }
    res.json({ success: true, data: { amount, from_currency, to_currency, rate: rate.rate, converted_amount: Math.round(amount * rate.rate * 100) / 100 } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/forex-gain-loss', (req, res) => {
  try {
    const data = query(`SELECT ft.*, je.entry_number, je.entry_date FROM acc_forex_transactions ft
      LEFT JOIN acc_journal_entries je ON ft.journal_entry_id = je.id ORDER BY ft.created_at DESC LIMIT 100`);
    const summary = get('SELECT COALESCE(SUM(gain_loss), 0) as total_gain_loss, COUNT(*) as total_transactions FROM acc_forex_transactions');
    res.json({ success: true, data: { transactions: data, summary } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Seed default currencies
app.post('/api/init-currencies', (req, res) => {
  try {
    const currencies = [
      { code: 'INR', name: 'Indian Rupee', symbol: '\u20B9', dp: 2, base: 1, rate: 1.0 },
      { code: 'USD', name: 'US Dollar', symbol: '$', dp: 2, base: 0, rate: 0.012 },
      { code: 'EUR', name: 'Euro', symbol: '\u20AC', dp: 2, base: 0, rate: 0.011 },
      { code: 'GBP', name: 'British Pound', symbol: '\u00A3', dp: 2, base: 0, rate: 0.0095 },
      { code: 'AED', name: 'UAE Dirham', symbol: 'AED', dp: 2, base: 0, rate: 0.044 },
      { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', dp: 2, base: 0, rate: 0.016 },
      { code: 'JPY', name: 'Japanese Yen', symbol: '\u00A5', dp: 0, base: 0, rate: 1.78 },
      { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', dp: 2, base: 0, rate: 0.018 }
    ];
    let created = 0;
    currencies.forEach(c => {
      const exists = get('SELECT id FROM acc_currencies WHERE code = ?', [c.code]);
      if (!exists) {
        run('INSERT INTO acc_currencies (id, code, name, symbol, decimal_places, is_base, exchange_rate, rate_date) VALUES (?, ?, ?, ?, ?, ?, ?, date(\'now\'))',
          [uuidv4(), c.code, c.name, c.symbol, c.dp, c.base, c.rate]);
        created++;
      }
    });
    res.json({ success: true, message: `${created} currencies created` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =============================================================================
// MULTI-COMPANY / MULTI-BRANCH
// =============================================================================

app.get('/api/companies', (req, res) => {
  try { res.json({ success: true, data: query('SELECT * FROM acc_companies ORDER BY name') }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/companies', (req, res) => {
  try {
    const { code, name, gstin, pan, tan, address_line1, city, state, state_code, pincode, phone, email, base_currency } = req.body;
    if (!code || !name) return res.status(400).json({ success: false, error: 'code and name required' });
    const id = uuidv4();
    run(`INSERT INTO acc_companies (id, code, name, gstin, pan, tan, address_line1, city, state, state_code, pincode, phone, email, base_currency)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, code, name, gstin || null, pan || null, tan || null, address_line1 || null, city || null, state || null, state_code || null, pincode || null, phone || null, email || null, base_currency || 'INR']);
    res.status(201).json({ success: true, data: get('SELECT * FROM acc_companies WHERE id = ?', [id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/companies/:id', (req, res) => {
  try {
    const fields = ['name','gstin','pan','tan','address_line1','address_line2','city','state','state_code','pincode','phone','email','base_currency','is_active'];
    const updates = []; const params = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); } });
    if (updates.length) { params.push(req.params.id); run(`UPDATE acc_companies SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`, params); }
    res.json({ success: true, data: get('SELECT * FROM acc_companies WHERE id = ?', [req.params.id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/companies/:id', (req, res) => {
  try { run('DELETE FROM acc_companies WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/branches', (req, res) => {
  try {
    const { company_id } = req.query;
    let sql = 'SELECT * FROM acc_branches'; const params = [];
    if (company_id) { sql += ' WHERE company_id = ?'; params.push(company_id); }
    sql += ' ORDER BY name';
    res.json({ success: true, data: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/branches', (req, res) => {
  try {
    const { company_id, code, name, address, city, state, pincode, gstin, is_head_office } = req.body;
    if (!company_id || !code || !name) return res.status(400).json({ success: false, error: 'company_id, code, name required' });
    const id = uuidv4();
    run('INSERT INTO acc_branches (id, company_id, code, name, address, city, state, pincode, gstin, is_head_office) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, company_id, code, name, address || null, city || null, state || null, pincode || null, gstin || null, is_head_office || 0]);
    res.status(201).json({ success: true, data: get('SELECT * FROM acc_branches WHERE id = ?', [id]) });
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
  app.listen(PORT, () => console.log(`Chart of Accounts (lite) on port ${PORT}`));
}).catch(err => {
  console.error('Failed to init DB:', err);
  process.exit(1);
});

module.exports = app;
