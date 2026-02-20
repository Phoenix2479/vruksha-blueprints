/**
 * Reconciliation Service
 * Business logic for reconciliation workflows, reporting, and CSV export
 */

const { z } = require('zod');

// Multi-layout support (monorepo vs Docker)
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

const reconciliationSchema = z.object({
  bank_account_id: z.string().uuid(),
  statement_date: z.string(),
  statement_ending_balance: z.number(),
  notes: z.string().optional().nullable()
});

// =============================================================================
// RECONCILIATION OPERATIONS
// =============================================================================

async function listReconciliations(tenantId, bankAccountId, { status, limit = 20, offset = 0 }) {
  let sql = `
    SELECT br.*,
           (SELECT COUNT(*) FROM acc_bank_transactions bt WHERE bt.reconciliation_id = br.id) as transaction_count
    FROM acc_bank_reconciliations br
    WHERE br.bank_account_id = $1 AND br.tenant_id = $2
  `;
  const params = [bankAccountId, tenantId];
  let paramIndex = 3;

  if (status) {
    sql += ` AND br.status = $${paramIndex++}`;
    params.push(status);
  }

  sql += ` ORDER BY br.statement_date DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
  params.push(parseInt(limit), parseInt(offset));

  const result = await query(sql, params);
  return result.rows;
}

async function startReconciliation(tenantId, body) {
  const validation = reconciliationSchema.safeParse(body);

  if (!validation.success) {
    return { error: { status: 400, code: 'VALIDATION_ERROR', message: validation.error.message } };
  }

  const data = validation.data;

  // Check for existing in-progress reconciliation
  const existing = await query(`
    SELECT id FROM acc_bank_reconciliations
    WHERE bank_account_id = $1 AND tenant_id = $2 AND status = 'in_progress'
  `, [data.bank_account_id, tenantId]);

  if (existing.rows.length > 0) {
    return {
      error: { status: 400, code: 'IN_PROGRESS', message: 'A reconciliation is already in progress for this account' }
    };
  }

  // Get opening balance (last completed reconciliation or bank account opening balance)
  const lastRecon = await query(`
    SELECT statement_ending_balance
    FROM acc_bank_reconciliations
    WHERE bank_account_id = $1 AND tenant_id = $2 AND status = 'completed'
    ORDER BY statement_date DESC LIMIT 1
  `, [data.bank_account_id, tenantId]);

  let openingBalance = 0;
  if (lastRecon.rows.length > 0) {
    openingBalance = lastRecon.rows[0].statement_ending_balance;
  } else {
    const bankAccount = await query(
      'SELECT opening_balance FROM acc_bank_accounts WHERE id = $1 AND tenant_id = $2',
      [data.bank_account_id, tenantId]
    );
    if (bankAccount.rows.length > 0) {
      openingBalance = bankAccount.rows[0].opening_balance;
    }
  }

  const result = await query(`
    INSERT INTO acc_bank_reconciliations (
      tenant_id, bank_account_id, statement_date, statement_ending_balance,
      statement_opening_balance, notes, status
    ) VALUES ($1, $2, $3, $4, $5, $6, 'in_progress')
    RETURNING *
  `, [
    tenantId, data.bank_account_id, data.statement_date, data.statement_ending_balance,
    openingBalance, data.notes
  ]);

  await publishEnvelope('accounting.reconciliation.started', { tenantId, reconciliation: result.rows[0] });

  return { data: result.rows[0] };
}

async function getReconciliation(tenantId, id) {
  const result = await query(`
    SELECT br.*, ba.bank_name, ba.account_number
    FROM acc_bank_reconciliations br
    JOIN acc_bank_accounts ba ON br.bank_account_id = ba.id
    WHERE br.id = $1 AND br.tenant_id = $2
  `, [id, tenantId]);

  if (result.rows.length === 0) {
    return { error: { status: 404, code: 'NOT_FOUND', message: 'Reconciliation not found' } };
  }

  // Get matched transactions
  const matched = await query(`
    SELECT * FROM acc_bank_transactions
    WHERE reconciliation_id = $1 AND tenant_id = $2
    ORDER BY transaction_date
  `, [id, tenantId]);

  // Get unmatched transactions for the account
  const recon = result.rows[0];
  const unmatched = await query(`
    SELECT * FROM acc_bank_transactions
    WHERE bank_account_id = $1 AND tenant_id = $2
    AND is_reconciled = false AND reconciliation_id IS NULL
    AND transaction_date <= $3
    ORDER BY transaction_date
  `, [recon.bank_account_id, tenantId, recon.statement_date]);

  // Calculate reconciliation summary
  const matchedCredits = matched.rows.filter(t => t.transaction_type === 'credit').reduce((sum, t) => sum + parseFloat(t.amount), 0);
  const matchedDebits = matched.rows.filter(t => t.transaction_type === 'debit').reduce((sum, t) => sum + parseFloat(t.amount), 0);
  const unmatchedCredits = unmatched.rows.filter(t => t.transaction_type === 'credit').reduce((sum, t) => sum + parseFloat(t.amount), 0);
  const unmatchedDebits = unmatched.rows.filter(t => t.transaction_type === 'debit').reduce((sum, t) => sum + parseFloat(t.amount), 0);

  const calculated_balance = parseFloat(recon.statement_opening_balance) + matchedCredits - matchedDebits;
  const difference = parseFloat(recon.statement_ending_balance) - calculated_balance;

  return {
    data: {
      ...recon,
      matched_transactions: matched.rows,
      unmatched_transactions: unmatched.rows,
      summary: {
        matched_credits: matchedCredits,
        matched_debits: matchedDebits,
        unmatched_credits: unmatchedCredits,
        unmatched_debits: unmatchedDebits,
        calculated_balance,
        difference,
        is_balanced: Math.abs(difference) < 0.01
      }
    }
  };
}

async function matchTransactions(tenantId, id, transaction_ids) {
  if (!Array.isArray(transaction_ids) || transaction_ids.length === 0) {
    return { error: { status: 400, code: 'INVALID_INPUT', message: 'transaction_ids must be a non-empty array' } };
  }

  // Verify reconciliation exists and is in progress
  const recon = await query(`
    SELECT * FROM acc_bank_reconciliations
    WHERE id = $1 AND tenant_id = $2
  `, [id, tenantId]);

  if (recon.rows.length === 0) {
    return { error: { status: 404, code: 'NOT_FOUND', message: 'Reconciliation not found' } };
  }

  if (recon.rows[0].status !== 'in_progress') {
    return { error: { status: 400, code: 'NOT_IN_PROGRESS', message: 'Reconciliation is not in progress' } };
  }

  // Update transactions
  const result = await query(`
    UPDATE acc_bank_transactions
    SET reconciliation_id = $1, updated_at = NOW()
    WHERE id = ANY($2) AND tenant_id = $3 AND bank_account_id = $4
    RETURNING *
  `, [id, transaction_ids, tenantId, recon.rows[0].bank_account_id]);

  return { data: { matched: result.rows.length, transactions: result.rows } };
}

async function unmatchTransactions(tenantId, id, transaction_ids) {
  if (!Array.isArray(transaction_ids) || transaction_ids.length === 0) {
    return { error: { status: 400, code: 'INVALID_INPUT', message: 'transaction_ids must be a non-empty array' } };
  }

  // Verify reconciliation is in progress
  const recon = await query(`
    SELECT status FROM acc_bank_reconciliations
    WHERE id = $1 AND tenant_id = $2
  `, [id, tenantId]);

  if (recon.rows.length === 0) {
    return { error: { status: 404, code: 'NOT_FOUND', message: 'Reconciliation not found' } };
  }

  if (recon.rows[0].status !== 'in_progress') {
    return { error: { status: 400, code: 'NOT_IN_PROGRESS', message: 'Reconciliation is not in progress' } };
  }

  const result = await query(`
    UPDATE acc_bank_transactions
    SET reconciliation_id = NULL, updated_at = NOW()
    WHERE id = ANY($1) AND tenant_id = $2 AND reconciliation_id = $3
    RETURNING *
  `, [transaction_ids, tenantId, id]);

  return { data: { unmatched: result.rows.length, transactions: result.rows } };
}

async function completeReconciliation(tenantId, id, { force = false }) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get reconciliation details
    const recon = await client.query(`
      SELECT * FROM acc_bank_reconciliations
      WHERE id = $1 AND tenant_id = $2
    `, [id, tenantId]);

    if (recon.rows.length === 0) {
      await client.query('ROLLBACK');
      return { error: { status: 404, code: 'NOT_FOUND', message: 'Reconciliation not found' } };
    }

    if (recon.rows[0].status !== 'in_progress') {
      await client.query('ROLLBACK');
      return { error: { status: 400, code: 'NOT_IN_PROGRESS', message: 'Reconciliation is not in progress' } };
    }

    // Calculate balance
    const matched = await client.query(`
      SELECT
        COALESCE(SUM(CASE WHEN transaction_type = 'credit' THEN amount ELSE 0 END), 0) as credits,
        COALESCE(SUM(CASE WHEN transaction_type = 'debit' THEN amount ELSE 0 END), 0) as debits
      FROM acc_bank_transactions
      WHERE reconciliation_id = $1 AND tenant_id = $2
    `, [id, tenantId]);

    const calculated = parseFloat(recon.rows[0].statement_opening_balance) +
                       parseFloat(matched.rows[0].credits) -
                       parseFloat(matched.rows[0].debits);

    const difference = Math.abs(parseFloat(recon.rows[0].statement_ending_balance) - calculated);

    if (difference >= 0.01 && !force) {
      await client.query('ROLLBACK');
      return {
        error: {
          status: 400,
          code: 'NOT_BALANCED',
          message: `Reconciliation is not balanced. Difference: ${difference.toFixed(2)}. Use force=true to complete anyway.`
        }
      };
    }

    // Mark all matched transactions as reconciled
    await client.query(`
      UPDATE acc_bank_transactions
      SET is_reconciled = true, updated_at = NOW()
      WHERE reconciliation_id = $1 AND tenant_id = $2
    `, [id, tenantId]);

    // Update reconciliation status
    const result = await client.query(`
      UPDATE acc_bank_reconciliations
      SET status = 'completed', reconciled_balance = $3, difference_amount = $4,
          completed_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
      RETURNING *
    `, [id, tenantId, calculated, difference]);

    await client.query('COMMIT');

    await publishEnvelope('accounting.reconciliation.completed', { tenantId, reconciliation: result.rows[0] });

    return { data: result.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function cancelReconciliation(tenantId, id) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const recon = await client.query(`
      SELECT status FROM acc_bank_reconciliations
      WHERE id = $1 AND tenant_id = $2
    `, [id, tenantId]);

    if (recon.rows.length === 0) {
      await client.query('ROLLBACK');
      return { error: { status: 404, code: 'NOT_FOUND', message: 'Reconciliation not found' } };
    }

    if (recon.rows[0].status !== 'in_progress') {
      await client.query('ROLLBACK');
      return { error: { status: 400, code: 'NOT_IN_PROGRESS', message: 'Only in-progress reconciliations can be cancelled' } };
    }

    // Unmatch all transactions
    await client.query(`
      UPDATE acc_bank_transactions
      SET reconciliation_id = NULL, updated_at = NOW()
      WHERE reconciliation_id = $1 AND tenant_id = $2
    `, [id, tenantId]);

    // Delete reconciliation
    await client.query(`
      DELETE FROM acc_bank_reconciliations
      WHERE id = $1 AND tenant_id = $2
    `, [id, tenantId]);

    await client.query('COMMIT');

    await publishEnvelope('accounting.reconciliation.cancelled', { tenantId, reconciliationId: id });

    return { data: { cancelled: true } };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// =============================================================================
// REPORTS
// =============================================================================

async function getReconciliationSummary(tenantId, { start_date, end_date }) {
  let dateFilter = '';
  const params = [tenantId];
  let paramIndex = 2;

  if (start_date) {
    dateFilter += ` AND br.statement_date >= $${paramIndex++}`;
    params.push(start_date);
  }

  if (end_date) {
    dateFilter += ` AND br.statement_date <= $${paramIndex++}`;
    params.push(end_date);
  }

  const result = await query(`
    SELECT
      ba.id as bank_account_id,
      ba.bank_name,
      ba.account_number,
      COUNT(CASE WHEN br.status = 'completed' THEN 1 END) as completed_reconciliations,
      COUNT(CASE WHEN br.status = 'in_progress' THEN 1 END) as in_progress_reconciliations,
      MAX(CASE WHEN br.status = 'completed' THEN br.statement_date END) as last_reconciliation_date,
      SUM(CASE WHEN br.status = 'completed' THEN br.difference_amount ELSE 0 END) as total_differences
    FROM acc_bank_accounts ba
    LEFT JOIN acc_bank_reconciliations br ON ba.id = br.bank_account_id AND ba.tenant_id = br.tenant_id ${dateFilter}
    WHERE ba.tenant_id = $1 AND ba.is_active = true
    GROUP BY ba.id, ba.bank_name, ba.account_number
    ORDER BY ba.bank_name
  `, params);

  return result.rows;
}

async function getUnreconciledItems(tenantId, { bank_account_id, cutoff_date }) {
  let sql = `
    SELECT
      bt.*,
      ba.bank_name,
      ba.account_number
    FROM acc_bank_transactions bt
    JOIN acc_bank_accounts ba ON bt.bank_account_id = ba.id
    WHERE bt.tenant_id = $1 AND bt.is_reconciled = false
  `;
  const params = [tenantId];
  let paramIndex = 2;

  if (bank_account_id) {
    sql += ` AND bt.bank_account_id = $${paramIndex++}`;
    params.push(bank_account_id);
  }

  if (cutoff_date) {
    sql += ` AND bt.transaction_date <= $${paramIndex++}`;
    params.push(cutoff_date);
  }

  sql += ' ORDER BY ba.bank_name, bt.transaction_date';

  const result = await query(sql, params);

  // Summarize by bank account
  const summary = {};
  for (const row of result.rows) {
    const key = row.bank_account_id;
    if (!summary[key]) {
      summary[key] = {
        bank_account_id: key,
        bank_name: row.bank_name,
        account_number: row.account_number,
        count: 0,
        total_debits: 0,
        total_credits: 0
      };
    }
    summary[key].count++;
    if (row.transaction_type === 'debit') {
      summary[key].total_debits += parseFloat(row.amount);
    } else {
      summary[key].total_credits += parseFloat(row.amount);
    }
  }

  return {
    transactions: result.rows,
    summary: Object.values(summary)
  };
}

async function exportReconciliationSummaryCsv(tenantId) {
  const result = await query(
    `SELECT ba.account_name, ba.bank_name, r.reconciliation_date, r.status, r.statement_balance, r.book_balance, r.difference
     FROM acc_reconciliations r JOIN acc_bank_accounts ba ON r.bank_account_id = ba.id
     WHERE r.tenant_id = $1 ORDER BY r.reconciliation_date DESC`,
    [tenantId]
  );
  return result.rows;
}

module.exports = {
  reconciliationSchema,
  listReconciliations,
  startReconciliation,
  getReconciliation,
  matchTransactions,
  unmatchTransactions,
  completeReconciliation,
  cancelReconciliation,
  getReconciliationSummary,
  getUnreconciledItems,
  exportReconciliationSummaryCsv
};
