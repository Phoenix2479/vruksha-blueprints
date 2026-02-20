// Exchange business logic

const { query } = require('@vruksha/platform/db/postgres');
const { v4: uuidv4 } = require('uuid');

async function createExchange(tenantId, returnId, data) {
  // Verify return exists and is approved
  const ret = await query(
    'SELECT status FROM returns WHERE tenant_id = $1 AND id = $2',
    [tenantId, returnId]
  );

  if (ret.rows.length === 0) return null;
  if (!['approved', 'processing'].includes(ret.rows[0].status)) {
    throw Object.assign(
      new Error('Return must be approved before creating an exchange'),
      { status: 400 }
    );
  }

  const result = await query(
    `INSERT INTO exchanges
     (id, tenant_id, return_id, original_product_id, original_variant_id,
      new_product_id, new_variant_id, quantity, price_difference, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
     RETURNING *`,
    [uuidv4(), tenantId, returnId, data.original_product_id, data.original_variant_id || null,
     data.new_product_id, data.new_variant_id || null,
     data.quantity || 1, parseFloat(data.price_difference) || 0]
  );

  return result.rows[0];
}

async function listExchanges(tenantId, returnId) {
  const result = await query(
    'SELECT * FROM exchanges WHERE tenant_id = $1 AND return_id = $2 ORDER BY created_at',
    [tenantId, returnId]
  );
  return result.rows;
}

async function updateExchangeStatus(tenantId, exchangeId, status) {
  const result = await query(
    `UPDATE exchanges SET status = $3, updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2
     RETURNING *`,
    [tenantId, exchangeId, status]
  );
  return result.rows[0] || null;
}

module.exports = { createExchange, listExchanges, updateExchangeStatus };
