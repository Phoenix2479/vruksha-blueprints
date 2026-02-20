/**
 * Bank Account Service
 * Business logic for bank account CRUD and balance calculations
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

const { query } = db;
const { publishEnvelope } = sdk;

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const bankAccountSchema = z.object({
  account_id: z.string().uuid(),
  bank_name: z.string().min(1).max(255),
  account_number: z.string().min(1).max(50),
  ifsc_code: z.string().max(20).optional().nullable(),
  branch_name: z.string().max(255).optional().nullable(),
  account_type: z.enum(['savings', 'current', 'cash_credit', 'overdraft', 'fixed_deposit']).default('current'),
  currency: z.string().length(3).default('INR'),
  opening_balance: z.number().default(0),
  opening_balance_date: z.string().optional().nullable(),
  is_active: z.boolean().default(true)
});

// =============================================================================
// BANK ACCOUNT OPERATIONS
// =============================================================================

async function listAccounts(tenantId, { is_active, account_type }) {
  let sql = `
    SELECT ba.*, a.account_code, a.account_name,
           (SELECT COUNT(*) FROM acc_bank_transactions bt WHERE bt.bank_account_id = ba.id AND bt.tenant_id = ba.tenant_id) as transaction_count,
           (SELECT SUM(CASE WHEN bt.transaction_type = 'credit' THEN bt.amount ELSE -bt.amount END)
            FROM acc_bank_transactions bt WHERE bt.bank_account_id = ba.id AND bt.tenant_id = ba.tenant_id) as net_movement
    FROM acc_bank_accounts ba
    JOIN acc_accounts a ON ba.account_id = a.id AND ba.tenant_id = a.tenant_id
    WHERE ba.tenant_id = $1
  `;
  const params = [tenantId];
  let paramIndex = 2;

  if (is_active !== undefined) {
    sql += ` AND ba.is_active = $${paramIndex++}`;
    params.push(is_active === 'true');
  }

  if (account_type) {
    sql += ` AND ba.account_type = $${paramIndex++}`;
    params.push(account_type);
  }

  sql += ' ORDER BY ba.bank_name, ba.account_number';

  const result = await query(sql, params);
  return result.rows;
}

async function getAccount(tenantId, id) {
  const result = await query(`
    SELECT ba.*, a.account_code, a.account_name,
           (SELECT COUNT(*) FROM acc_bank_transactions bt WHERE bt.bank_account_id = ba.id AND bt.tenant_id = ba.tenant_id) as transaction_count,
           (SELECT MAX(bt.transaction_date) FROM acc_bank_transactions bt WHERE bt.bank_account_id = ba.id AND bt.tenant_id = ba.tenant_id) as last_transaction_date,
           (SELECT MAX(br.statement_date) FROM acc_bank_reconciliations br WHERE br.bank_account_id = ba.id AND br.tenant_id = ba.tenant_id AND br.status = 'completed') as last_reconciliation_date
    FROM acc_bank_accounts ba
    JOIN acc_accounts a ON ba.account_id = a.id AND ba.tenant_id = a.tenant_id
    WHERE ba.id = $1 AND ba.tenant_id = $2
  `, [id, tenantId]);

  return result.rows[0] || null;
}

async function createAccount(tenantId, body) {
  const validation = bankAccountSchema.safeParse(body);

  if (!validation.success) {
    return { error: { status: 400, code: 'VALIDATION_ERROR', message: validation.error.message } };
  }

  const data = validation.data;

  // Verify the linked GL account exists and is a bank-type account
  const accountCheck = await query(`
    SELECT a.id, at.category
    FROM acc_accounts a
    JOIN acc_account_types at ON a.account_type_id = at.id
    WHERE a.id = $1 AND a.tenant_id = $2
  `, [data.account_id, tenantId]);

  if (accountCheck.rows.length === 0) {
    return { error: { status: 400, code: 'INVALID_ACCOUNT', message: 'Linked GL account not found' } };
  }

  if (accountCheck.rows[0].category !== 'ASSET') {
    return { error: { status: 400, code: 'INVALID_ACCOUNT_TYPE', message: 'Bank account must be linked to an Asset account' } };
  }

  const result = await query(`
    INSERT INTO acc_bank_accounts (
      tenant_id, account_id, bank_name, account_number, ifsc_code, branch_name,
      account_type, currency, opening_balance, opening_balance_date, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *
  `, [
    tenantId, data.account_id, data.bank_name, data.account_number, data.ifsc_code,
    data.branch_name, data.account_type, data.currency, data.opening_balance,
    data.opening_balance_date, data.is_active
  ]);

  await publishEnvelope('accounting.bank_account.created', { tenantId, bankAccount: result.rows[0] });

  return { data: result.rows[0] };
}

async function updateAccount(tenantId, id, body) {
  const validation = bankAccountSchema.partial().safeParse(body);

  if (!validation.success) {
    return { error: { status: 400, code: 'VALIDATION_ERROR', message: validation.error.message } };
  }

  const data = validation.data;
  const updates = [];
  const values = [id, tenantId];
  let paramIndex = 3;

  const fieldMap = {
    bank_name: 'bank_name',
    account_number: 'account_number',
    ifsc_code: 'ifsc_code',
    branch_name: 'branch_name',
    account_type: 'account_type',
    currency: 'currency',
    is_active: 'is_active'
  };

  for (const [key, column] of Object.entries(fieldMap)) {
    if (data[key] !== undefined) {
      updates.push(`${column} = $${paramIndex++}`);
      values.push(data[key]);
    }
  }

  if (updates.length === 0) {
    return { error: { status: 400, code: 'NO_UPDATES', message: 'No fields to update' } };
  }

  const result = await query(`
    UPDATE acc_bank_accounts
    SET ${updates.join(', ')}, updated_at = NOW()
    WHERE id = $1 AND tenant_id = $2
    RETURNING *
  `, values);

  if (result.rows.length === 0) {
    return { error: { status: 404, code: 'NOT_FOUND', message: 'Bank account not found' } };
  }

  await publishEnvelope('accounting.bank_account.updated', { tenantId, bankAccount: result.rows[0] });

  return { data: result.rows[0] };
}

async function getBalance(tenantId, id, { as_of_date }) {
  const bankAccount = await query(`
    SELECT ba.*, a.account_code, a.account_name
    FROM acc_bank_accounts ba
    JOIN acc_accounts a ON ba.account_id = a.id
    WHERE ba.id = $1 AND ba.tenant_id = $2
  `, [id, tenantId]);

  if (bankAccount.rows.length === 0) {
    return { error: { status: 404, code: 'NOT_FOUND', message: 'Bank account not found' } };
  }

  const account = bankAccount.rows[0];
  let dateFilter = '';
  const params = [id, tenantId];

  if (as_of_date) {
    dateFilter = ' AND transaction_date <= $3';
    params.push(as_of_date);
  }

  const transactions = await query(`
    SELECT
      COALESCE(SUM(CASE WHEN transaction_type = 'credit' THEN amount ELSE 0 END), 0) as total_credits,
      COALESCE(SUM(CASE WHEN transaction_type = 'debit' THEN amount ELSE 0 END), 0) as total_debits
    FROM acc_bank_transactions
    WHERE bank_account_id = $1 AND tenant_id = $2 ${dateFilter}
  `, params);

  const { total_credits, total_debits } = transactions.rows[0];
  const book_balance = parseFloat(account.opening_balance) + parseFloat(total_credits) - parseFloat(total_debits);

  // Get GL balance for comparison
  const glParams = [account.account_id, tenantId];
  let glDateFilter = '';
  if (as_of_date) {
    glDateFilter = ' AND le.entry_date <= $3';
    glParams.push(as_of_date);
  }

  const glBalance = await query(`
    SELECT COALESCE(SUM(le.debit_amount - le.credit_amount), 0) as gl_balance
    FROM acc_ledger_entries le
    WHERE le.account_id = $1 AND le.tenant_id = $2 ${glDateFilter}
  `, glParams);

  return {
    data: {
      bank_account_id: id,
      account_name: account.account_name,
      opening_balance: parseFloat(account.opening_balance),
      total_credits: parseFloat(total_credits),
      total_debits: parseFloat(total_debits),
      book_balance,
      gl_balance: parseFloat(glBalance.rows[0].gl_balance),
      difference: book_balance - parseFloat(glBalance.rows[0].gl_balance),
      as_of_date: as_of_date || new Date().toISOString().split('T')[0]
    }
  };
}

module.exports = {
  bankAccountSchema,
  listAccounts,
  getAccount,
  createAccount,
  updateAccount,
  getBalance
};
