// Customer business logic service

const { query, getClient } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');
const { LOYALTY_TIERS } = require('../config/constants');

/**
 * Calculate loyalty tier from points
 */
function calculateLoyaltyTier(points) {
  if (points >= LOYALTY_TIERS.platinum.min) return 'platinum';
  if (points >= LOYALTY_TIERS.gold.min) return 'gold';
  if (points >= LOYALTY_TIERS.silver.min) return 'silver';
  return 'bronze';
}

/**
 * List customers with search/filter
 */
async function listCustomers(tenantId, { search, loyalty_tier, is_active, page = 1, limit = 50 }) {
  const conditions = ['c.tenant_id = $1'];
  const params = [tenantId];
  let idx = 2;

  if (search) {
    conditions.push(`(c.first_name ILIKE $${idx} OR c.last_name ILIKE $${idx} OR c.email ILIKE $${idx} OR c.phone ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx += 1;
  }

  if (loyalty_tier) {
    conditions.push(`c.loyalty_tier = $${idx}`);
    params.push(loyalty_tier);
    idx += 1;
  }

  if (is_active !== undefined) {
    conditions.push(`c.is_active = $${idx}`);
    params.push(is_active === 'true' || is_active === true);
    idx += 1;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

  const countResult = await query(
    `SELECT COUNT(*) as total FROM customers c ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].total);

  params.push(parseInt(limit), offset);
  const result = await query(
    `SELECT c.* FROM customers c ${whereClause}
     ORDER BY c.created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );

  return {
    data: result.rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total
    }
  };
}

/**
 * Get customer by ID
 */
async function getCustomer(customerId, tenantId) {
  const result = await query(
    'SELECT * FROM customers WHERE id = $1 AND tenant_id = $2',
    [customerId, tenantId]
  );
  return result.rows[0] || null;
}

/**
 * Create customer
 */
async function createCustomer(tenantId, data) {
  const { email, first_name, last_name, phone, loyalty_points = 0, tags = [], notes } = data;
  const loyalty_tier = calculateLoyaltyTier(loyalty_points);

  const result = await query(
    `INSERT INTO customers (tenant_id, email, first_name, last_name, phone, loyalty_points, loyalty_tier, tags, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [tenantId, email, first_name, last_name, phone || null, loyalty_points, loyalty_tier, JSON.stringify(tags), notes || null]
  );

  const customer = result.rows[0];

  await publishEnvelope('ecommerce.customer.created.v1', 1, {
    customer_id: customer.id,
    email: customer.email,
    first_name: customer.first_name,
    last_name: customer.last_name,
    loyalty_tier: customer.loyalty_tier,
    timestamp: new Date().toISOString()
  });

  return { success: true, data: customer };
}

/**
 * Update customer
 */
async function updateCustomer(customerId, tenantId, data) {
  const fields = [];
  const values = [];
  let idx = 1;

  const allowedFields = ['email', 'first_name', 'last_name', 'phone', 'loyalty_points', 'tags', 'notes', 'is_active', 'total_orders', 'total_spent', 'last_login_at'];

  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      if (key === 'tags') {
        fields.push(`${key} = $${idx}`);
        values.push(JSON.stringify(data[key]));
      } else {
        fields.push(`${key} = $${idx}`);
        values.push(data[key]);
      }
      idx += 1;
    }
  }

  // Auto-calculate loyalty tier when loyalty_points changes
  if (data.loyalty_points !== undefined) {
    const newTier = calculateLoyaltyTier(data.loyalty_points);
    fields.push(`loyalty_tier = $${idx}`);
    values.push(newTier);
    idx += 1;
  }

  if (fields.length === 0) {
    return { success: false, error: { code: 'ERR_NO_FIELDS', message: 'No fields to update' } };
  }

  fields.push('updated_at = NOW()');
  values.push(customerId, tenantId);

  const result = await query(
    `UPDATE customers SET ${fields.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
    values
  );

  if (result.rowCount === 0) {
    return { success: false, error: { code: 'ERR_CUSTOMER_NOT_FOUND', message: 'Customer not found' } };
  }

  const customer = result.rows[0];

  await publishEnvelope('ecommerce.customer.updated.v1', 1, {
    customer_id: customer.id,
    email: customer.email,
    loyalty_tier: customer.loyalty_tier,
    timestamp: new Date().toISOString()
  });

  return { success: true, data: customer };
}

/**
 * Deactivate customer (soft delete)
 */
async function deactivateCustomer(customerId, tenantId) {
  const result = await query(
    `UPDATE customers SET is_active = false, updated_at = NOW() WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    [customerId, tenantId]
  );

  if (result.rowCount === 0) {
    return { success: false, error: { code: 'ERR_CUSTOMER_NOT_FOUND', message: 'Customer not found' } };
  }

  return { success: true, data: result.rows[0] };
}

module.exports = {
  calculateLoyaltyTier,
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deactivateCustomer
};
