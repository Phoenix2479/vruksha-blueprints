/**
 * Transaction Service
 * Business logic for bank transaction management, import, deletion, and auto-matching
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

const bankTransactionSchema = z.object({
  bank_account_id: z.string().uuid(),
  transaction_date: z.string(),
  value_date: z.string().optional().nullable(),
  reference_number: z.string().max(100).optional().nullable(),
  description: z.string().min(1),
  transaction_type: z.enum(['debit', 'credit']),
  amount: z.number().positive(),
  balance_after: z.number().optional().nullable(),
  cheque_number: z.string().max(20).optional().nullable(),
  payee_payer: z.string().max(255).optional().nullable(),
  category: z.string().max(100).optional().nullable()
});

const importTransactionsSchema = z.object({
  bank_account_id: z.string().uuid(),
  format: z.enum(['csv', 'ofx', 'mt940', 'custom']).default('csv'),
  transactions: z.array(z.object({
    transaction_date: z.string(),
    value_date: z.string().optional().nullable(),
    reference_number: z.string().optional().nullable(),
    description: z.string(),
    debit_amount: z.number().optional().nullable(),
    credit_amount: z.number().optional().nullable(),
    balance: z.number().optional().nullable(),
    cheque_number: z.string().optional().nullable()
  }))
});

// =============================================================================
// TRANSACTION OPERATIONS
// =============================================================================

async function listTransactions(tenantId, bankAccountId, { start_date, end_date, reconciliation_status, limit = 100, offset = 0 }) {
  let sql = `
    SELECT bt.*, br.id as reconciliation_id, br.statement_date as reconciled_date
    FROM acc_bank_transactions bt
    LEFT JOIN acc_bank_reconciliations br ON bt.reconciliation_id = br.id
    WHERE bt.bank_account_id = $1 AND bt.tenant_id = $2
  `;
  const params = [bankAccountId, tenantId];
  let paramIndex = 3;

  if (start_date) {
    sql += ` AND bt.transaction_date >= $${paramIndex++}`;
    params.push(start_date);
  }

  if (end_date) {
    sql += ` AND bt.transaction_date <= $${paramIndex++}`;
    params.push(end_date);
  }

  if (reconciliation_status === 'reconciled') {
    sql += ' AND bt.is_reconciled = true';
  } else if (reconciliation_status === 'unreconciled') {
    sql += ' AND bt.is_reconciled = false';
  }

  sql += ` ORDER BY bt.transaction_date DESC, bt.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
  params.push(parseInt(limit), parseInt(offset));

  const result = await query(sql, params);

  // Get total count
  const countResult = await query(`
    SELECT COUNT(*) as total
    FROM acc_bank_transactions
    WHERE bank_account_id = $1 AND tenant_id = $2
  `, [bankAccountId, tenantId]);

  return {
    rows: result.rows,
    pagination: {
      limit: parseInt(limit),
      offset: parseInt(offset),
      total: parseInt(countResult.rows[0].total)
    }
  };
}

async function addTransaction(tenantId, bankAccountId, body) {
  const validation = bankTransactionSchema.safeParse({ ...body, bank_account_id: bankAccountId });

  if (!validation.success) {
    return { error: { status: 400, code: 'VALIDATION_ERROR', message: validation.error.message } };
  }

  const data = validation.data;

  // Verify bank account exists
  const bankAccount = await query(
    'SELECT id FROM acc_bank_accounts WHERE id = $1 AND tenant_id = $2',
    [bankAccountId, tenantId]
  );

  if (bankAccount.rows.length === 0) {
    return { error: { status: 404, code: 'NOT_FOUND', message: 'Bank account not found' } };
  }

  const result = await query(`
    INSERT INTO acc_bank_transactions (
      tenant_id, bank_account_id, transaction_date, value_date, reference_number,
      description, transaction_type, amount, balance_after, cheque_number,
      payee_payer, category
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *
  `, [
    tenantId, bankAccountId, data.transaction_date, data.value_date, data.reference_number,
    data.description, data.transaction_type, data.amount, data.balance_after, data.cheque_number,
    data.payee_payer, data.category
  ]);

  await publishEnvelope('accounting.bank_transaction.created', { tenantId, transaction: result.rows[0] });

  return { data: result.rows[0] };
}

async function importTransactions(tenantId, bankAccountId, body) {
  const validation = importTransactionsSchema.safeParse({ ...body, bank_account_id: bankAccountId });

  if (!validation.success) {
    return { error: { status: 400, code: 'VALIDATION_ERROR', message: validation.error.message } };
  }

  const { transactions } = validation.data;

  // Verify bank account exists
  const bankAccount = await query(
    'SELECT id FROM acc_bank_accounts WHERE id = $1 AND tenant_id = $2',
    [bankAccountId, tenantId]
  );

  if (bankAccount.rows.length === 0) {
    return { error: { status: 404, code: 'NOT_FOUND', message: 'Bank account not found' } };
  }

  const client = await getClient();
  let imported = 0;
  let skipped = 0;
  const errors = [];

  try {
    await client.query('BEGIN');

    for (const tx of transactions) {
      // Determine transaction type and amount
      let transactionType, amount;
      if (tx.debit_amount && tx.debit_amount > 0) {
        transactionType = 'debit';
        amount = tx.debit_amount;
      } else if (tx.credit_amount && tx.credit_amount > 0) {
        transactionType = 'credit';
        amount = tx.credit_amount;
      } else {
        skipped++;
        continue;
      }

      // Check for duplicate based on date, amount, and reference
      const duplicate = await client.query(`
        SELECT id FROM acc_bank_transactions
        WHERE bank_account_id = $1 AND tenant_id = $2
        AND transaction_date = $3 AND amount = $4
        AND (reference_number = $5 OR ($5 IS NULL AND reference_number IS NULL))
      `, [bankAccountId, tenantId, tx.transaction_date, amount, tx.reference_number || null]);

      if (duplicate.rows.length > 0) {
        skipped++;
        continue;
      }

      await client.query(`
        INSERT INTO acc_bank_transactions (
          tenant_id, bank_account_id, transaction_date, value_date, reference_number,
          description, transaction_type, amount, balance_after, cheque_number, import_source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'import')
      `, [
        tenantId, bankAccountId, tx.transaction_date, tx.value_date || tx.transaction_date,
        tx.reference_number, tx.description, transactionType, amount, tx.balance, tx.cheque_number
      ]);

      imported++;
    }

    await client.query('COMMIT');

    await publishEnvelope('accounting.bank_transactions.imported', {
      tenantId,
      bankAccountId,
      imported,
      skipped
    });

    return { data: { imported, skipped, errors, total: transactions.length } };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deleteTransaction(tenantId, bankAccountId, id) {
  // Check if transaction is reconciled
  const txCheck = await query(`
    SELECT is_reconciled FROM acc_bank_transactions
    WHERE id = $1 AND bank_account_id = $2 AND tenant_id = $3
  `, [id, bankAccountId, tenantId]);

  if (txCheck.rows.length === 0) {
    return { error: { status: 404, code: 'NOT_FOUND', message: 'Transaction not found' } };
  }

  if (txCheck.rows[0].is_reconciled) {
    return { error: { status: 400, code: 'RECONCILED', message: 'Cannot delete reconciled transaction' } };
  }

  await query(`
    DELETE FROM acc_bank_transactions
    WHERE id = $1 AND bank_account_id = $2 AND tenant_id = $3
  `, [id, bankAccountId, tenantId]);

  await publishEnvelope('accounting.bank_transaction.deleted', { tenantId, transactionId: id });

  return { data: { deleted: true } };
}

async function exportTransactionsCsv(tenantId, bankAccountId) {
  const result = await query(
    'SELECT * FROM acc_bank_transactions WHERE tenant_id = $1 AND bank_account_id = $2 ORDER BY transaction_date DESC',
    [tenantId, bankAccountId]
  );
  return result.rows;
}

// =============================================================================
// AUTO-MATCHING
// =============================================================================

async function autoMatch(tenantId, bankAccountId, { date_tolerance_days = 3, amount_tolerance = 0 }) {
  // Get bank account and linked GL account
  const bankAccount = await query(`
    SELECT ba.*, a.id as gl_account_id
    FROM acc_bank_accounts ba
    JOIN acc_accounts a ON ba.account_id = a.id
    WHERE ba.id = $1 AND ba.tenant_id = $2
  `, [bankAccountId, tenantId]);

  if (bankAccount.rows.length === 0) {
    return { error: { status: 404, code: 'NOT_FOUND', message: 'Bank account not found' } };
  }

  const glAccountId = bankAccount.rows[0].gl_account_id;

  // Get unmatched bank transactions
  const bankTxns = await query(`
    SELECT * FROM acc_bank_transactions
    WHERE bank_account_id = $1 AND tenant_id = $2
    AND is_reconciled = false AND matched_ledger_entry_id IS NULL
    ORDER BY transaction_date
  `, [bankAccountId, tenantId]);

  // Get unmatched ledger entries
  const ledgerEntries = await query(`
    SELECT le.*, je.entry_number, je.description as journal_description
    FROM acc_ledger_entries le
    JOIN acc_journal_entries je ON le.journal_entry_id = je.id
    WHERE le.account_id = $1 AND le.tenant_id = $2
    AND le.id NOT IN (
      SELECT matched_ledger_entry_id FROM acc_bank_transactions
      WHERE matched_ledger_entry_id IS NOT NULL AND tenant_id = $2
    )
    ORDER BY le.entry_date
  `, [glAccountId, tenantId]);

  const matches = [];
  const usedLedgerIds = new Set();

  for (const bankTx of bankTxns.rows) {
    const bankAmount = parseFloat(bankTx.amount);
    const isDebit = bankTx.transaction_type === 'debit';

    for (const ledgerEntry of ledgerEntries.rows) {
      if (usedLedgerIds.has(ledgerEntry.id)) continue;

      // Match based on amount (bank debit = ledger credit, bank credit = ledger debit)
      const ledgerAmount = isDebit ? parseFloat(ledgerEntry.credit_amount) : parseFloat(ledgerEntry.debit_amount);
      const amountDiff = Math.abs(bankAmount - ledgerAmount);

      if (amountDiff > amount_tolerance) continue;

      // Check date tolerance
      const bankDate = new Date(bankTx.transaction_date);
      const ledgerDate = new Date(ledgerEntry.entry_date);
      const dateDiff = Math.abs((bankDate - ledgerDate) / (1000 * 60 * 60 * 24));

      if (dateDiff > date_tolerance_days) continue;

      // Match found
      matches.push({
        bank_transaction_id: bankTx.id,
        ledger_entry_id: ledgerEntry.id,
        amount_difference: amountDiff,
        date_difference_days: dateDiff,
        confidence: amountDiff === 0 && dateDiff === 0 ? 'high' : dateDiff <= 1 ? 'medium' : 'low'
      });

      usedLedgerIds.add(ledgerEntry.id);
      break;
    }
  }

  return {
    data: {
      matches,
      unmatched_bank_transactions: bankTxns.rows.length - matches.length,
      unmatched_ledger_entries: ledgerEntries.rows.length - matches.length
    }
  };
}

async function applyMatches(tenantId, bankAccountId, matches) {
  if (!Array.isArray(matches) || matches.length === 0) {
    return { error: { status: 400, code: 'INVALID_INPUT', message: 'matches must be a non-empty array' } };
  }

  const client = await getClient();
  let applied = 0;

  try {
    await client.query('BEGIN');

    for (const match of matches) {
      await client.query(`
        UPDATE acc_bank_transactions
        SET matched_ledger_entry_id = $1, match_type = 'auto', updated_at = NOW()
        WHERE id = $2 AND bank_account_id = $3 AND tenant_id = $4
      `, [match.ledger_entry_id, match.bank_transaction_id, bankAccountId, tenantId]);
      applied++;
    }

    await client.query('COMMIT');

    await publishEnvelope('accounting.bank_transactions.matched', { tenantId, bankAccountId, matchCount: applied });

    return { data: { applied } };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  bankTransactionSchema,
  importTransactionsSchema,
  listTransactions,
  addTransaction,
  importTransactions,
  deleteTransaction,
  exportTransactionsCsv,
  autoMatch,
  applyMatches
};
