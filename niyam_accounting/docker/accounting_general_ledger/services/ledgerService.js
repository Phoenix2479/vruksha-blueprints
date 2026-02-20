// General Ledger Service - Business logic and DB queries

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

// ============================================
// LEDGER ENTRIES
// ============================================

async function getAccountInfo(tenantId, accountId) {
  const result = await query(
    `SELECT a.account_code, a.account_name, a.opening_balance, t.normal_balance
     FROM acc_accounts a
     LEFT JOIN acc_account_types t ON a.account_type_id = t.id
     WHERE a.tenant_id = $1 AND a.id = $2`,
    [tenantId, accountId]
  );
  return result.rows[0] || null;
}

async function getAccountFullInfo(tenantId, accountId) {
  const result = await query(
    `SELECT a.*, t.normal_balance, t.category
     FROM acc_accounts a
     LEFT JOIN acc_account_types t ON a.account_type_id = t.id
     WHERE a.tenant_id = $1 AND a.id = $2`,
    [tenantId, accountId]
  );
  return result.rows[0] || null;
}

async function getLedgerEntries(tenantId, accountId, { from_date, to_date, limit = 100, offset = 0 }) {
  let conditions = ['le.tenant_id = $1', 'le.account_id = $2'];
  const params = [tenantId, accountId];
  let idx = 3;

  if (from_date) {
    conditions.push(`le.entry_date >= $${idx}`);
    params.push(from_date);
    idx++;
  }

  if (to_date) {
    conditions.push(`le.entry_date <= $${idx}`);
    params.push(to_date);
    idx++;
  }

  const whereClause = conditions.join(' AND ');

  const result = await query(
    `SELECT le.*, je.entry_number, je.description as journal_description
     FROM acc_ledger_entries le
     LEFT JOIN acc_journal_lines jl ON le.journal_line_id = jl.id
     LEFT JOIN acc_journal_entries je ON jl.journal_entry_id = je.id
     WHERE ${whereClause}
     ORDER BY le.entry_date, le.created_at
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset]
  );

  return result.rows;
}

async function getPriorBalanceTotals(tenantId, accountId, beforeDate) {
  const result = await query(
    `SELECT COALESCE(SUM(debit_amount), 0) as debits, COALESCE(SUM(credit_amount), 0) as credits
     FROM acc_ledger_entries
     WHERE tenant_id = $1 AND account_id = $2 AND entry_date < $3`,
    [tenantId, accountId, beforeDate]
  );
  return result.rows[0];
}

async function getOpeningBalanceTotals(tenantId, accountId, beforeDate) {
  const result = await query(
    `SELECT
       COALESCE(SUM(debit_amount), 0) as total_debits,
       COALESCE(SUM(credit_amount), 0) as total_credits
     FROM acc_ledger_entries
     WHERE tenant_id = $1 AND account_id = $2 AND entry_date < $3`,
    [tenantId, accountId, beforeDate]
  );
  return result.rows[0];
}

async function getStatementEntries(tenantId, accountId, fromDate, toDate) {
  const result = await query(
    `SELECT le.*, je.entry_number, je.description as journal_description
     FROM acc_ledger_entries le
     LEFT JOIN acc_journal_lines jl ON le.journal_line_id = jl.id
     LEFT JOIN acc_journal_entries je ON jl.journal_entry_id = je.id
     WHERE le.tenant_id = $1 AND le.account_id = $2
       AND le.entry_date >= $3 AND le.entry_date <= $4
     ORDER BY le.entry_date, le.created_at`,
    [tenantId, accountId, fromDate, toDate]
  );
  return result.rows;
}

// ============================================
// PERIOD BALANCES
// ============================================

async function getPeriodBalances(tenantId, { fiscal_period_id, as_of_date, category }) {
  let dateFilter = '';
  const params = [tenantId];
  let idx = 2;

  if (fiscal_period_id) {
    dateFilter = `AND fp.id = $${idx}`;
    params.push(fiscal_period_id);
    idx++;
  } else if (as_of_date) {
    dateFilter = `AND le.entry_date <= $${idx}`;
    params.push(as_of_date);
    idx++;
  }

  let categoryFilter = '';
  if (category) {
    categoryFilter = `AND t.category = $${idx}`;
    params.push(category);
  }

  const result = await query(
    `SELECT
       a.id, a.account_code, a.account_name, a.opening_balance,
       t.category, t.normal_balance,
       COALESCE(SUM(le.debit_amount), 0) as period_debits,
       COALESCE(SUM(le.credit_amount), 0) as period_credits
     FROM acc_accounts a
     LEFT JOIN acc_account_types t ON a.account_type_id = t.id
     LEFT JOIN acc_ledger_entries le ON le.account_id = a.id ${dateFilter}
     LEFT JOIN acc_fiscal_periods fp ON le.fiscal_period_id = fp.id
     WHERE a.tenant_id = $1 AND a.is_active = true AND a.is_header = false ${categoryFilter}
     GROUP BY a.id, t.category, t.normal_balance
     ORDER BY a.account_code`,
    params
  );

  return result.rows;
}

// ============================================
// POSTING FROM JOURNAL
// ============================================

async function postJournalToLedger(tenantId, journalEntryId) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get journal entry
    const jeRes = await client.query(
      `SELECT * FROM acc_journal_entries WHERE tenant_id = $1 AND id = $2`,
      [tenantId, journalEntryId]
    );

    if (jeRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { error: 'Journal entry not found', status: 404 };
    }

    const je = jeRes.rows[0];

    if (je.status !== 'draft') {
      await client.query('ROLLBACK');
      return { error: 'Journal entry is not in draft status', status: 400 };
    }

    // Verify balanced
    if (Math.abs(parseFloat(je.total_debit) - parseFloat(je.total_credit)) > 0.01) {
      await client.query('ROLLBACK');
      return { error: 'Journal entry is not balanced', status: 400 };
    }

    // Get journal lines
    const linesRes = await client.query(
      `SELECT * FROM acc_journal_lines WHERE journal_entry_id = $1 ORDER BY line_number`,
      [journalEntryId]
    );

    // Get fiscal period
    const periodRes = await client.query(
      `SELECT id FROM acc_fiscal_periods
       WHERE tenant_id = $1 AND start_date <= $2 AND end_date >= $2 AND status = 'open'`,
      [tenantId, je.entry_date]
    );

    const fiscalPeriodId = periodRes.rows.length > 0 ? periodRes.rows[0].id : null;

    // Create ledger entries for each line
    for (const line of linesRes.rows) {
      await client.query(
        `INSERT INTO acc_ledger_entries
         (tenant_id, account_id, journal_line_id, fiscal_period_id, entry_date,
          debit_amount, credit_amount, description, reference, source_type, source_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          tenantId,
          line.account_id,
          line.id,
          fiscalPeriodId,
          je.entry_date,
          line.debit_amount,
          line.credit_amount,
          line.description || je.description,
          je.entry_number,
          je.source_type,
          je.source_id
        ]
      );

      // Update account balance
      const balanceUpdate = parseFloat(line.debit_amount) - parseFloat(line.credit_amount);
      await client.query(
        `UPDATE acc_accounts SET current_balance = current_balance + $1, updated_at = NOW()
         WHERE id = $2`,
        [balanceUpdate, line.account_id]
      );
    }

    // Update journal entry status
    await client.query(
      `UPDATE acc_journal_entries
       SET status = 'posted', posted_at = NOW(), fiscal_period_id = $1
       WHERE id = $2`,
      [fiscalPeriodId, journalEntryId]
    );

    await client.query('COMMIT');

    await publishEnvelope('accounting.general_ledger.posted.v1', 1, {
      journal_entry_id: journalEntryId,
      entry_number: je.entry_number,
      entry_date: je.entry_date,
      total_amount: je.total_debit
    });

    return { success: true, message: 'Journal entry posted to ledger' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function reverseJournalEntry(tenantId, journalEntryId, { reversal_date, description }) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get original journal entry
    const jeRes = await client.query(
      `SELECT * FROM acc_journal_entries WHERE tenant_id = $1 AND id = $2`,
      [tenantId, journalEntryId]
    );

    if (jeRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { error: 'Journal entry not found', status: 404 };
    }

    const je = jeRes.rows[0];

    if (je.status !== 'posted') {
      await client.query('ROLLBACK');
      return { error: 'Can only reverse posted entries', status: 400 };
    }

    // Create reversal entry
    const reversalNumber = `REV-${je.entry_number}`;
    const reversalDesc = description || `Reversal of ${je.entry_number}`;

    const reversalRes = await client.query(
      `INSERT INTO acc_journal_entries
       (tenant_id, entry_number, entry_date, entry_type, description,
        total_debit, total_credit, currency, status, is_reversing, reversed_entry_id)
       VALUES ($1, $2, $3, 'reversing', $4, $5, $6, $7, 'draft', true, $8)
       RETURNING *`,
      [
        tenantId,
        reversalNumber,
        reversal_date || new Date().toISOString().split('T')[0],
        reversalDesc,
        je.total_credit,  // Swap debit/credit
        je.total_debit,
        je.currency,
        journalEntryId
      ]
    );

    const reversalEntry = reversalRes.rows[0];

    // Get original lines and create reversed lines
    const linesRes = await client.query(
      `SELECT * FROM acc_journal_lines WHERE journal_entry_id = $1`,
      [journalEntryId]
    );

    for (const line of linesRes.rows) {
      await client.query(
        `INSERT INTO acc_journal_lines
         (tenant_id, journal_entry_id, line_number, account_id, description,
          debit_amount, credit_amount, currency)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          tenantId,
          reversalEntry.id,
          line.line_number,
          line.account_id,
          `Reversal: ${line.description || ''}`,
          line.credit_amount,  // Swap
          line.debit_amount,   // Swap
          line.currency
        ]
      );
    }

    // Mark original as reversed
    await client.query(
      `UPDATE acc_journal_entries SET status = 'reversed', reversal_date = $1 WHERE id = $2`,
      [reversal_date || new Date().toISOString().split('T')[0], journalEntryId]
    );

    await client.query('COMMIT');

    return { success: true, reversal_entry: reversalEntry };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================
// REPORTS
// ============================================

async function getTrialBalance(tenantId, { as_of_date }) {
  const dateFilter = as_of_date ? 'AND le.entry_date <= $2' : '';
  const params = as_of_date ? [tenantId, as_of_date] : [tenantId];

  const result = await query(
    `SELECT
       a.account_code, a.account_name, a.opening_balance,
       t.category, t.normal_balance,
       COALESCE(SUM(le.debit_amount), 0) as total_debits,
       COALESCE(SUM(le.credit_amount), 0) as total_credits
     FROM acc_accounts a
     LEFT JOIN acc_account_types t ON a.account_type_id = t.id
     LEFT JOIN acc_ledger_entries le ON le.account_id = a.id ${dateFilter}
     WHERE a.tenant_id = $1 AND a.is_active = true AND a.is_header = false
     GROUP BY a.id, t.category, t.normal_balance
     HAVING COALESCE(SUM(le.debit_amount), 0) != 0 OR COALESCE(SUM(le.credit_amount), 0) != 0 OR a.opening_balance != 0
     ORDER BY a.account_code`,
    params
  );

  return result.rows;
}

async function getActivitySummary(tenantId, fromDate, toDate) {
  const result = await query(
    `SELECT
       t.category,
       COUNT(DISTINCT a.id) as account_count,
       COALESCE(SUM(le.debit_amount), 0) as total_debits,
       COALESCE(SUM(le.credit_amount), 0) as total_credits,
       COUNT(le.id) as transaction_count
     FROM acc_accounts a
     LEFT JOIN acc_account_types t ON a.account_type_id = t.id
     LEFT JOIN acc_ledger_entries le ON le.account_id = a.id
       AND le.entry_date >= $2 AND le.entry_date <= $3
     WHERE a.tenant_id = $1 AND a.is_active = true
     GROUP BY t.category
     ORDER BY t.category`,
    [tenantId, fromDate, toDate]
  );

  return result.rows;
}

// ============================================
// CSV EXPORT DATA
// ============================================

async function getLedgerCSVData(tenantId, accountId) {
  const result = await query(
    `SELECT je.entry_date, je.entry_number, jl.description, jl.debit_amount, jl.credit_amount
     FROM acc_journal_lines jl JOIN acc_journal_entries je ON jl.journal_entry_id = je.id
     WHERE jl.tenant_id = $1 AND jl.account_id = $2 AND je.status = 'posted'
     ORDER BY je.entry_date DESC`, [tenantId, accountId]);
  return result.rows;
}

async function getTrialBalanceCSVData(tenantId) {
  const result = await query(
    `SELECT a.account_code, a.account_name, t.category,
     COALESCE(SUM(jl.debit_amount),0) as total_debit, COALESCE(SUM(jl.credit_amount),0) as total_credit
     FROM acc_accounts a LEFT JOIN acc_account_types t ON a.account_type_id = t.id
     LEFT JOIN acc_journal_lines jl ON a.id = jl.account_id AND jl.tenant_id = $1
     LEFT JOIN acc_journal_entries je ON jl.journal_entry_id = je.id AND je.status = 'posted'
     WHERE a.tenant_id = $1 GROUP BY a.id, a.account_code, a.account_name, t.category
     HAVING COALESCE(SUM(jl.debit_amount),0) != 0 OR COALESCE(SUM(jl.credit_amount),0) != 0
     ORDER BY a.account_code`, [tenantId]);
  return result.rows;
}

module.exports = {
  getAccountInfo,
  getAccountFullInfo,
  getLedgerEntries,
  getPriorBalanceTotals,
  getOpeningBalanceTotals,
  getStatementEntries,
  getPeriodBalances,
  postJournalToLedger,
  reverseJournalEntry,
  getTrialBalance,
  getActivitySummary,
  getLedgerCSVData,
  getTrialBalanceCSVData
};
