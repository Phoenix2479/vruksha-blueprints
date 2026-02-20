// Stock alert business logic service

const { query } = require('@vruksha/platform/db/postgres');

async function listAlerts(tenantId, filters = {}) {
  const { is_read, product_id, type, limit = 100, offset = 0 } = filters;
  let sql = 'SELECT * FROM stock_alerts WHERE tenant_id = $1';
  const params = [tenantId];
  let idx = 2;

  if (is_read !== undefined) {
    sql += ` AND is_read = $${idx}`;
    params.push(is_read === 'true' || is_read === true);
    idx++;
  }
  if (product_id) {
    sql += ` AND product_id = $${idx}`;
    params.push(product_id);
    idx++;
  }
  if (type) {
    sql += ` AND type = $${idx}`;
    params.push(type);
    idx++;
  }

  sql += ` ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
  params.push(parseInt(limit), parseInt(offset));

  const result = await query(sql, params);
  return result.rows;
}

async function markRead(tenantId, alertId) {
  const result = await query(
    'UPDATE stock_alerts SET is_read = true WHERE id = $1 AND tenant_id = $2 RETURNING *',
    [alertId, tenantId]
  );
  if (result.rows.length === 0) {
    return { success: false, error: 'Alert not found' };
  }
  return { success: true, alert: result.rows[0] };
}

async function markAllRead(tenantId) {
  const result = await query(
    'UPDATE stock_alerts SET is_read = true WHERE tenant_id = $1 AND is_read = false',
    [tenantId]
  );
  return { success: true, updated: result.rowCount };
}

module.exports = {
  listAlerts,
  markRead,
  markAllRead
};
