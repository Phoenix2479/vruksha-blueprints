// Fiscal Periods Service - Business logic and DB queries

const { z } = require('zod');

let db, sdk;
try {
  db = require('../../../../../db/postgres');
  sdk = require('../../../../../platform/sdk/node');
} catch (_) {
  db = require('@vruksha/platform/db/postgres');
  sdk = require('@vruksha/platform/sdk/node');
}

const { query, getClient } = db;
const { publishEnvelope } = sdk;

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const fiscalYearSchema = z.object({
  name: z.string().min(1).max(50),
  start_date: z.string(),
  end_date: z.string(),
  is_active: z.boolean().default(true)
});

const budgetSchema = z.object({
  fiscal_year_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  budget_type: z.enum(['operating', 'capital', 'project']).default('operating'),
  status: z.enum(['draft', 'approved', 'active', 'closed']).default('draft')
});

const budgetLineSchema = z.object({
  budget_id: z.string().uuid(),
  account_id: z.string().uuid(),
  cost_center_id: z.string().uuid().optional().nullable(),
  annual_amount: z.number().min(0),
  q1_amount: z.number().min(0).optional().default(0),
  q2_amount: z.number().min(0).optional().default(0),
  q3_amount: z.number().min(0).optional().default(0),
  q4_amount: z.number().min(0).optional().default(0),
  notes: z.string().optional().nullable()
});

const costCenterSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  parent_id: z.string().uuid().optional().nullable(),
  manager_name: z.string().max(255).optional().nullable(),
  is_active: z.boolean().default(true)
});

// =============================================================================
// FISCAL YEAR OPERATIONS
// =============================================================================

async function listFiscalYears(tenantId, { is_active }) {
  let sql = `
    SELECT fy.*,
           (SELECT COUNT(*) FROM acc_fiscal_periods fp WHERE fp.fiscal_year_id = fy.id) as period_count,
           (SELECT COUNT(*) FROM acc_fiscal_periods fp WHERE fp.fiscal_year_id = fy.id AND fp.status = 'closed') as closed_periods
    FROM acc_fiscal_years fy
    WHERE fy.tenant_id = $1
  `;
  const params = [tenantId];

  if (is_active !== undefined) {
    sql += ` AND fy.is_active = $2`;
    params.push(is_active === 'true');
  }

  sql += ' ORDER BY fy.start_date DESC';

  const result = await query(sql, params);
  return result.rows;
}

async function getCurrentFiscalYear(tenantId) {
  const today = new Date().toISOString().split('T')[0];

  const result = await query(`
    SELECT * FROM acc_fiscal_years
    WHERE tenant_id = $1 AND is_active = true
    AND start_date <= $2 AND end_date >= $2
    LIMIT 1
  `, [tenantId, today]);

  if (result.rows.length === 0) return null;

  const periods = await query(
    'SELECT * FROM acc_fiscal_periods WHERE fiscal_year_id = $1 ORDER BY period_number',
    [result.rows[0].id]
  );

  return { ...result.rows[0], periods: periods.rows };
}

async function getFiscalYear(tenantId, id) {
  const fiscalYear = await query(
    'SELECT * FROM acc_fiscal_years WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );

  if (fiscalYear.rows.length === 0) return null;

  const periods = await query(
    'SELECT * FROM acc_fiscal_periods WHERE fiscal_year_id = $1 AND tenant_id = $2 ORDER BY period_number',
    [id, tenantId]
  );

  return { ...fiscalYear.rows[0], periods: periods.rows };
}

async function createFiscalYear(tenantId, body) {
  const { generate_periods = true, ...yearData } = body;

  const validation = fiscalYearSchema.safeParse(yearData);
  if (!validation.success) {
    return { error: validation.error.message, code: 'VALIDATION_ERROR', status: 400 };
  }

  const data = validation.data;

  // Validate date range
  const startDate = new Date(data.start_date);
  const endDate = new Date(data.end_date);

  if (endDate <= startDate) {
    return { error: 'End date must be after start date', code: 'INVALID_DATES', status: 400 };
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Create fiscal year
    const fyResult = await client.query(`
      INSERT INTO acc_fiscal_years (tenant_id, name, start_date, end_date, is_active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [tenantId, data.name, data.start_date, data.end_date, data.is_active]);

    const fiscalYearId = fyResult.rows[0].id;

    // Generate monthly periods if requested
    if (generate_periods) {
      let periodNum = 1;
      let currentDate = new Date(startDate);

      while (currentDate < endDate) {
        const periodStart = new Date(currentDate);
        const periodEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

        // Don't exceed fiscal year end date
        const actualEnd = periodEnd > endDate ? endDate : periodEnd;

        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];
        const periodName = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

        await client.query(`
          INSERT INTO acc_fiscal_periods (
            tenant_id, fiscal_year_id, period_number, name, start_date, end_date, period_type, status
          ) VALUES ($1, $2, $3, $4, $5, $6, 'month', 'open')
        `, [tenantId, fiscalYearId, periodNum, periodName,
            periodStart.toISOString().split('T')[0],
            actualEnd.toISOString().split('T')[0]]);

        periodNum++;
        currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
      }
    }

    await client.query('COMMIT');

    // Fetch the created fiscal year with periods
    const result = await query(
      'SELECT * FROM acc_fiscal_years WHERE id = $1 AND tenant_id = $2',
      [fiscalYearId, tenantId]
    );

    const periods = await query(
      'SELECT * FROM acc_fiscal_periods WHERE fiscal_year_id = $1 ORDER BY period_number',
      [fiscalYearId]
    );

    await publishEnvelope('accounting.fiscal_year.created', { tenantId, fiscalYear: result.rows[0] });

    return { success: true, data: { ...result.rows[0], periods: periods.rows } };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateFiscalYear(tenantId, id, body) {
  const validation = fiscalYearSchema.partial().safeParse(body);

  if (!validation.success) {
    return { error: validation.error.message, code: 'VALIDATION_ERROR', status: 400 };
  }

  const data = validation.data;
  const updates = [];
  const values = [id, tenantId];
  let paramIndex = 3;

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      updates.push(`${key} = $${paramIndex++}`);
      values.push(value);
    }
  }

  if (updates.length === 0) {
    return { error: 'No fields to update', code: 'NO_UPDATES', status: 400 };
  }

  const result = await query(`
    UPDATE acc_fiscal_years SET ${updates.join(', ')}, updated_at = NOW()
    WHERE id = $1 AND tenant_id = $2 RETURNING *
  `, values);

  if (result.rows.length === 0) {
    return { error: 'Fiscal year not found', code: 'NOT_FOUND', status: 404 };
  }

  await publishEnvelope('accounting.fiscal_year.updated', { tenantId, fiscalYear: result.rows[0] });

  return { success: true, data: result.rows[0] };
}

// =============================================================================
// FISCAL PERIOD OPERATIONS
// =============================================================================

async function listPeriods(tenantId, { fiscal_year_id, status }) {
  let sql = `
    SELECT fp.*, fy.name as fiscal_year_name
    FROM acc_fiscal_periods fp
    JOIN acc_fiscal_years fy ON fp.fiscal_year_id = fy.id
    WHERE fp.tenant_id = $1
  `;
  const params = [tenantId];
  let paramIndex = 2;

  if (fiscal_year_id) {
    sql += ` AND fp.fiscal_year_id = $${paramIndex++}`;
    params.push(fiscal_year_id);
  }

  if (status) {
    sql += ` AND fp.status = $${paramIndex++}`;
    params.push(status);
  }

  sql += ' ORDER BY fp.start_date DESC';

  const result = await query(sql, params);
  return result.rows;
}

async function getCurrentPeriod(tenantId) {
  const today = new Date().toISOString().split('T')[0];

  const result = await query(`
    SELECT fp.*, fy.name as fiscal_year_name
    FROM acc_fiscal_periods fp
    JOIN acc_fiscal_years fy ON fp.fiscal_year_id = fy.id
    WHERE fp.tenant_id = $1 AND fp.status = 'open'
    AND fp.start_date <= $2 AND fp.end_date >= $2
    LIMIT 1
  `, [tenantId, today]);

  return result.rows[0] || null;
}

async function closePeriod(tenantId, id, { force = false }) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get period
    const period = await client.query(`
      SELECT fp.*, fy.name as fiscal_year_name
      FROM acc_fiscal_periods fp
      JOIN acc_fiscal_years fy ON fp.fiscal_year_id = fy.id
      WHERE fp.id = $1 AND fp.tenant_id = $2
    `, [id, tenantId]);

    if (period.rows.length === 0) {
      await client.query('ROLLBACK');
      return { error: 'Period not found', code: 'NOT_FOUND', status: 404 };
    }

    if (period.rows[0].status === 'closed') {
      await client.query('ROLLBACK');
      return { error: 'Period is already closed', code: 'ALREADY_CLOSED', status: 400 };
    }

    // Check for unposted journal entries in this period
    const unposted = await client.query(`
      SELECT COUNT(*) as count
      FROM acc_journal_entries
      WHERE tenant_id = $1 AND status = 'draft'
      AND entry_date BETWEEN $2 AND $3
    `, [tenantId, period.rows[0].start_date, period.rows[0].end_date]);

    if (parseInt(unposted.rows[0].count) > 0 && !force) {
      await client.query('ROLLBACK');
      return {
        error: `There are ${unposted.rows[0].count} unposted journal entries in this period. Use force=true to close anyway.`,
        code: 'UNPOSTED_ENTRIES',
        status: 400
      };
    }

    // Close the period
    const result = await client.query(`
      UPDATE acc_fiscal_periods
      SET status = 'closed', closed_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
      RETURNING *
    `, [id, tenantId]);

    await client.query('COMMIT');

    await publishEnvelope('accounting.period.closed', { tenantId, period: result.rows[0] });

    return { success: true, data: result.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function reopenPeriod(tenantId, id) {
  const result = await query(`
    UPDATE acc_fiscal_periods
    SET status = 'open', closed_at = NULL, updated_at = NOW()
    WHERE id = $1 AND tenant_id = $2 AND status = 'closed'
    RETURNING *
  `, [id, tenantId]);

  if (result.rows.length === 0) {
    return { error: 'Period not found or not closed', code: 'NOT_FOUND', status: 404 };
  }

  await publishEnvelope('accounting.period.reopened', { tenantId, period: result.rows[0] });

  return { success: true, data: result.rows[0] };
}

// =============================================================================
// YEAR-END CLOSING
// =============================================================================

async function closeFiscalYear(tenantId, id, { retained_earnings_account_id }) {
  if (!retained_earnings_account_id) {
    return { error: 'retained_earnings_account_id is required', code: 'MISSING_ACCOUNT', status: 400 };
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get fiscal year
    const fy = await client.query(
      'SELECT * FROM acc_fiscal_years WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );

    if (fy.rows.length === 0) {
      await client.query('ROLLBACK');
      return { error: 'Fiscal year not found', code: 'NOT_FOUND', status: 404 };
    }

    if (fy.rows[0].is_closed) {
      await client.query('ROLLBACK');
      return { error: 'Fiscal year is already closed', code: 'ALREADY_CLOSED', status: 400 };
    }

    // Check all periods are closed
    const openPeriods = await client.query(`
      SELECT COUNT(*) as count
      FROM acc_fiscal_periods
      WHERE fiscal_year_id = $1 AND tenant_id = $2 AND status != 'closed'
    `, [id, tenantId]);

    if (parseInt(openPeriods.rows[0].count) > 0) {
      await client.query('ROLLBACK');
      return { error: 'All periods must be closed before closing the fiscal year', code: 'OPEN_PERIODS', status: 400 };
    }

    // Calculate net income (Revenue - Expenses)
    const netIncome = await client.query(`
      SELECT
        COALESCE(SUM(CASE WHEN at.category = 'REVENUE' THEN le.credit_amount - le.debit_amount ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN at.category = 'EXPENSE' THEN le.debit_amount - le.credit_amount ELSE 0 END), 0) as net_income
      FROM acc_ledger_entries le
      JOIN acc_accounts a ON le.account_id = a.id
      JOIN acc_account_types at ON a.account_type_id = at.id
      WHERE le.tenant_id = $1 AND le.entry_date BETWEEN $2 AND $3
    `, [tenantId, fy.rows[0].start_date, fy.rows[0].end_date]);

    const netIncomeAmount = parseFloat(netIncome.rows[0].net_income);

    // Create closing journal entry
    const entryResult = await client.query(`
      INSERT INTO acc_journal_entries (
        tenant_id, entry_date, entry_number, entry_type, description, status
      ) VALUES ($1, $2, $3, 'CLO', 'Year-end closing entry', 'posted')
      RETURNING id
    `, [tenantId, fy.rows[0].end_date, `JE-CLOSE-${fy.rows[0].name}`]);

    const journalId = entryResult.rows[0].id;

    // Close revenue accounts (debit revenue, credit retained earnings)
    const revenueAccounts = await client.query(`
      SELECT a.id, SUM(le.credit_amount - le.debit_amount) as balance
      FROM acc_accounts a
      JOIN acc_account_types at ON a.account_type_id = at.id
      LEFT JOIN acc_ledger_entries le ON a.id = le.account_id
        AND le.entry_date BETWEEN $2 AND $3
      WHERE a.tenant_id = $1 AND at.category = 'REVENUE'
      GROUP BY a.id
      HAVING SUM(le.credit_amount - le.debit_amount) != 0
    `, [tenantId, fy.rows[0].start_date, fy.rows[0].end_date]);

    let lineNum = 1;
    for (const acc of revenueAccounts.rows) {
      await client.query(`
        INSERT INTO acc_journal_lines (tenant_id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
        VALUES ($1, $2, $3, $4, 'Close revenue', $5, 0)
      `, [tenantId, journalId, lineNum++, acc.id, Math.abs(parseFloat(acc.balance))]);
    }

    // Close expense accounts (credit expense, debit retained earnings)
    const expenseAccounts = await client.query(`
      SELECT a.id, SUM(le.debit_amount - le.credit_amount) as balance
      FROM acc_accounts a
      JOIN acc_account_types at ON a.account_type_id = at.id
      LEFT JOIN acc_ledger_entries le ON a.id = le.account_id
        AND le.entry_date BETWEEN $2 AND $3
      WHERE a.tenant_id = $1 AND at.category = 'EXPENSE'
      GROUP BY a.id
      HAVING SUM(le.debit_amount - le.credit_amount) != 0
    `, [tenantId, fy.rows[0].start_date, fy.rows[0].end_date]);

    for (const acc of expenseAccounts.rows) {
      await client.query(`
        INSERT INTO acc_journal_lines (tenant_id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
        VALUES ($1, $2, $3, $4, 'Close expense', 0, $5)
      `, [tenantId, journalId, lineNum++, acc.id, Math.abs(parseFloat(acc.balance))]);
    }

    // Record net income to retained earnings
    if (netIncomeAmount !== 0) {
      await client.query(`
        INSERT INTO acc_journal_lines (tenant_id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
        VALUES ($1, $2, $3, $4, 'Net income to retained earnings', $5, $6)
      `, [
        tenantId, journalId, lineNum,
        retained_earnings_account_id,
        'Net income to retained earnings',
        netIncomeAmount < 0 ? Math.abs(netIncomeAmount) : 0,
        netIncomeAmount > 0 ? netIncomeAmount : 0
      ]);
    }

    // Mark fiscal year as closed
    await client.query(`
      UPDATE acc_fiscal_years
      SET is_closed = true, is_active = false, updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
    `, [id, tenantId]);

    await client.query('COMMIT');

    await publishEnvelope('accounting.fiscal_year.closed', {
      tenantId,
      fiscalYearId: id,
      netIncome: netIncomeAmount,
      closingJournalId: journalId
    });

    return {
      success: true,
      data: {
        fiscal_year_id: id,
        net_income: netIncomeAmount,
        closing_journal_entry_id: journalId,
        status: 'closed'
      }
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// =============================================================================
// BUDGET OPERATIONS
// =============================================================================

async function listBudgets(tenantId, { fiscal_year_id, status }) {
  let sql = `
    SELECT b.*, fy.name as fiscal_year_name
    FROM acc_budgets b
    JOIN acc_fiscal_years fy ON b.fiscal_year_id = fy.id
    WHERE b.tenant_id = $1
  `;
  const params = [tenantId];
  let paramIndex = 2;

  if (fiscal_year_id) {
    sql += ` AND b.fiscal_year_id = $${paramIndex++}`;
    params.push(fiscal_year_id);
  }

  if (status) {
    sql += ` AND b.status = $${paramIndex++}`;
    params.push(status);
  }

  sql += ' ORDER BY fy.start_date DESC, b.name';

  const result = await query(sql, params);
  return result.rows;
}

async function getBudget(tenantId, id) {
  const budget = await query(`
    SELECT b.*, fy.name as fiscal_year_name, fy.start_date, fy.end_date
    FROM acc_budgets b
    JOIN acc_fiscal_years fy ON b.fiscal_year_id = fy.id
    WHERE b.id = $1 AND b.tenant_id = $2
  `, [id, tenantId]);

  if (budget.rows.length === 0) return null;

  const lines = await query(`
    SELECT bl.*, a.account_code, a.account_name, cc.name as cost_center_name
    FROM acc_budget_lines bl
    JOIN acc_accounts a ON bl.account_id = a.id
    LEFT JOIN acc_cost_centers cc ON bl.cost_center_id = cc.id
    WHERE bl.budget_id = $1 AND bl.tenant_id = $2
    ORDER BY a.account_code
  `, [id, tenantId]);

  return { ...budget.rows[0], lines: lines.rows };
}

async function createBudget(tenantId, body) {
  const validation = budgetSchema.safeParse(body);

  if (!validation.success) {
    return { error: validation.error.message, code: 'VALIDATION_ERROR', status: 400 };
  }

  const data = validation.data;

  const result = await query(`
    INSERT INTO acc_budgets (tenant_id, fiscal_year_id, name, description, budget_type, status)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [tenantId, data.fiscal_year_id, data.name, data.description, data.budget_type, data.status]);

  await publishEnvelope('accounting.budget.created', { tenantId, budget: result.rows[0] });

  return { success: true, data: result.rows[0] };
}

async function addBudgetLine(tenantId, budgetId, body) {
  const validation = budgetLineSchema.safeParse({ ...body, budget_id: budgetId });

  if (!validation.success) {
    return { error: validation.error.message, code: 'VALIDATION_ERROR', status: 400 };
  }

  const data = validation.data;

  const result = await query(`
    INSERT INTO acc_budget_lines (
      tenant_id, budget_id, account_id, cost_center_id, annual_amount,
      q1_amount, q2_amount, q3_amount, q4_amount, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `, [
    tenantId, budgetId, data.account_id, data.cost_center_id, data.annual_amount,
    data.q1_amount, data.q2_amount, data.q3_amount, data.q4_amount, data.notes
  ]);

  return { success: true, data: result.rows[0] };
}

async function approveBudget(tenantId, id) {
  const result = await query(`
    UPDATE acc_budgets SET status = 'approved', approved_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND tenant_id = $2 AND status = 'draft'
    RETURNING *
  `, [id, tenantId]);

  if (result.rows.length === 0) {
    return { error: 'Budget not found or not in draft status', code: 'NOT_FOUND', status: 404 };
  }

  await publishEnvelope('accounting.budget.approved', { tenantId, budget: result.rows[0] });

  return { success: true, data: result.rows[0] };
}

// =============================================================================
// COST CENTER OPERATIONS
// =============================================================================

async function listCostCenters(tenantId, { is_active }) {
  let sql = `
    SELECT cc.*, p.name as parent_name
    FROM acc_cost_centers cc
    LEFT JOIN acc_cost_centers p ON cc.parent_id = p.id
    WHERE cc.tenant_id = $1
  `;
  const params = [tenantId];

  if (is_active !== undefined) {
    sql += ` AND cc.is_active = $2`;
    params.push(is_active === 'true');
  }

  sql += ' ORDER BY cc.code';

  const result = await query(sql, params);
  return result.rows;
}

async function createCostCenter(tenantId, body) {
  const validation = costCenterSchema.safeParse(body);

  if (!validation.success) {
    return { error: validation.error.message, code: 'VALIDATION_ERROR', status: 400 };
  }

  const data = validation.data;

  // Check for duplicate code
  const existing = await query('SELECT id FROM acc_cost_centers WHERE code = $1 AND tenant_id = $2', [data.code, tenantId]);
  if (existing.rows.length > 0) {
    return { error: 'Cost center code already exists', code: 'DUPLICATE_CODE', status: 400 };
  }

  const result = await query(`
    INSERT INTO acc_cost_centers (tenant_id, code, name, description, parent_id, manager_name, is_active)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `, [tenantId, data.code, data.name, data.description, data.parent_id, data.manager_name, data.is_active]);

  await publishEnvelope('accounting.cost_center.created', { tenantId, costCenter: result.rows[0] });

  return { success: true, data: result.rows[0] };
}

async function updateCostCenter(tenantId, id, body) {
  const validation = costCenterSchema.partial().safeParse(body);

  if (!validation.success) {
    return { error: validation.error.message, code: 'VALIDATION_ERROR', status: 400 };
  }

  const data = validation.data;
  const updates = [];
  const values = [id, tenantId];
  let paramIndex = 3;

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      updates.push(`${key} = $${paramIndex++}`);
      values.push(value);
    }
  }

  if (updates.length === 0) {
    return { error: 'No fields to update', code: 'NO_UPDATES', status: 400 };
  }

  const result = await query(`
    UPDATE acc_cost_centers SET ${updates.join(', ')}, updated_at = NOW()
    WHERE id = $1 AND tenant_id = $2 RETURNING *
  `, values);

  if (result.rows.length === 0) {
    return { error: 'Cost center not found', code: 'NOT_FOUND', status: 404 };
  }

  await publishEnvelope('accounting.cost_center.updated', { tenantId, costCenter: result.rows[0] });

  return { success: true, data: result.rows[0] };
}

// =============================================================================
// CSV EXPORT DATA
// =============================================================================

async function getFiscalYearsCSVData(tenantId) {
  const result = await query(
    'SELECT name, start_date, end_date, status FROM acc_fiscal_years WHERE tenant_id = $1 ORDER BY start_date DESC',
    [tenantId]
  );
  return result.rows;
}

async function getPeriodsCSVData(tenantId) {
  const result = await query(
    'SELECT p.name, p.start_date, p.end_date, p.status, fy.name as fiscal_year FROM acc_fiscal_periods p LEFT JOIN acc_fiscal_years fy ON p.fiscal_year_id = fy.id WHERE p.tenant_id = $1 ORDER BY p.start_date DESC',
    [tenantId]
  );
  return result.rows;
}

module.exports = {
  // Fiscal Years
  listFiscalYears,
  getCurrentFiscalYear,
  getFiscalYear,
  createFiscalYear,
  updateFiscalYear,
  closeFiscalYear,
  // Periods
  listPeriods,
  getCurrentPeriod,
  closePeriod,
  reopenPeriod,
  // Budgets
  listBudgets,
  getBudget,
  createBudget,
  addBudgetLine,
  approveBudget,
  // Cost Centers
  listCostCenters,
  createCostCenter,
  updateCostCenter,
  // CSV exports
  getFiscalYearsCSVData,
  getPeriodsCSVData
};
