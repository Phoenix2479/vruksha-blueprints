/**
 * Fiscal Periods - Lite Version (SQLite)
 * Port: 8859
 * Fiscal years, periods, budgets, cost centers
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');
const { sendCSV } = require('../shared/csv-generator');
const { sendPDF, addHeader, addTable, fmtDate } = require('../shared/pdf-generator');

const app = express();
const PORT = process.env.PORT || 8859;

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'accounting_fiscal_periods', mode: 'lite' });
});

// Fiscal Years
app.get('/api/fiscal-years', (req, res) => {
  try {
    const { is_active } = req.query;
    let sql = `
      SELECT fy.*,
        (SELECT COUNT(*) FROM acc_fiscal_periods fp WHERE fp.fiscal_year_id = fy.id) as period_count,
        (SELECT COUNT(*) FROM acc_fiscal_periods fp WHERE fp.fiscal_year_id = fy.id AND fp.status = 'closed') as closed_periods
      FROM acc_fiscal_years fy WHERE 1=1
    `;
    const params = [];
    if (is_active !== undefined) { sql += ' AND fy.is_active = ?'; params.push(is_active === 'true' ? 1 : 0); }
    sql += ' ORDER BY fy.start_date DESC';
    res.json({ success: true, data: query(sql, params) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/fiscal-years/:id', (req, res) => {
  try {
    const fy = get('SELECT * FROM acc_fiscal_years WHERE id = ?', [req.params.id]);
    if (!fy) return res.status(404).json({ success: false, error: 'Fiscal year not found' });
    const periods = query('SELECT * FROM acc_fiscal_periods WHERE fiscal_year_id = ? ORDER BY period_number', [req.params.id]);
    res.json({ success: true, data: { ...fy, periods } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/fiscal-years', (req, res) => {
  try {
    const { name, start_date, end_date, generate_periods = true } = req.body;
    if (!name || !start_date || !end_date) {
      return res.status(400).json({ success: false, error: 'name, start_date, end_date required' });
    }

    const id = uuidv4();
    run('INSERT INTO acc_fiscal_years (id, name, start_date, end_date) VALUES (?, ?, ?, ?)', [id, name, start_date, end_date]);

    if (generate_periods) {
      const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      let current = new Date(start_date);
      const endDt = new Date(end_date);
      let periodNum = 1;

      while (current < endDt) {
        const periodStart = new Date(current);
        const periodEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
        const actualEnd = periodEnd > endDt ? endDt : periodEnd;

        run(
          `INSERT INTO acc_fiscal_periods (id, fiscal_year_id, period_number, name, start_date, end_date, period_type)
           VALUES (?, ?, ?, ?, ?, ?, 'month')`,
          [uuidv4(), id, periodNum, `${months[current.getMonth()]} ${current.getFullYear()}`,
           periodStart.toISOString().split('T')[0], actualEnd.toISOString().split('T')[0]]
        );
        periodNum++;
        current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
      }
    }

    const created = get('SELECT * FROM acc_fiscal_years WHERE id = ?', [id]);
    const periods = query('SELECT * FROM acc_fiscal_periods WHERE fiscal_year_id = ? ORDER BY period_number', [id]);
    res.status(201).json({ success: true, data: { ...created, periods } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Periods
app.get('/api/periods', (req, res) => {
  try {
    const { fiscal_year_id, status } = req.query;
    let sql = `
      SELECT fp.*, fy.name as fiscal_year_name
      FROM acc_fiscal_periods fp JOIN acc_fiscal_years fy ON fp.fiscal_year_id = fy.id WHERE 1=1
    `;
    const params = [];
    if (fiscal_year_id) { sql += ' AND fp.fiscal_year_id = ?'; params.push(fiscal_year_id); }
    if (status) { sql += ' AND fp.status = ?'; params.push(status); }
    sql += ' ORDER BY fp.start_date DESC';
    res.json({ success: true, data: query(sql, params) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/periods/:id/close', (req, res) => {
  try {
    const period = get('SELECT * FROM acc_fiscal_periods WHERE id = ?', [req.params.id]);
    if (!period) return res.status(404).json({ success: false, error: 'Period not found' });
    if (period.status === 'closed') return res.status(400).json({ success: false, error: 'Already closed' });

    run("UPDATE acc_fiscal_periods SET status = 'closed', closed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", [req.params.id]);
    res.json({ success: true, data: get('SELECT * FROM acc_fiscal_periods WHERE id = ?', [req.params.id]) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/periods/:id/reopen', (req, res) => {
  try {
    run("UPDATE acc_fiscal_periods SET status = 'open', closed_at = NULL, updated_at = datetime('now') WHERE id = ? AND status = 'closed'", [req.params.id]);
    const updated = get('SELECT * FROM acc_fiscal_periods WHERE id = ?', [req.params.id]);
    if (!updated) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Budgets
app.get('/api/budgets', (req, res) => {
  try {
    const budgets = query(`
      SELECT b.*, fy.name as fiscal_year_name
      FROM acc_budgets b JOIN acc_fiscal_years fy ON b.fiscal_year_id = fy.id
      ORDER BY fy.start_date DESC, b.name
    `);
    res.json({ success: true, data: budgets });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/budgets', (req, res) => {
  try {
    const { fiscal_year_id, name, description, budget_type } = req.body;
    if (!fiscal_year_id || !name) return res.status(400).json({ success: false, error: 'fiscal_year_id and name required' });
    const id = uuidv4();
    run('INSERT INTO acc_budgets (id, fiscal_year_id, name, description, budget_type) VALUES (?, ?, ?, ?, ?)',
      [id, fiscal_year_id, name, description || null, budget_type || 'operating']);
    res.status(201).json({ success: true, data: get('SELECT * FROM acc_budgets WHERE id = ?', [id]) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// YEAR-END CLOSING
// =============================================================================

app.post('/api/fiscal-years/:id/close', (req, res) => {
  try {
    const fy = get('SELECT * FROM acc_fiscal_years WHERE id = ?', [req.params.id]);
    if (!fy) return res.status(404).json({ success: false, error: 'Fiscal year not found' });
    if (fy.is_closed) return res.status(400).json({ success: false, error: 'Already closed' });

    // Close all open periods
    run("UPDATE acc_fiscal_periods SET status = 'closed', closed_at = datetime('now') WHERE fiscal_year_id = ? AND status = 'open'", [req.params.id]);

    // Calculate net income (Revenue - Expenses)
    const netIncome = get(`
      SELECT
        COALESCE(SUM(CASE WHEN at.category = 'revenue' THEN le.credit_amount - le.debit_amount ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN at.category = 'expense' THEN le.debit_amount - le.credit_amount ELSE 0 END), 0) as net_income
      FROM acc_ledger_entries le
      JOIN acc_accounts a ON le.account_id = a.id
      JOIN acc_account_types at ON a.account_type_id = at.id
      WHERE le.entry_date BETWEEN ? AND ?
    `, [fy.start_date, fy.end_date]);

    const amount = netIncome?.net_income || 0;

    // Create closing journal entry
    const jeId = uuidv4();
    const entryNumber = `JE-CLOSE-${fy.name}`;
    run(`INSERT INTO acc_journal_entries (id, entry_number, entry_date, entry_type, description, reference_type, reference_id, status, posted_at)
      VALUES (?, ?, ?, 'CLO', ?, 'fiscal_year_close', ?, 'posted', datetime('now'))`,
      [jeId, entryNumber, fy.end_date, `Year-end closing for ${fy.name}`, req.params.id]);

    // Get retained earnings account
    const retainedEarnings = get("SELECT id FROM acc_accounts WHERE account_code IN ('3200', 'RE-001', 'RETAINED-EARNINGS') AND is_active = 1");

    if (retainedEarnings && Math.abs(amount) > 0.01) {
      let lineNum = 1;

      // Close revenue accounts (debit revenue, credit retained earnings)
      const revenueAccounts = query(`
        SELECT a.id, a.account_name, a.current_balance
        FROM acc_accounts a JOIN acc_account_types at ON a.account_type_id = at.id
        WHERE at.category = 'revenue' AND a.is_active = 1 AND a.current_balance != 0
      `);

      for (const acc of revenueAccounts) {
        const balance = Math.abs(acc.current_balance);
        if (balance < 0.01) continue;
        run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
          VALUES (?, ?, ?, ?, ?, ?, 0)`, [uuidv4(), jeId, lineNum++, acc.id, `Close revenue: ${acc.account_name}`, balance]);

        // Update ledger
        const newBal = acc.current_balance - balance;
        run(`INSERT INTO acc_ledger_entries (id, account_id, journal_entry_id, entry_date, description, debit_amount, credit_amount, running_balance)
          VALUES (?, ?, ?, ?, ?, ?, 0, ?)`, [uuidv4(), acc.id, jeId, fy.end_date, 'Year-end close', balance, newBal]);
        run("UPDATE acc_accounts SET current_balance = ?, updated_at = datetime('now') WHERE id = ?", [newBal, acc.id]);
      }

      // Close expense accounts (credit expense, debit retained earnings)
      const expenseAccounts = query(`
        SELECT a.id, a.account_name, a.current_balance
        FROM acc_accounts a JOIN acc_account_types at ON a.account_type_id = at.id
        WHERE at.category = 'expense' AND a.is_active = 1 AND a.current_balance != 0
      `);

      for (const acc of expenseAccounts) {
        const balance = Math.abs(acc.current_balance);
        if (balance < 0.01) continue;
        run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
          VALUES (?, ?, ?, ?, ?, 0, ?)`, [uuidv4(), jeId, lineNum++, acc.id, `Close expense: ${acc.account_name}`, balance]);

        const newBal = acc.current_balance + balance;
        run(`INSERT INTO acc_ledger_entries (id, account_id, journal_entry_id, entry_date, description, debit_amount, credit_amount, running_balance)
          VALUES (?, ?, ?, ?, ?, 0, ?, ?)`, [uuidv4(), acc.id, jeId, fy.end_date, 'Year-end close', balance, newBal]);
        run("UPDATE acc_accounts SET current_balance = ?, updated_at = datetime('now') WHERE id = ?", [newBal, acc.id]);
      }

      // Credit retained earnings for net income (or debit if loss)
      if (amount > 0) {
        run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
          VALUES (?, ?, ?, ?, 'Net income to retained earnings', 0, ?)`, [uuidv4(), jeId, lineNum, retainedEarnings.id, amount]);
      } else {
        run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
          VALUES (?, ?, ?, ?, 'Net loss to retained earnings', ?, 0)`, [uuidv4(), jeId, lineNum, retainedEarnings.id, Math.abs(amount)]);
      }

      // Update retained earnings balance
      const reAcc = get('SELECT current_balance FROM acc_accounts WHERE id = ?', [retainedEarnings.id]);
      const newREBal = (reAcc?.current_balance || 0) + amount;
      run(`INSERT INTO acc_ledger_entries (id, account_id, journal_entry_id, entry_date, description, debit_amount, credit_amount, running_balance)
        VALUES (?, ?, ?, ?, 'Year-end retained earnings', ?, ?, ?)`,
        [uuidv4(), retainedEarnings.id, jeId, fy.end_date, amount < 0 ? Math.abs(amount) : 0, amount > 0 ? amount : 0, newREBal]);
      run("UPDATE acc_accounts SET current_balance = ?, updated_at = datetime('now') WHERE id = ?", [newREBal, retainedEarnings.id]);

      // Update JE totals
      const totals = get('SELECT SUM(debit_amount) as td, SUM(credit_amount) as tc FROM acc_journal_lines WHERE journal_entry_id = ?', [jeId]);
      run('UPDATE acc_journal_entries SET total_debit = ?, total_credit = ? WHERE id = ?', [totals?.td || 0, totals?.tc || 0, jeId]);
    }

    // Mark fiscal year as closed
    run("UPDATE acc_fiscal_years SET is_closed = 1, is_active = 0, updated_at = datetime('now') WHERE id = ?", [req.params.id]);

    res.json({
      success: true,
      data: {
        fiscal_year: get('SELECT * FROM acc_fiscal_years WHERE id = ?', [req.params.id]),
        net_income: amount,
        closing_journal_entry_id: jeId
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cost Centers
app.get('/api/cost-centers', (req, res) => {
  try {
    const centers = query(`
      SELECT cc.*, p.name as parent_name
      FROM acc_cost_centers cc LEFT JOIN acc_cost_centers p ON cc.parent_id = p.id
      ORDER BY cc.code
    `);
    res.json({ success: true, data: centers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/cost-centers', (req, res) => {
  try {
    const { code, name, description, parent_id, manager_name } = req.body;
    if (!code || !name) return res.status(400).json({ success: false, error: 'code and name required' });
    const existing = get('SELECT id FROM acc_cost_centers WHERE code = ?', [code]);
    if (existing) return res.status(400).json({ success: false, error: 'Code already exists' });
    const id = uuidv4();
    run('INSERT INTO acc_cost_centers (id, code, name, description, parent_id, manager_name) VALUES (?, ?, ?, ?, ?, ?)',
      [id, code, name, description || null, parent_id || null, manager_name || null]);
    res.status(201).json({ success: true, data: get('SELECT * FROM acc_cost_centers WHERE id = ?', [id]) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// EXPORT
// =============================================================================

app.get('/api/fiscal-years/export/csv', (req, res) => {
  try {
    const data = query("SELECT name, start_date, end_date, CASE WHEN is_active THEN 'Active' ELSE 'Closed' END as status FROM acc_fiscal_years ORDER BY start_date DESC");
    sendCSV(res, data, [
      { key: 'name', label: 'Name' }, { key: 'start_date', label: 'Start Date' },
      { key: 'end_date', label: 'End Date' }, { key: 'status', label: 'Status' }
    ], 'fiscal_years.csv');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/periods/export/csv', (req, res) => {
  try {
    const data = query("SELECT fp.name, fp.start_date, fp.end_date, fp.period_type, fp.status, fy.name as fiscal_year FROM acc_fiscal_periods fp JOIN acc_fiscal_years fy ON fp.fiscal_year_id = fy.id ORDER BY fp.start_date DESC");
    sendCSV(res, data, [
      { key: 'fiscal_year', label: 'Fiscal Year' }, { key: 'name', label: 'Period' },
      { key: 'start_date', label: 'Start' }, { key: 'end_date', label: 'End' },
      { key: 'period_type', label: 'Type' }, { key: 'status', label: 'Status' }
    ], 'fiscal_periods.csv');
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
  app.listen(PORT, () => console.log(`Fiscal Periods (lite) on port ${PORT}`));
}).catch(err => { console.error('Failed to init DB:', err); process.exit(1); });

module.exports = app;
