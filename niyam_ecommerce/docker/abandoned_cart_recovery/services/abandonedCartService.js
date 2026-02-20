// Abandoned cart business logic service

const { query } = require('@vruksha/platform/db/postgres');

async function listAbandonedCarts(tenantId, { status, customer_id, from_date, to_date, min_total, limit = 100, offset = 0 } = {}) {
  let sql = 'SELECT * FROM abandoned_carts WHERE tenant_id = $1';
  const params = [tenantId];
  let idx = 2;

  if (status) {
    sql += ` AND recovery_status = $${idx++}`;
    params.push(status);
  }
  if (customer_id) {
    sql += ` AND customer_id = $${idx++}`;
    params.push(customer_id);
  }
  if (from_date) {
    sql += ` AND abandoned_at >= $${idx++}`;
    params.push(from_date);
  }
  if (to_date) {
    sql += ` AND abandoned_at <= $${idx++}`;
    params.push(to_date);
  }
  if (min_total) {
    sql += ` AND cart_total >= $${idx++}`;
    params.push(parseFloat(min_total));
  }

  sql += ` ORDER BY abandoned_at DESC LIMIT $${idx++} OFFSET $${idx}`;
  params.push(parseInt(limit), parseInt(offset));

  const result = await query(sql, params);
  return result.rows;
}

async function getAbandonedCart(id, tenantId) {
  const result = await query(
    'SELECT * FROM abandoned_carts WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  return result.rows[0] || null;
}

async function createAbandonedCart(tenantId, data) {
  const { cart_id, customer_id, customer_email, cart_total, items_count, cart_items, abandoned_at } = data;

  const result = await query(
    `INSERT INTO abandoned_carts (tenant_id, cart_id, customer_id, customer_email, cart_total, items_count, cart_items, abandoned_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      tenantId,
      cart_id,
      customer_id || null,
      customer_email || null,
      cart_total || 0,
      items_count || 0,
      JSON.stringify(cart_items || []),
      abandoned_at || new Date().toISOString()
    ]
  );

  return result.rows[0];
}

async function markRecovered(id, tenantId, orderId) {
  const result = await query(
    `UPDATE abandoned_carts SET recovery_status = 'recovered', recovered_at = NOW(), recovered_order_id = $1, updated_at = NOW()
     WHERE id = $2 AND tenant_id = $3 RETURNING *`,
    [orderId, id, tenantId]
  );
  return result.rows[0] || null;
}

async function getStats(tenantId, { from_date, to_date } = {}) {
  let dateFilter = '';
  const params = [tenantId];
  let idx = 2;

  if (from_date) {
    dateFilter += ` AND abandoned_at >= $${idx++}`;
    params.push(from_date);
  }
  if (to_date) {
    dateFilter += ` AND abandoned_at <= $${idx++}`;
    params.push(to_date);
  }

  // Overall abandoned cart stats
  const statsResult = await query(
    `SELECT
       COUNT(*) as total_abandoned,
       COUNT(*) FILTER (WHERE recovery_status = 'recovered') as total_recovered,
       COUNT(*) FILTER (WHERE recovery_status = 'pending') as total_pending,
       COUNT(*) FILTER (WHERE recovery_status = 'attempted') as total_attempted,
       COALESCE(SUM(cart_total), 0) as total_abandoned_value,
       COALESCE(SUM(cart_total) FILTER (WHERE recovery_status = 'recovered'), 0) as total_recovered_value,
       COALESCE(AVG(cart_total), 0) as avg_cart_value
     FROM abandoned_carts WHERE tenant_id = $1${dateFilter}`,
    params
  );

  const stats = statsResult.rows[0];
  const totalAbandoned = parseInt(stats.total_abandoned || 0);
  const totalRecovered = parseInt(stats.total_recovered || 0);

  // Recovery attempts stats
  const attemptParams = [tenantId];
  let attemptDateFilter = '';
  let aidx = 2;
  if (from_date) {
    attemptDateFilter += ` AND ra.sent_at >= $${aidx++}`;
    attemptParams.push(from_date);
  }
  if (to_date) {
    attemptDateFilter += ` AND ra.sent_at <= $${aidx++}`;
    attemptParams.push(to_date);
  }

  const attemptStats = await query(
    `SELECT
       COUNT(*) as total_attempts,
       COUNT(*) FILTER (WHERE ra.status = 'converted') as converted_attempts,
       COUNT(*) FILTER (WHERE ra.opened_at IS NOT NULL) as opened_attempts,
       COUNT(*) FILTER (WHERE ra.clicked_at IS NOT NULL) as clicked_attempts
     FROM recovery_attempts ra WHERE ra.tenant_id = $1${attemptDateFilter}`,
    attemptParams
  );

  const attempts = attemptStats.rows[0];
  const totalAttempts = parseInt(attempts.total_attempts || 0);
  const convertedAttempts = parseInt(attempts.converted_attempts || 0);

  return {
    total_abandoned: totalAbandoned,
    total_recovered: totalRecovered,
    total_pending: parseInt(stats.total_pending || 0),
    total_attempted: parseInt(stats.total_attempted || 0),
    recovery_rate: totalAbandoned > 0 ? Math.round((totalRecovered / totalAbandoned) * 100 * 100) / 100 : 0,
    total_abandoned_value: parseFloat(stats.total_abandoned_value || 0),
    total_recovered_value: parseFloat(stats.total_recovered_value || 0),
    avg_cart_value: Math.round(parseFloat(stats.avg_cart_value || 0) * 100) / 100,
    total_attempts: totalAttempts,
    conversion_rate: totalAttempts > 0 ? Math.round((convertedAttempts / totalAttempts) * 100 * 100) / 100 : 0,
    open_rate: totalAttempts > 0 ? Math.round((parseInt(attempts.opened_attempts || 0) / totalAttempts) * 100 * 100) / 100 : 0,
    click_rate: totalAttempts > 0 ? Math.round((parseInt(attempts.clicked_attempts || 0) / totalAttempts) * 100 * 100) / 100 : 0
  };
}

module.exports = {
  listAbandonedCarts,
  getAbandonedCart,
  createAbandonedCart,
  markRecovered,
  getStats
};
