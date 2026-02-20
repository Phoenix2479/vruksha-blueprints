// Account Service - Business logic and DB queries for accounts

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
// ACCOUNT CRUD
// ============================================

async function listAccounts(tenantId, { type, active_only, flat }) {
  let conditions = ['a.tenant_id = $1'];
  const params = [tenantId];
  let idx = 2;

  if (type) {
    conditions.push(`t.category = $${idx}`);
    params.push(type);
    idx++;
  }

  if (active_only === 'true') {
    conditions.push('a.is_active = true');
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT a.*, t.name as account_type_name, t.category, t.normal_balance,
            p.account_code as parent_code, p.account_name as parent_name
     FROM acc_accounts a
     LEFT JOIN acc_account_types t ON a.account_type_id = t.id
     LEFT JOIN acc_accounts p ON a.parent_account_id = p.id
     ${whereClause}
     ORDER BY a.account_code`,
    params
  );

  if (flat === 'true') {
    return { accounts: result.rows };
  }

  // Build hierarchy
  const accounts = result.rows;
  const accountMap = new Map();
  const rootAccounts = [];

  accounts.forEach(acc => {
    acc.children = [];
    accountMap.set(acc.id, acc);
  });

  accounts.forEach(acc => {
    if (acc.parent_account_id && accountMap.has(acc.parent_account_id)) {
      accountMap.get(acc.parent_account_id).children.push(acc);
    } else {
      rootAccounts.push(acc);
    }
  });

  return { accounts: rootAccounts, total: accounts.length };
}

async function getAccountById(tenantId, accountId) {
  const result = await query(
    `SELECT a.*, t.name as account_type_name, t.category, t.normal_balance
     FROM acc_accounts a
     LEFT JOIN acc_account_types t ON a.account_type_id = t.id
     WHERE a.tenant_id = $1 AND a.id = $2`,
    [tenantId, accountId]
  );

  if (result.rows.length === 0) return null;

  // Get child accounts
  const children = await query(
    `SELECT id, account_code, account_name FROM acc_accounts
     WHERE tenant_id = $1 AND parent_account_id = $2
     ORDER BY account_code`,
    [tenantId, accountId]
  );

  const account = result.rows[0];
  account.children = children.rows;

  return account;
}

async function getAccountByCode(tenantId, accountCode) {
  const result = await query(
    `SELECT a.*, t.name as account_type_name, t.category, t.normal_balance
     FROM acc_accounts a
     LEFT JOIN acc_account_types t ON a.account_type_id = t.id
     WHERE a.tenant_id = $1 AND a.account_code = $2`,
    [tenantId, accountCode]
  );

  return result.rows[0] || null;
}

async function createAccount(tenantId, data) {
  // If no account_type_id, try to infer from code prefix
  let accountTypeId = data.account_type_id;
  if (!accountTypeId) {
    const prefix = data.account_code.charAt(0);
    const typeMapping = {
      '1': 'ASSET', '2': 'ASSET',
      '3': 'LIABILITY', '4': 'LIABILITY',
      '5': 'EQUITY',
      '6': 'REVENUE', '7': 'REVENUE',
      '8': 'EXPENSE', '9': 'EXPENSE'
    };
    if (typeMapping[prefix]) {
      const typeResult = await query(
        'SELECT id FROM acc_account_types WHERE tenant_id = $1 AND code = $2',
        [tenantId, typeMapping[prefix]]
      );
      if (typeResult.rows.length > 0) {
        accountTypeId = typeResult.rows[0].id;
      }
    }
  }

  const result = await query(
    `INSERT INTO acc_accounts
     (tenant_id, account_code, account_name, account_type_id, parent_account_id,
      description, is_active, is_header, is_bank_account, is_control_account,
      currency, default_tax_code, is_tax_applicable, opening_balance, opening_balance_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING *`,
    [
      tenantId,
      data.account_code,
      data.account_name,
      accountTypeId,
      data.parent_account_id || null,
      data.description,
      data.is_active !== false,
      data.is_header || false,
      data.is_bank_account || false,
      data.is_control_account || false,
      data.currency || 'INR',
      data.default_tax_code,
      data.is_tax_applicable !== false,
      data.opening_balance || 0,
      data.opening_balance_date || null
    ]
  );

  await publishEnvelope('accounting.chart_of_accounts.account.created.v1', 1, {
    account_id: result.rows[0].id,
    account_code: data.account_code,
    account_name: data.account_name
  });

  return result.rows[0];
}

async function updateAccount(tenantId, accountId, data) {
  // Check if account exists and is not system
  const existing = await query(
    'SELECT is_system FROM acc_accounts WHERE tenant_id = $1 AND id = $2',
    [tenantId, accountId]
  );

  if (existing.rows.length === 0) {
    return { error: 'Account not found', status: 404 };
  }

  if (existing.rows[0].is_system && (data.account_code || data.is_active === false)) {
    return { error: 'Cannot modify system account code or deactivate', status: 403 };
  }

  // Build dynamic update
  const updates = [];
  const values = [tenantId, accountId];
  let idx = 3;

  const fields = [
    'account_code', 'account_name', 'account_type_id', 'parent_account_id',
    'description', 'is_active', 'is_header', 'is_bank_account', 'is_control_account',
    'currency', 'default_tax_code', 'is_tax_applicable', 'opening_balance', 'opening_balance_date'
  ];

  fields.forEach(field => {
    if (data[field] !== undefined) {
      updates.push(`${field} = $${idx}`);
      values.push(data[field]);
      idx++;
    }
  });

  if (updates.length === 0) {
    return { error: 'No fields to update', status: 400 };
  }

  updates.push('updated_at = NOW()');

  const result = await query(
    `UPDATE acc_accounts SET ${updates.join(', ')}
     WHERE tenant_id = $1 AND id = $2
     RETURNING *`,
    values
  );

  await publishEnvelope('accounting.chart_of_accounts.account.updated.v1', 1, {
    account_id: accountId,
    updated_fields: Object.keys(data)
  });

  return { account: result.rows[0] };
}

async function deleteAccount(tenantId, accountId) {
  const existing = await query(
    `SELECT a.is_system,
            (SELECT COUNT(*) FROM acc_journal_lines jl WHERE jl.account_id = a.id) as posting_count,
            (SELECT COUNT(*) FROM acc_accounts c WHERE c.parent_account_id = a.id) as child_count
     FROM acc_accounts a
     WHERE a.tenant_id = $1 AND a.id = $2`,
    [tenantId, accountId]
  );

  if (existing.rows.length === 0) {
    return { error: 'Account not found', status: 404 };
  }

  const acc = existing.rows[0];

  if (acc.is_system) {
    return { error: 'Cannot delete system account', status: 403 };
  }

  if (parseInt(acc.posting_count) > 0) {
    return { error: 'Cannot delete account with postings. Deactivate instead.', status: 409 };
  }

  if (parseInt(acc.child_count) > 0) {
    return { error: 'Cannot delete account with child accounts', status: 409 };
  }

  // Soft delete (deactivate)
  await query(
    'UPDATE acc_accounts SET is_active = false, updated_at = NOW() WHERE tenant_id = $1 AND id = $2',
    [tenantId, accountId]
  );

  return { success: true };
}

// ============================================
// ACCOUNT BALANCE & TRIAL BALANCE
// ============================================

async function getAccountBalance(tenantId, accountId, asOfDate) {
  let dateFilter = '';
  const params = [tenantId, accountId];

  if (asOfDate) {
    dateFilter = 'AND je.entry_date <= $3';
    params.push(asOfDate);
  }

  const result = await query(
    `SELECT
       a.account_code, a.account_name, a.opening_balance,
       t.normal_balance,
       COALESCE(SUM(jl.debit_amount), 0) as total_debits,
       COALESCE(SUM(jl.credit_amount), 0) as total_credits
     FROM acc_accounts a
     LEFT JOIN acc_account_types t ON a.account_type_id = t.id
     LEFT JOIN acc_journal_lines jl ON jl.account_id = a.id
     LEFT JOIN acc_journal_entries je ON jl.journal_entry_id = je.id AND je.status = 'posted' ${dateFilter}
     WHERE a.tenant_id = $1 AND a.id = $2
     GROUP BY a.id, t.normal_balance`,
    params
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  const openingBalance = parseFloat(row.opening_balance) || 0;
  const totalDebits = parseFloat(row.total_debits) || 0;
  const totalCredits = parseFloat(row.total_credits) || 0;

  let balance;
  if (row.normal_balance === 'debit') {
    balance = openingBalance + totalDebits - totalCredits;
  } else {
    balance = openingBalance + totalCredits - totalDebits;
  }

  return {
    account_code: row.account_code,
    account_name: row.account_name,
    opening_balance: openingBalance,
    total_debits: totalDebits,
    total_credits: totalCredits,
    current_balance: balance,
    normal_balance: row.normal_balance,
    as_of_date: asOfDate || new Date().toISOString().split('T')[0]
  };
}

async function getTrialBalance(tenantId, { as_of_date, show_zero }) {
  let dateFilter = '';
  const params = [tenantId];

  if (as_of_date) {
    dateFilter = 'AND je.entry_date <= $2';
    params.push(as_of_date);
  }

  const result = await query(
    `SELECT
       a.id, a.account_code, a.account_name, a.opening_balance,
       t.category, t.normal_balance,
       COALESCE(SUM(jl.debit_amount), 0) as total_debits,
       COALESCE(SUM(jl.credit_amount), 0) as total_credits
     FROM acc_accounts a
     LEFT JOIN acc_account_types t ON a.account_type_id = t.id
     LEFT JOIN acc_journal_lines jl ON jl.account_id = a.id
     LEFT JOIN acc_journal_entries je ON jl.journal_entry_id = je.id AND je.status = 'posted' ${dateFilter}
     WHERE a.tenant_id = $1 AND a.is_active = true AND a.is_header = false
     GROUP BY a.id, t.category, t.normal_balance
     ORDER BY a.account_code`,
    params
  );

  const accounts = result.rows.map(row => {
    const openingBalance = parseFloat(row.opening_balance) || 0;
    const totalDebits = parseFloat(row.total_debits) || 0;
    const totalCredits = parseFloat(row.total_credits) || 0;

    let balance;
    if (row.normal_balance === 'debit') {
      balance = openingBalance + totalDebits - totalCredits;
    } else {
      balance = openingBalance + totalCredits - totalDebits;
    }

    return {
      account_code: row.account_code,
      account_name: row.account_name,
      category: row.category,
      debit_balance: balance > 0 && row.normal_balance === 'debit' ? balance : (balance < 0 && row.normal_balance === 'credit' ? Math.abs(balance) : (totalDebits > totalCredits ? totalDebits - totalCredits : 0)),
      credit_balance: balance > 0 && row.normal_balance === 'credit' ? balance : (balance < 0 && row.normal_balance === 'debit' ? Math.abs(balance) : (totalCredits > totalDebits ? totalCredits - totalDebits : 0)),
    };
  }).filter(acc => show_zero === 'true' || acc.debit_balance !== 0 || acc.credit_balance !== 0);

  const totals = accounts.reduce((acc, curr) => {
    acc.total_debits += curr.debit_balance;
    acc.total_credits += curr.credit_balance;
    return acc;
  }, { total_debits: 0, total_credits: 0 });

  return {
    as_of_date: as_of_date || new Date().toISOString().split('T')[0],
    accounts,
    totals,
    is_balanced: Math.abs(totals.total_debits - totals.total_credits) < 0.01
  };
}

// ============================================
// SEARCH & LOOKUP
// ============================================

async function searchAccounts(tenantId, q, limit = 20) {
  const result = await query(
    `SELECT a.id, a.account_code, a.account_name, t.category, a.is_header
     FROM acc_accounts a
     LEFT JOIN acc_account_types t ON a.account_type_id = t.id
     WHERE a.tenant_id = $1 AND a.is_active = true
       AND (a.account_code ILIKE $2 OR a.account_name ILIKE $2)
     ORDER BY a.account_code
     LIMIT $3`,
    [tenantId, `%${q}%`, limit]
  );

  return result.rows;
}

async function getPostableAccounts(tenantId, category) {
  let conditions = ['a.tenant_id = $1', 'a.is_active = true', 'a.is_header = false'];
  const params = [tenantId];

  if (category) {
    conditions.push('t.category = $2');
    params.push(category);
  }

  const result = await query(
    `SELECT a.id, a.account_code, a.account_name, t.category, t.normal_balance
     FROM acc_accounts a
     LEFT JOIN acc_account_types t ON a.account_type_id = t.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY a.account_code`,
    params
  );

  return result.rows;
}

// ============================================
// IMPORT/EXPORT
// ============================================

async function exportAccounts(tenantId) {
  const result = await query(
    `SELECT a.account_code, a.account_name, t.code as account_type,
            p.account_code as parent_code, a.description, a.is_header,
            a.is_bank_account, a.currency, a.opening_balance
     FROM acc_accounts a
     LEFT JOIN acc_account_types t ON a.account_type_id = t.id
     LEFT JOIN acc_accounts p ON a.parent_account_id = p.id
     WHERE a.tenant_id = $1 AND a.is_system = false
     ORDER BY a.account_code`,
    [tenantId]
  );

  return result.rows;
}

async function importAccounts(tenantId, accounts) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const results = { created: 0, updated: 0, errors: [] };

    for (const acc of accounts) {
      try {
        // Check if exists
        const existing = await client.query(
          'SELECT id FROM acc_accounts WHERE tenant_id = $1 AND account_code = $2',
          [tenantId, acc.account_code]
        );

        // Get account type ID
        let accountTypeId = null;
        if (acc.account_type) {
          const typeRes = await client.query(
            'SELECT id FROM acc_account_types WHERE tenant_id = $1 AND code = $2',
            [tenantId, acc.account_type]
          );
          if (typeRes.rows.length > 0) {
            accountTypeId = typeRes.rows[0].id;
          }
        }

        // Get parent ID
        let parentId = null;
        if (acc.parent_code) {
          const parentRes = await client.query(
            'SELECT id FROM acc_accounts WHERE tenant_id = $1 AND account_code = $2',
            [tenantId, acc.parent_code]
          );
          if (parentRes.rows.length > 0) {
            parentId = parentRes.rows[0].id;
          }
        }

        if (existing.rows.length > 0) {
          // Update
          await client.query(
            `UPDATE acc_accounts SET
             account_name = $3, account_type_id = $4, parent_account_id = $5,
             description = $6, is_header = $7, is_bank_account = $8,
             currency = $9, opening_balance = $10, updated_at = NOW()
             WHERE tenant_id = $1 AND account_code = $2`,
            [
              tenantId, acc.account_code, acc.account_name, accountTypeId, parentId,
              acc.description, acc.is_header || false, acc.is_bank_account || false,
              acc.currency || 'INR', acc.opening_balance || 0
            ]
          );
          results.updated++;
        } else {
          // Insert
          await client.query(
            `INSERT INTO acc_accounts
             (tenant_id, account_code, account_name, account_type_id, parent_account_id,
              description, is_header, is_bank_account, currency, opening_balance)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              tenantId, acc.account_code, acc.account_name, accountTypeId, parentId,
              acc.description, acc.is_header || false, acc.is_bank_account || false,
              acc.currency || 'INR', acc.opening_balance || 0
            ]
          );
          results.created++;
        }
      } catch (e) {
        results.errors.push({ account_code: acc.account_code, error: e.message });
      }
    }

    await client.query('COMMIT');

    return results;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================
// CSV/PDF EXPORT DATA
// ============================================

async function getAccountsForCSV(tenantId) {
  const r = await query(
    'SELECT a.account_code, a.account_name, t.name as account_type, t.category, a.description, a.is_active FROM acc_accounts a LEFT JOIN acc_account_types t ON a.account_type_id = t.id WHERE a.tenant_id = $1 ORDER BY a.account_code',
    [tenantId]
  );
  return r.rows;
}

async function getAccountsForPDF(tenantId) {
  const r = await query(
    'SELECT a.account_code, a.account_name, t.name as account_type, t.category, a.is_active FROM acc_accounts a LEFT JOIN acc_account_types t ON a.account_type_id = t.id WHERE a.tenant_id = $1 ORDER BY a.account_code',
    [tenantId]
  );
  return r.rows;
}

module.exports = {
  listAccounts,
  getAccountById,
  getAccountByCode,
  createAccount,
  updateAccount,
  deleteAccount,
  getAccountBalance,
  getTrialBalance,
  searchAccounts,
  getPostableAccounts,
  exportAccounts,
  importAccounts,
  getAccountsForCSV,
  getAccountsForPDF
};
