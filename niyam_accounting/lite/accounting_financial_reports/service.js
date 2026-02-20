/**
 * Financial Reports - Lite Version (SQLite)
 * Port: 8858
 * P&L, Balance Sheet, Cash Flow, Trial Balance
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, get } = require('../shared/db');
const { sendCSV } = require('../shared/csv-generator');
const { sendPDF, addHeader, addTable, fmtCurrency, fmtDate } = require('../shared/pdf-generator');

const app = express();
const PORT = process.env.PORT || 8858;

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'accounting_financial_reports', mode: 'lite' });
});

// Profit & Loss Statement
app.get('/api/reports/profit-loss', (req, res) => {
  try {
    const start_date = req.query.start_date || req.query.from_date;
    const end_date = req.query.end_date || req.query.to_date;
    if (!start_date || !end_date) {
      return res.status(400).json({ success: false, error: 'start_date/from_date and end_date/to_date required' });
    }

    const revenue = query(`
      SELECT a.account_code, a.account_name,
        COALESCE(SUM(le.credit_amount), 0) - COALESCE(SUM(le.debit_amount), 0) as amount
      FROM acc_accounts a
      JOIN acc_account_types at ON a.account_type_id = at.id
      LEFT JOIN acc_ledger_entries le ON a.id = le.account_id
        AND le.entry_date BETWEEN ? AND ?
      WHERE at.category = 'revenue' AND a.is_active = 1
      GROUP BY a.id ORDER BY a.account_code
    `, [start_date, end_date]);

    const expenses = query(`
      SELECT a.account_code, a.account_name,
        COALESCE(SUM(le.debit_amount), 0) - COALESCE(SUM(le.credit_amount), 0) as amount
      FROM acc_accounts a
      JOIN acc_account_types at ON a.account_type_id = at.id
      LEFT JOIN acc_ledger_entries le ON a.id = le.account_id
        AND le.entry_date BETWEEN ? AND ?
      WHERE at.category = 'expense' AND a.is_active = 1
      GROUP BY a.id ORDER BY a.account_code
    `, [start_date, end_date]);

    const totalRevenue = revenue.reduce((sum, r) => sum + r.amount, 0);
    const totalExpenses = expenses.reduce((sum, r) => sum + r.amount, 0);

    res.json({
      success: true,
      data: {
        period: { start_date, end_date },
        revenue: { items: revenue, total: totalRevenue },
        expenses: { items: expenses, total: totalExpenses },
        net_income: totalRevenue - totalExpenses
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Balance Sheet
app.get('/api/reports/balance-sheet', (req, res) => {
  try {
    const { as_of_date } = req.query;
    const asOf = as_of_date || new Date().toISOString().split('T')[0];

    const getCategory = (category, isDebit) => {
      const sign = isDebit ? 'SUM(le.debit_amount) - SUM(le.credit_amount)' : 'SUM(le.credit_amount) - SUM(le.debit_amount)';
      return query(`
        SELECT a.account_code, a.account_name,
          COALESCE(${sign}, 0) + a.opening_balance as balance
        FROM acc_accounts a
        JOIN acc_account_types at ON a.account_type_id = at.id
        LEFT JOIN acc_ledger_entries le ON a.id = le.account_id AND le.entry_date <= ?
        WHERE at.category = ? AND a.is_active = 1
        GROUP BY a.id ORDER BY a.account_code
      `, [asOf, category]);
    };

    const assets = getCategory('asset', true);
    const liabilities = getCategory('liability', false);
    const equity = getCategory('equity', false);

    const totalAssets = assets.reduce((s, r) => s + r.balance, 0);
    const totalLiabilities = liabilities.reduce((s, r) => s + r.balance, 0);
    const totalEquity = equity.reduce((s, r) => s + r.balance, 0);

    res.json({
      success: true,
      data: {
        as_of_date: asOf,
        assets: { items: assets, total: totalAssets },
        liabilities: { items: liabilities, total: totalLiabilities },
        equity: { items: equity, total: totalEquity },
        total_liabilities_and_equity: totalLiabilities + totalEquity,
        is_balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Trial Balance
app.get('/api/reports/trial-balance', (req, res) => {
  try {
    const { as_of_date } = req.query;
    let dateSql = '';
    const params = [];
    if (as_of_date) { dateSql = 'AND le.entry_date <= ?'; params.push(as_of_date); }

    const balances = query(`
      SELECT a.account_code, a.account_name, at.category, at.normal_balance,
        COALESCE(SUM(le.debit_amount), 0) as total_debit,
        COALESCE(SUM(le.credit_amount), 0) as total_credit
      FROM acc_accounts a
      JOIN acc_account_types at ON a.account_type_id = at.id
      LEFT JOIN acc_ledger_entries le ON a.id = le.account_id ${dateSql}
      WHERE a.is_active = 1
      GROUP BY a.id
      HAVING total_debit != 0 OR total_credit != 0
      ORDER BY a.account_code
    `, params);

    const totals = balances.reduce((acc, r) => {
      acc.total_debit += r.total_debit;
      acc.total_credit += r.total_credit;
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

// Cash Flow Statement (simplified)
app.get('/api/reports/cash-flow', (req, res) => {
  try {
    const start_date = req.query.start_date || req.query.from_date;
    const end_date = req.query.end_date || req.query.to_date;
    if (!start_date || !end_date) {
      return res.status(400).json({ success: false, error: 'start_date/from_date and end_date/to_date required' });
    }

    const operating = query(`
      SELECT 'Net Income' as description,
        COALESCE(SUM(CASE WHEN at.category = 'revenue' THEN le.credit_amount - le.debit_amount ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN at.category = 'expense' THEN le.debit_amount - le.credit_amount ELSE 0 END), 0) as amount
      FROM acc_ledger_entries le
      JOIN acc_accounts a ON le.account_id = a.id
      JOIN acc_account_types at ON a.account_type_id = at.id
      WHERE le.entry_date BETWEEN ? AND ?
    `, [start_date, end_date]);

    res.json({
      success: true,
      data: {
        period: { start_date, end_date },
        operating_activities: operating,
        investing_activities: [],
        financing_activities: [],
        net_cash_change: operating[0]?.amount || 0
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Dashboard summary
app.get('/api/reports/dashboard', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const monthStart = today.substring(0, 7) + '-01';

    const accounts = get('SELECT COUNT(*) as count FROM acc_accounts WHERE is_active = 1');
    const journalEntries = get('SELECT COUNT(*) as count FROM acc_journal_entries WHERE entry_date >= ?', [monthStart]);
    const totalAR = get("SELECT COALESCE(SUM(balance_due), 0) as total FROM acc_invoices WHERE status NOT IN ('paid','void')");
    const totalAP = get("SELECT COALESCE(SUM(balance_due), 0) as total FROM acc_bills WHERE status NOT IN ('paid','void')");

    res.json({
      success: true,
      data: {
        active_accounts: accounts?.count || 0,
        journal_entries_this_month: journalEntries?.count || 0,
        total_receivables: totalAR?.total || 0,
        total_payables: totalAP?.total || 0,
        net_position: (totalAR?.total || 0) - (totalAP?.total || 0)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// EXPORT
// =============================================================================

app.get('/api/reports/profit-loss/export/csv', (req, res) => {
  try {
    const start_date = req.query.start_date || req.query.from_date;
    const end_date = req.query.end_date || req.query.to_date;
    if (!start_date || !end_date) return res.status(400).json({ success: false, error: 'start_date and end_date required' });
    const revenue = query(`SELECT a.account_code, a.account_name, COALESCE(SUM(le.credit_amount),0) - COALESCE(SUM(le.debit_amount),0) as amount FROM acc_accounts a JOIN acc_account_types at ON a.account_type_id = at.id LEFT JOIN acc_ledger_entries le ON a.id = le.account_id AND le.entry_date BETWEEN ? AND ? WHERE at.category = 'revenue' AND a.is_active = 1 GROUP BY a.id ORDER BY a.account_code`, [start_date, end_date]);
    const expenses = query(`SELECT a.account_code, a.account_name, COALESCE(SUM(le.debit_amount),0) - COALESCE(SUM(le.credit_amount),0) as amount FROM acc_accounts a JOIN acc_account_types at ON a.account_type_id = at.id LEFT JOIN acc_ledger_entries le ON a.id = le.account_id AND le.entry_date BETWEEN ? AND ? WHERE at.category = 'expense' AND a.is_active = 1 GROUP BY a.id ORDER BY a.account_code`, [start_date, end_date]);
    const data = [...revenue.map(r => ({ ...r, type: 'Revenue' })), ...expenses.map(r => ({ ...r, type: 'Expense' }))];
    sendCSV(res, data, [
      { key: 'type', label: 'Type' }, { key: 'account_code', label: 'Code' },
      { key: 'account_name', label: 'Account' }, { key: 'amount', label: 'Amount' }
    ], 'profit_loss.csv');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/reports/profit-loss/export/pdf', (req, res) => {
  try {
    const start_date = req.query.start_date || req.query.from_date;
    const end_date = req.query.end_date || req.query.to_date;
    if (!start_date || !end_date) return res.status(400).json({ success: false, error: 'start_date and end_date required' });
    const revenue = query(`SELECT a.account_code, a.account_name, COALESCE(SUM(le.credit_amount),0) - COALESCE(SUM(le.debit_amount),0) as amount FROM acc_accounts a JOIN acc_account_types at ON a.account_type_id = at.id LEFT JOIN acc_ledger_entries le ON a.id = le.account_id AND le.entry_date BETWEEN ? AND ? WHERE at.category = 'revenue' AND a.is_active = 1 GROUP BY a.id ORDER BY a.account_code`, [start_date, end_date]);
    const expenses = query(`SELECT a.account_code, a.account_name, COALESCE(SUM(le.debit_amount),0) - COALESCE(SUM(le.credit_amount),0) as amount FROM acc_accounts a JOIN acc_account_types at ON a.account_type_id = at.id LEFT JOIN acc_ledger_entries le ON a.id = le.account_id AND le.entry_date BETWEEN ? AND ? WHERE at.category = 'expense' AND a.is_active = 1 GROUP BY a.id ORDER BY a.account_code`, [start_date, end_date]);
    const totalRev = revenue.reduce((s, r) => s + r.amount, 0);
    const totalExp = expenses.reduce((s, r) => s + r.amount, 0);
    sendPDF(res, (doc) => {
      addHeader(doc, 'Profit & Loss Statement', `${fmtDate(start_date)} to ${fmtDate(end_date)}`);
      doc.fontSize(11).fillColor('#1e293b').text('Revenue');
      doc.moveDown(0.3);
      addTable(doc, [
        { key: 'account_code', label: 'Code', width: 1 }, { key: 'account_name', label: 'Account', width: 3 },
        { key: 'amount', label: 'Amount', width: 1.5, align: 'right', formatter: fmtCurrency }
      ], revenue);
      doc.fontSize(10).text(`Total Revenue: ${fmtCurrency(totalRev)}`, { align: 'right' });
      doc.moveDown(0.5);
      doc.fontSize(11).text('Expenses');
      doc.moveDown(0.3);
      addTable(doc, [
        { key: 'account_code', label: 'Code', width: 1 }, { key: 'account_name', label: 'Account', width: 3 },
        { key: 'amount', label: 'Amount', width: 1.5, align: 'right', formatter: fmtCurrency }
      ], expenses);
      doc.fontSize(10).text(`Total Expenses: ${fmtCurrency(totalExp)}`, { align: 'right' });
      doc.moveDown(1);
      doc.fontSize(13).text(`Net Income: ${fmtCurrency(totalRev - totalExp)}`, { align: 'right' });
    }, 'profit_loss.pdf');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/reports/balance-sheet/export/pdf', (req, res) => {
  try {
    const asOf = req.query.as_of_date || new Date().toISOString().split('T')[0];
    const getCat = (cat, isDebit) => {
      const sign = isDebit ? 'SUM(le.debit_amount) - SUM(le.credit_amount)' : 'SUM(le.credit_amount) - SUM(le.debit_amount)';
      return query(`SELECT a.account_code, a.account_name, COALESCE(${sign}, 0) + a.opening_balance as balance FROM acc_accounts a JOIN acc_account_types at ON a.account_type_id = at.id LEFT JOIN acc_ledger_entries le ON a.id = le.account_id AND le.entry_date <= ? WHERE at.category = ? AND a.is_active = 1 GROUP BY a.id ORDER BY a.account_code`, [asOf, cat]);
    };
    const assets = getCat('asset', true), liabilities = getCat('liability', false), equity = getCat('equity', false);
    sendPDF(res, (doc) => {
      addHeader(doc, 'Balance Sheet', `As of ${fmtDate(asOf)}`);
      const cols = [{ key: 'account_code', label: 'Code', width: 1 }, { key: 'account_name', label: 'Account', width: 3 }, { key: 'balance', label: 'Balance', width: 1.5, align: 'right', formatter: fmtCurrency }];
      doc.fontSize(11).fillColor('#1e293b').text('Assets'); doc.moveDown(0.3); addTable(doc, cols, assets);
      doc.fontSize(10).text(`Total Assets: ${fmtCurrency(assets.reduce((s,r) => s + r.balance, 0))}`, { align: 'right' });
      doc.moveDown(0.5); doc.fontSize(11).text('Liabilities'); doc.moveDown(0.3); addTable(doc, cols, liabilities);
      doc.fontSize(10).text(`Total Liabilities: ${fmtCurrency(liabilities.reduce((s,r) => s + r.balance, 0))}`, { align: 'right' });
      doc.moveDown(0.5); doc.fontSize(11).text('Equity'); doc.moveDown(0.3); addTable(doc, cols, equity);
      doc.fontSize(10).text(`Total Equity: ${fmtCurrency(equity.reduce((s,r) => s + r.balance, 0))}`, { align: 'right' });
    }, 'balance_sheet.pdf');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/reports/balance-sheet/export/csv', (req, res) => {
  try {
    const asOf = req.query.as_of_date || new Date().toISOString().split('T')[0];
    const getCategory = (category, isDebit) => {
      const sign = isDebit ? 'SUM(le.debit_amount) - SUM(le.credit_amount)' : 'SUM(le.credit_amount) - SUM(le.debit_amount)';
      return query(`SELECT a.account_code, a.account_name, at.category, COALESCE(${sign}, 0) + a.opening_balance as balance
        FROM acc_accounts a JOIN acc_account_types at ON a.account_type_id = at.id
        LEFT JOIN acc_ledger_entries le ON a.id = le.account_id AND le.entry_date <= ?
        WHERE at.category = ? AND a.is_active = 1 GROUP BY a.id ORDER BY a.account_code`, [asOf, category]);
    };
    const data = [...getCategory('asset', true), ...getCategory('liability', false), ...getCategory('equity', false)];
    sendCSV(res, data, [
      { key: 'account_code', label: 'Code' }, { key: 'account_name', label: 'Account' },
      { key: 'category', label: 'Category' }, { key: 'balance', label: 'Balance' }
    ], 'balance_sheet.csv');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =============================================================================
// DASHBOARD CHART DATA
// =============================================================================

app.get('/api/dashboard/revenue-trend', (req, res) => {
  try {
    const data = query(`
      SELECT strftime('%Y-%m', le.entry_date) as month,
        COALESCE(SUM(le.credit_amount), 0) - COALESCE(SUM(le.debit_amount), 0) as revenue
      FROM acc_ledger_entries le JOIN acc_accounts a ON le.account_id = a.id
      JOIN acc_account_types at ON a.account_type_id = at.id
      WHERE at.category = 'revenue' AND le.entry_date >= date('now', '-12 months')
      GROUP BY month ORDER BY month`);
    const expenses = query(`
      SELECT strftime('%Y-%m', le.entry_date) as month,
        COALESCE(SUM(le.debit_amount), 0) - COALESCE(SUM(le.credit_amount), 0) as expense
      FROM acc_ledger_entries le JOIN acc_accounts a ON le.account_id = a.id
      JOIN acc_account_types at ON a.account_type_id = at.id
      WHERE at.category = 'expense' AND le.entry_date >= date('now', '-12 months')
      GROUP BY month ORDER BY month`);
    const expMap = {};
    expenses.forEach(e => { expMap[e.month] = e.expense; });
    const merged = data.map(d => ({ month: d.month, revenue: d.revenue, expense: expMap[d.month] || 0, profit: d.revenue - (expMap[d.month] || 0) }));
    res.json({ success: true, data: merged });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/dashboard/expense-breakdown', (req, res) => {
  try {
    const data = query(`
      SELECT a.account_name as category,
        COALESCE(SUM(le.debit_amount), 0) - COALESCE(SUM(le.credit_amount), 0) as amount
      FROM acc_ledger_entries le JOIN acc_accounts a ON le.account_id = a.id
      JOIN acc_account_types at ON a.account_type_id = at.id
      WHERE at.category = 'expense' AND le.entry_date >= date('now', '-12 months')
      GROUP BY a.id ORDER BY amount DESC LIMIT 10`);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/dashboard/cashflow-trend', (req, res) => {
  try {
    const data = query(`
      SELECT strftime('%Y-%m', le.entry_date) as month,
        COALESCE(SUM(le.debit_amount), 0) as inflow,
        COALESCE(SUM(le.credit_amount), 0) as outflow,
        COALESCE(SUM(le.debit_amount), 0) - COALESCE(SUM(le.credit_amount), 0) as net
      FROM acc_ledger_entries le JOIN acc_accounts a ON le.account_id = a.id
      JOIN acc_account_types at ON a.account_type_id = at.id
      WHERE at.category = 'asset' AND a.account_name LIKE '%cash%' OR a.account_name LIKE '%bank%'
      AND le.entry_date >= date('now', '-12 months')
      GROUP BY month ORDER BY month`);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/dashboard/ar-aging-chart', (req, res) => {
  try {
    const data = query(`SELECT
      SUM(CASE WHEN julianday('now') - julianday(i.due_date) <= 30 THEN i.total_amount - COALESCE(i.amount_received, 0) ELSE 0 END) as current_amount,
      SUM(CASE WHEN julianday('now') - julianday(i.due_date) BETWEEN 31 AND 60 THEN i.total_amount - COALESCE(i.amount_received, 0) ELSE 0 END) as days_31_60,
      SUM(CASE WHEN julianday('now') - julianday(i.due_date) BETWEEN 61 AND 90 THEN i.total_amount - COALESCE(i.amount_received, 0) ELSE 0 END) as days_61_90,
      SUM(CASE WHEN julianday('now') - julianday(i.due_date) > 90 THEN i.total_amount - COALESCE(i.amount_received, 0) ELSE 0 END) as over_90
      FROM acc_invoices i WHERE i.status IN ('posted','partial') AND i.total_amount > COALESCE(i.amount_received, 0)`);
    res.json({ success: true, data: data[0] || { current_amount: 0, days_31_60: 0, days_61_90: 0, over_90: 0 } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/dashboard/ap-aging-chart', (req, res) => {
  try {
    const data = query(`SELECT
      SUM(CASE WHEN julianday('now') - julianday(b.due_date) <= 30 THEN COALESCE(b.balance_due, b.total_amount) ELSE 0 END) as current_amount,
      SUM(CASE WHEN julianday('now') - julianday(b.due_date) BETWEEN 31 AND 60 THEN COALESCE(b.balance_due, b.total_amount) ELSE 0 END) as days_31_60,
      SUM(CASE WHEN julianday('now') - julianday(b.due_date) BETWEEN 61 AND 90 THEN COALESCE(b.balance_due, b.total_amount) ELSE 0 END) as days_61_90,
      SUM(CASE WHEN julianday('now') - julianday(b.due_date) > 90 THEN COALESCE(b.balance_due, b.total_amount) ELSE 0 END) as over_90
      FROM acc_bills b WHERE b.status IN ('approved','partial') AND COALESCE(b.balance_due, 0) > 0`);
    res.json({ success: true, data: data[0] || { current_amount: 0, days_31_60: 0, days_61_90: 0, over_90: 0 } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =============================================================================
// BUDGET VS ACTUALS
// =============================================================================

app.get('/api/reports/budget-vs-actual', (req, res) => {
  try {
    const { budget_id, fiscal_year_id } = req.query;
    let budgetFilter = '';
    const params = [];

    if (budget_id) {
      budgetFilter = 'WHERE b.id = ?';
      params.push(budget_id);
    } else if (fiscal_year_id) {
      budgetFilter = 'WHERE b.fiscal_year_id = ?';
      params.push(fiscal_year_id);
    }

    const budgets = query(`SELECT b.*, fy.name as year_name FROM acc_budgets b LEFT JOIN acc_fiscal_years fy ON b.fiscal_year_id = fy.id ${budgetFilter} ORDER BY b.created_at DESC`, params);

    const result = budgets.map(budget => {
      const lines = query(`SELECT bl.*, a.account_code, a.account_name, at.category FROM acc_budget_lines bl
        JOIN acc_accounts a ON bl.account_id = a.id JOIN acc_account_types at ON a.account_type_id = at.id
        WHERE bl.budget_id = ? ORDER BY a.account_code`, [budget.id]);

      const fy = get('SELECT * FROM acc_fiscal_years WHERE id = ?', [budget.fiscal_year_id]);
      const withActuals = lines.map(line => {
        const actual = get(`SELECT COALESCE(SUM(le.debit_amount), 0) as total_debit, COALESCE(SUM(le.credit_amount), 0) as total_credit
          FROM acc_ledger_entries le WHERE le.account_id = ? AND le.entry_date BETWEEN ? AND ?`,
          [line.account_id, fy?.start_date || '2025-04-01', fy?.end_date || '2026-03-31']);
        const actualAmount = line.category === 'expense' ? (actual.total_debit - actual.total_credit) : (actual.total_credit - actual.total_debit);
        const budgetAmt = line.annual_amount || 0;
        const variance = budgetAmt - actualAmount;
        const variancePct = budgetAmt ? ((variance / budgetAmt) * 100) : 0;
        return { ...line, budget_amount: budgetAmt, actual_amount: actualAmount, variance, variance_pct: Math.round(variancePct * 100) / 100 };
      });

      const totalBudget = withActuals.reduce((s, l) => s + l.budget_amount, 0);
      const totalActual = withActuals.reduce((s, l) => s + l.actual_amount, 0);
      return { ...budget, lines: withActuals, total_budget: totalBudget, total_actual: totalActual, total_variance: totalBudget - totalActual };
    });

    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/reports/budget-variance', (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const from = start_date || req.query.from_date || '2025-04-01';
    const to = end_date || req.query.to_date || '2026-03-31';

    const data = query(`
      SELECT a.account_code, a.account_name, at.category,
        COALESCE(bl.annual_amount, 0) as budget_amount,
        CASE WHEN at.category = 'expense' THEN COALESCE(SUM(le.debit_amount), 0) - COALESCE(SUM(le.credit_amount), 0)
          ELSE COALESCE(SUM(le.credit_amount), 0) - COALESCE(SUM(le.debit_amount), 0) END as actual_amount
      FROM acc_accounts a
      JOIN acc_account_types at ON a.account_type_id = at.id
      LEFT JOIN acc_budget_lines bl ON a.id = bl.account_id
      LEFT JOIN acc_ledger_entries le ON a.id = le.account_id AND le.entry_date BETWEEN ? AND ?
      WHERE a.is_active = 1 AND (bl.annual_amount > 0 OR le.id IS NOT NULL)
      GROUP BY a.id ORDER BY a.account_code`, [from, to]);

    const withVariance = data.map(d => ({
      ...d,
      variance: d.budget_amount - d.actual_amount,
      variance_pct: d.budget_amount ? Math.round(((d.budget_amount - d.actual_amount) / d.budget_amount) * 10000) / 100 : 0
    }));

    res.json({ success: true, data: withVariance });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =============================================================================
// DATA BACKUP & RESTORE
// =============================================================================

const backup = require('../shared/backup');

app.post('/api/backup/create', (req, res) => {
  try {
    const result = backup.createBackup(query);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/backup/list', (req, res) => {
  try {
    res.json({ success: true, data: backup.listBackups() });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/backup/restore', (req, res) => {
  try {
    const { file_name } = req.body;
    if (!file_name) return res.status(400).json({ success: false, error: 'file_name required' });
    const filePath = require('path').join(backup.BACKUP_DIR, file_name);
    if (!require('fs').existsSync(filePath)) return res.status(404).json({ success: false, error: 'Backup file not found' });
    const { run: runFn } = require('../shared/db');
    const result = backup.restoreBackup(filePath, runFn, query);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/backup/:fileName', (req, res) => {
  try {
    const deleted = backup.deleteBackup(req.params.fileName);
    res.json({ success: true, deleted });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/backup/:fileName/download', (req, res) => {
  try {
    const filePath = require('path').join(backup.BACKUP_DIR, req.params.fileName);
    if (!require('fs').existsSync(filePath)) return res.status(404).json({ success: false, error: 'Backup not found' });
    res.download(filePath);
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
  app.listen(PORT, () => console.log(`Financial Reports (lite) on port ${PORT}`));
}).catch(err => { console.error('Failed to init DB:', err); process.exit(1); });

module.exports = app;
