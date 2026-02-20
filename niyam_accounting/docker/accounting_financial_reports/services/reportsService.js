// Financial Reports Service - Business logic and DB queries

let db;
try {
  db = require('../../../../../db/postgres');
} catch (_) {
  db = require('@vruksha/platform/db/postgres');
}

const { query } = db;

// =============================================================================
// TRIAL BALANCE
// =============================================================================

async function getTrialBalance(tenantId, { as_of_date }) {
  let dateFilter = '';
  const params = [tenantId];
  let paramIndex = 2;

  if (as_of_date) {
    dateFilter = ` AND le.entry_date <= $${paramIndex++}`;
    params.push(as_of_date);
  }

  const result = await query(`
    SELECT
      a.id as account_id,
      a.account_code,
      a.account_name,
      at.name as account_type,
      at.category,
      at.normal_balance,
      COALESCE(SUM(le.debit_amount), 0) as total_debits,
      COALESCE(SUM(le.credit_amount), 0) as total_credits,
      CASE
        WHEN at.normal_balance = 'DEBIT'
          THEN COALESCE(SUM(le.debit_amount), 0) - COALESCE(SUM(le.credit_amount), 0)
        ELSE COALESCE(SUM(le.credit_amount), 0) - COALESCE(SUM(le.debit_amount), 0)
      END as balance
    FROM acc_accounts a
    JOIN acc_account_types at ON a.account_type_id = at.id
    LEFT JOIN acc_ledger_entries le ON a.id = le.account_id AND a.tenant_id = le.tenant_id ${dateFilter}
    WHERE a.tenant_id = $1 AND a.is_active = true
    GROUP BY a.id, a.account_code, a.account_name, at.name, at.category, at.normal_balance
    HAVING COALESCE(SUM(le.debit_amount), 0) != 0 OR COALESCE(SUM(le.credit_amount), 0) != 0
    ORDER BY a.account_code
  `, params);

  return result.rows;
}

// =============================================================================
// BALANCE SHEET
// =============================================================================

async function getBalanceSheetData(tenantId, asOfDate) {
  // Assets
  const assets = await query(`
    SELECT
      a.id, a.account_code, a.account_name, at.name as account_type,
      COALESCE(SUM(le.debit_amount - le.credit_amount), 0) as balance
    FROM acc_accounts a
    JOIN acc_account_types at ON a.account_type_id = at.id
    LEFT JOIN acc_ledger_entries le ON a.id = le.account_id AND le.entry_date <= $2
    WHERE a.tenant_id = $1 AND at.category = 'ASSET' AND a.is_active = true
    GROUP BY a.id, a.account_code, a.account_name, at.name
    HAVING COALESCE(SUM(le.debit_amount - le.credit_amount), 0) != 0
    ORDER BY a.account_code
  `, [tenantId, asOfDate]);

  // Liabilities
  const liabilities = await query(`
    SELECT
      a.id, a.account_code, a.account_name, at.name as account_type,
      COALESCE(SUM(le.credit_amount - le.debit_amount), 0) as balance
    FROM acc_accounts a
    JOIN acc_account_types at ON a.account_type_id = at.id
    LEFT JOIN acc_ledger_entries le ON a.id = le.account_id AND le.entry_date <= $2
    WHERE a.tenant_id = $1 AND at.category = 'LIABILITY' AND a.is_active = true
    GROUP BY a.id, a.account_code, a.account_name, at.name
    HAVING COALESCE(SUM(le.credit_amount - le.debit_amount), 0) != 0
    ORDER BY a.account_code
  `, [tenantId, asOfDate]);

  // Equity
  const equity = await query(`
    SELECT
      a.id, a.account_code, a.account_name, at.name as account_type,
      COALESCE(SUM(le.credit_amount - le.debit_amount), 0) as balance
    FROM acc_accounts a
    JOIN acc_account_types at ON a.account_type_id = at.id
    LEFT JOIN acc_ledger_entries le ON a.id = le.account_id AND le.entry_date <= $2
    WHERE a.tenant_id = $1 AND at.category = 'EQUITY' AND a.is_active = true
    GROUP BY a.id, a.account_code, a.account_name, at.name
    ORDER BY a.account_code
  `, [tenantId, asOfDate]);

  // Calculate retained earnings (Revenue - Expenses)
  const retainedEarnings = await query(`
    SELECT
      COALESCE(SUM(CASE WHEN at.category = 'REVENUE' THEN le.credit_amount - le.debit_amount ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN at.category = 'EXPENSE' THEN le.debit_amount - le.credit_amount ELSE 0 END), 0) as retained_earnings
    FROM acc_ledger_entries le
    JOIN acc_accounts a ON le.account_id = a.id
    JOIN acc_account_types at ON a.account_type_id = at.id
    WHERE le.tenant_id = $1 AND le.entry_date <= $2
  `, [tenantId, asOfDate]);

  return {
    assets: assets.rows,
    liabilities: liabilities.rows,
    equity: equity.rows,
    retainedEarnings: parseFloat(retainedEarnings.rows[0]?.retained_earnings || 0)
  };
}

// =============================================================================
// PROFIT & LOSS STATEMENT
// =============================================================================

async function getProfitLossData(tenantId, startDate, endDate) {
  // Revenue accounts
  const revenue = await query(`
    SELECT
      a.id, a.account_code, a.account_name, at.name as account_type,
      COALESCE(SUM(le.credit_amount - le.debit_amount), 0) as balance
    FROM acc_accounts a
    JOIN acc_account_types at ON a.account_type_id = at.id
    LEFT JOIN acc_ledger_entries le ON a.id = le.account_id
      AND le.entry_date BETWEEN $2 AND $3
    WHERE a.tenant_id = $1 AND at.category = 'REVENUE' AND a.is_active = true
    GROUP BY a.id, a.account_code, a.account_name, at.name
    HAVING COALESCE(SUM(le.credit_amount - le.debit_amount), 0) != 0
    ORDER BY a.account_code
  `, [tenantId, startDate, endDate]);

  // Expense accounts
  const expenses = await query(`
    SELECT
      a.id, a.account_code, a.account_name, at.name as account_type,
      COALESCE(SUM(le.debit_amount - le.credit_amount), 0) as balance
    FROM acc_accounts a
    JOIN acc_account_types at ON a.account_type_id = at.id
    LEFT JOIN acc_ledger_entries le ON a.id = le.account_id
      AND le.entry_date BETWEEN $2 AND $3
    WHERE a.tenant_id = $1 AND at.category = 'EXPENSE' AND a.is_active = true
    GROUP BY a.id, a.account_code, a.account_name, at.name
    HAVING COALESCE(SUM(le.debit_amount - le.credit_amount), 0) != 0
    ORDER BY a.account_code
  `, [tenantId, startDate, endDate]);

  return {
    revenue: revenue.rows,
    expenses: expenses.rows
  };
}

async function getPreviousPeriodTotals(tenantId, prevStartDate, prevEndDate) {
  const prevRevenue = await query(`
    SELECT COALESCE(SUM(le.credit_amount - le.debit_amount), 0) as total
    FROM acc_ledger_entries le
    JOIN acc_accounts a ON le.account_id = a.id
    JOIN acc_account_types at ON a.account_type_id = at.id
    WHERE le.tenant_id = $1 AND at.category = 'REVENUE'
      AND le.entry_date BETWEEN $2 AND $3
  `, [tenantId, prevStartDate, prevEndDate]);

  const prevExpenses = await query(`
    SELECT COALESCE(SUM(le.debit_amount - le.credit_amount), 0) as total
    FROM acc_ledger_entries le
    JOIN acc_accounts a ON le.account_id = a.id
    JOIN acc_account_types at ON a.account_type_id = at.id
    WHERE le.tenant_id = $1 AND at.category = 'EXPENSE'
      AND le.entry_date BETWEEN $2 AND $3
  `, [tenantId, prevStartDate, prevEndDate]);

  return {
    revenue: parseFloat(prevRevenue.rows[0]?.total || 0),
    expenses: parseFloat(prevExpenses.rows[0]?.total || 0)
  };
}

// =============================================================================
// CASH FLOW STATEMENT
// =============================================================================

async function getCashFlowData(tenantId, startDate, endDate) {
  // Operating activities
  const operatingInflows = await query(`
    SELECT
      'Customer receipts' as description,
      COALESCE(SUM(r.amount), 0) as amount
    FROM acc_customer_receipts r
    WHERE r.tenant_id = $1 AND r.receipt_date BETWEEN $2 AND $3
  `, [tenantId, startDate, endDate]);

  const operatingOutflows = await query(`
    SELECT
      'Payments to suppliers' as description,
      COALESCE(SUM(p.amount), 0) as amount
    FROM acc_bill_payments p
    WHERE p.tenant_id = $1 AND p.payment_date BETWEEN $2 AND $3
  `, [tenantId, startDate, endDate]);

  // Bank transaction flows
  const bankInflows = await query(`
    SELECT
      COALESCE(SUM(CASE WHEN bt.transaction_type = 'credit' THEN bt.amount ELSE 0 END), 0) as total_inflows,
      COALESCE(SUM(CASE WHEN bt.transaction_type = 'debit' THEN bt.amount ELSE 0 END), 0) as total_outflows
    FROM acc_bank_transactions bt
    JOIN acc_bank_accounts ba ON bt.bank_account_id = ba.id
    WHERE bt.tenant_id = $1 AND bt.transaction_date BETWEEN $2 AND $3
  `, [tenantId, startDate, endDate]);

  // Opening and closing cash balances
  const openingBalance = await query(`
    SELECT COALESCE(SUM(
      CASE WHEN le.entry_date < $2 THEN le.debit_amount - le.credit_amount ELSE 0 END
    ), 0) as balance
    FROM acc_ledger_entries le
    JOIN acc_accounts a ON le.account_id = a.id
    JOIN acc_account_types at ON a.account_type_id = at.id
    WHERE le.tenant_id = $1 AND at.name IN ('Cash', 'Bank')
  `, [tenantId, startDate]);

  const closingBalance = await query(`
    SELECT COALESCE(SUM(
      CASE WHEN le.entry_date <= $2 THEN le.debit_amount - le.credit_amount ELSE 0 END
    ), 0) as balance
    FROM acc_ledger_entries le
    JOIN acc_accounts a ON le.account_id = a.id
    JOIN acc_account_types at ON a.account_type_id = at.id
    WHERE le.tenant_id = $1 AND at.name IN ('Cash', 'Bank')
  `, [tenantId, endDate]);

  return {
    operatingInflows: parseFloat(operatingInflows.rows[0]?.amount || 0),
    operatingOutflows: parseFloat(operatingOutflows.rows[0]?.amount || 0),
    bankInflows: parseFloat(bankInflows.rows[0]?.total_inflows || 0),
    bankOutflows: parseFloat(bankInflows.rows[0]?.total_outflows || 0),
    openingBalance: parseFloat(openingBalance.rows[0]?.balance || 0),
    closingBalance: parseFloat(closingBalance.rows[0]?.balance || 0)
  };
}

// =============================================================================
// ACCOUNT ACTIVITY REPORT
// =============================================================================

async function getAccountInfo(tenantId, accountId) {
  const result = await query(`
    SELECT a.*, at.name as account_type, at.category, at.normal_balance
    FROM acc_accounts a
    JOIN acc_account_types at ON a.account_type_id = at.id
    WHERE a.id = $1 AND a.tenant_id = $2
  `, [accountId, tenantId]);
  return result.rows[0] || null;
}

async function getAccountActivityData(tenantId, accountId, startDate, endDate) {
  // Opening balance
  const openingBalance = await query(`
    SELECT COALESCE(SUM(debit_amount - credit_amount), 0) as balance
    FROM acc_ledger_entries
    WHERE account_id = $1 AND tenant_id = $2 AND entry_date < $3
  `, [accountId, tenantId, startDate]);

  // Transactions
  const transactions = await query(`
    SELECT
      le.entry_date,
      je.entry_number,
      je.description as journal_description,
      le.description as line_description,
      le.debit_amount,
      le.credit_amount
    FROM acc_ledger_entries le
    JOIN acc_journal_entries je ON le.journal_entry_id = je.id
    WHERE le.account_id = $1 AND le.tenant_id = $2
      AND le.entry_date BETWEEN $3 AND $4
    ORDER BY le.entry_date, je.entry_number
  `, [accountId, tenantId, startDate, endDate]);

  return {
    openingBalance: parseFloat(openingBalance.rows[0]?.balance || 0),
    transactions: transactions.rows
  };
}

// =============================================================================
// EXPENSE ANALYSIS
// =============================================================================

async function getExpenseAnalysis(tenantId, startDate, endDate, groupBy) {
  let groupQuery;
  if (groupBy === 'cost_center') {
    groupQuery = `
      SELECT
        COALESCE(cc.name, 'Unassigned') as group_name,
        COALESCE(SUM(le.debit_amount - le.credit_amount), 0) as total
      FROM acc_ledger_entries le
      JOIN acc_accounts a ON le.account_id = a.id
      JOIN acc_account_types at ON a.account_type_id = at.id
      LEFT JOIN acc_cost_centers cc ON le.cost_center_id = cc.id
      WHERE le.tenant_id = $1 AND at.category = 'EXPENSE'
        AND le.entry_date BETWEEN $2 AND $3
      GROUP BY cc.name
      ORDER BY total DESC
    `;
  } else if (groupBy === 'month') {
    groupQuery = `
      SELECT
        TO_CHAR(le.entry_date, 'YYYY-MM') as group_name,
        COALESCE(SUM(le.debit_amount - le.credit_amount), 0) as total
      FROM acc_ledger_entries le
      JOIN acc_accounts a ON le.account_id = a.id
      JOIN acc_account_types at ON a.account_type_id = at.id
      WHERE le.tenant_id = $1 AND at.category = 'EXPENSE'
        AND le.entry_date BETWEEN $2 AND $3
      GROUP BY TO_CHAR(le.entry_date, 'YYYY-MM')
      ORDER BY group_name
    `;
  } else {
    groupQuery = `
      SELECT
        a.account_name as group_name,
        COALESCE(SUM(le.debit_amount - le.credit_amount), 0) as total
      FROM acc_ledger_entries le
      JOIN acc_accounts a ON le.account_id = a.id
      JOIN acc_account_types at ON a.account_type_id = at.id
      WHERE le.tenant_id = $1 AND at.category = 'EXPENSE'
        AND le.entry_date BETWEEN $2 AND $3
      GROUP BY a.account_name
      ORDER BY total DESC
    `;
  }

  const result = await query(groupQuery, [tenantId, startDate, endDate]);
  return result.rows;
}

// =============================================================================
// REVENUE ANALYSIS
// =============================================================================

async function getRevenueAnalysis(tenantId, startDate, endDate, groupBy) {
  let groupQuery;
  if (groupBy === 'customer') {
    groupQuery = `
      SELECT
        COALESCE(c.name, 'Direct Sales') as group_name,
        COALESCE(SUM(i.total_amount), 0) as total
      FROM acc_customer_invoices i
      LEFT JOIN acc_customers c ON i.customer_id = c.id
      WHERE i.tenant_id = $1 AND i.status IN ('posted', 'paid')
        AND i.invoice_date BETWEEN $2 AND $3
      GROUP BY c.name
      ORDER BY total DESC
    `;
  } else if (groupBy === 'month') {
    groupQuery = `
      SELECT
        TO_CHAR(le.entry_date, 'YYYY-MM') as group_name,
        COALESCE(SUM(le.credit_amount - le.debit_amount), 0) as total
      FROM acc_ledger_entries le
      JOIN acc_accounts a ON le.account_id = a.id
      JOIN acc_account_types at ON a.account_type_id = at.id
      WHERE le.tenant_id = $1 AND at.category = 'REVENUE'
        AND le.entry_date BETWEEN $2 AND $3
      GROUP BY TO_CHAR(le.entry_date, 'YYYY-MM')
      ORDER BY group_name
    `;
  } else {
    groupQuery = `
      SELECT
        a.account_name as group_name,
        COALESCE(SUM(le.credit_amount - le.debit_amount), 0) as total
      FROM acc_ledger_entries le
      JOIN acc_accounts a ON le.account_id = a.id
      JOIN acc_account_types at ON a.account_type_id = at.id
      WHERE le.tenant_id = $1 AND at.category = 'REVENUE'
        AND le.entry_date BETWEEN $2 AND $3
      GROUP BY a.account_name
      ORDER BY total DESC
    `;
  }

  const result = await query(groupQuery, [tenantId, startDate, endDate]);
  return result.rows;
}

// =============================================================================
// BUDGET VS ACTUAL
// =============================================================================

async function getBudgetInfo(tenantId, budgetId) {
  const result = await query(`
    SELECT b.*, fy.start_date, fy.end_date
    FROM acc_budgets b
    JOIN acc_fiscal_years fy ON b.fiscal_year_id = fy.id
    WHERE b.id = $1 AND b.tenant_id = $2
  `, [budgetId, tenantId]);
  return result.rows[0] || null;
}

async function getBudgetVsActualData(tenantId, budgetId, startDate, endDate) {
  const result = await query(`
    SELECT
      bl.account_id,
      a.account_code,
      a.account_name,
      bl.annual_amount as budget_amount,
      COALESCE(SUM(le.debit_amount - le.credit_amount), 0) as actual_amount
    FROM acc_budget_lines bl
    JOIN acc_accounts a ON bl.account_id = a.id
    LEFT JOIN acc_ledger_entries le ON a.id = le.account_id
      AND le.entry_date BETWEEN $3 AND $4
    WHERE bl.budget_id = $1 AND bl.tenant_id = $2
    GROUP BY bl.account_id, a.account_code, a.account_name, bl.annual_amount
    ORDER BY a.account_code
  `, [budgetId, tenantId, startDate, endDate]);

  return result.rows;
}

// =============================================================================
// CSV EXPORT DATA
// =============================================================================

async function getTrialBalanceCSVData(tenantId) {
  const result = await query(
    `SELECT a.account_code, a.account_name, t.category,
     COALESCE(SUM(jl.debit_amount),0) as debit, COALESCE(SUM(jl.credit_amount),0) as credit,
     COALESCE(SUM(jl.debit_amount),0) - COALESCE(SUM(jl.credit_amount),0) as balance
     FROM acc_accounts a LEFT JOIN acc_account_types t ON a.account_type_id = t.id
     LEFT JOIN acc_journal_lines jl ON a.id = jl.account_id AND jl.tenant_id = $1
     LEFT JOIN acc_journal_entries je ON jl.journal_entry_id = je.id AND je.status = 'posted'
     WHERE a.tenant_id = $1 GROUP BY a.id, a.account_code, a.account_name, t.category
     HAVING COALESCE(SUM(jl.debit_amount),0) != 0 OR COALESCE(SUM(jl.credit_amount),0) != 0
     ORDER BY a.account_code`, [tenantId]);
  return result.rows;
}

async function getProfitLossCSVData(tenantId) {
  const result = await query(
    `SELECT a.account_code, a.account_name, t.category,
     COALESCE(SUM(jl.debit_amount),0) - COALESCE(SUM(jl.credit_amount),0) as balance
     FROM acc_accounts a JOIN acc_account_types t ON a.account_type_id = t.id
     LEFT JOIN acc_journal_lines jl ON a.id = jl.account_id AND jl.tenant_id = $1
     LEFT JOIN acc_journal_entries je ON jl.journal_entry_id = je.id AND je.status = 'posted'
     WHERE a.tenant_id = $1 AND t.category IN ('revenue','expense')
     GROUP BY a.id, a.account_code, a.account_name, t.category ORDER BY t.category, a.account_code`, [tenantId]);
  return result.rows;
}

module.exports = {
  getTrialBalance,
  getBalanceSheetData,
  getProfitLossData,
  getPreviousPeriodTotals,
  getCashFlowData,
  getAccountInfo,
  getAccountActivityData,
  getExpenseAnalysis,
  getRevenueAnalysis,
  getBudgetInfo,
  getBudgetVsActualData,
  getTrialBalanceCSVData,
  getProfitLossCSVData
};
