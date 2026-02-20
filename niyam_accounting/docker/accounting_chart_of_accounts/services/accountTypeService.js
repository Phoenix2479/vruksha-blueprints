// Account Type Service - Business logic and DB queries for account types

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

async function listAccountTypes(tenantId) {
  const result = await query(
    `SELECT * FROM acc_account_types
     WHERE tenant_id = $1
     ORDER BY display_order, name`,
    [tenantId]
  );
  return result.rows;
}

async function createAccountType(tenantId, data) {
  const { code, name, category, normal_balance, description, display_order } = data;

  const result = await query(
    `INSERT INTO acc_account_types
     (tenant_id, code, name, category, normal_balance, description, display_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [tenantId, code, name, category, normal_balance, description, display_order || 0]
  );

  await publishEnvelope('accounting.chart_of_accounts.account_type.created.v1', 1, {
    account_type_id: result.rows[0].id,
    code,
    name
  });

  return result.rows[0];
}

module.exports = {
  listAccountTypes,
  createAccountType
};
