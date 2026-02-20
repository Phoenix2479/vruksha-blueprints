// Return request business logic

const { query, getClient } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');
const { v4: uuidv4 } = require('uuid');

async function listReturns(tenantId, { status, customer_id, order_id, page = 1, limit = 20 }) {
  const conditions = ['r.tenant_id = $1'];
  const params = [tenantId];
  let idx = 2;

  if (status) { conditions.push(`r.status = $${idx}`); params.push(status); idx++; }
  if (customer_id) { conditions.push(`r.customer_id = $${idx}`); params.push(customer_id); idx++; }
  if (order_id) { conditions.push(`r.order_id = $${idx}`); params.push(order_id); idx++; }

  const where = conditions.join(' AND ');
  const offset = (page - 1) * limit;

  const [data, countRes] = await Promise.all([
    query(
      `SELECT r.* FROM returns r WHERE ${where} ORDER BY r.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*) as total FROM returns r WHERE ${where}`, params)
  ]);

  return {
    returns: data.rows,
    pagination: { page, limit, total: parseInt(countRes.rows[0].total) }
  };
}

async function getReturn(tenantId, returnId) {
  const result = await query(
    'SELECT * FROM returns WHERE tenant_id = $1 AND id = $2',
    [tenantId, returnId]
  );
  if (result.rows.length === 0) return null;

  const items = await query(
    'SELECT * FROM return_items WHERE tenant_id = $1 AND return_id = $2 ORDER BY created_at',
    [tenantId, returnId]
  );

  const exchanges = await query(
    'SELECT * FROM exchanges WHERE tenant_id = $1 AND return_id = $2 ORDER BY created_at',
    [tenantId, returnId]
  );

  return { ...result.rows[0], items: items.rows, exchanges: exchanges.rows };
}

async function createReturn(tenantId, data) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const returnId = uuidv4();
    const refundAmount = data.items
      ? data.items.reduce((sum, i) => sum + (parseFloat(i.unit_price) || 0) * (i.quantity || 1), 0)
      : parseFloat(data.refund_amount) || 0;

    const result = await client.query(
      `INSERT INTO returns (id, tenant_id, order_id, customer_id, status, reason, reason_category, refund_amount, refund_method, notes)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, $9)
       RETURNING *`,
      [returnId, tenantId, data.order_id, data.customer_id || null,
       data.reason, data.reason_category || null, refundAmount,
       data.refund_method || 'original_payment', data.notes || null]
    );

    // Insert return items
    if (data.items && data.items.length > 0) {
      for (const item of data.items) {
        await client.query(
          `INSERT INTO return_items (id, tenant_id, return_id, product_id, variant_id, quantity, unit_price, reason, condition)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [uuidv4(), tenantId, returnId, item.product_id, item.variant_id || null,
           item.quantity || 1, parseFloat(item.unit_price) || 0,
           item.reason || null, item.condition || 'unopened']
        );
      }
    }

    await client.query('COMMIT');

    try {
      await publishEnvelope('ecommerce.return.created.v1', 1, {
        return_id: returnId,
        tenant_id: tenantId,
        order_id: data.order_id,
        customer_id: data.customer_id,
        refund_amount: refundAmount,
        item_count: (data.items || []).length,
        timestamp: new Date().toISOString()
      });
    } catch (_) { /* non-fatal */ }

    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateReturnStatus(tenantId, returnId, status, userId) {
  const validTransitions = {
    pending: ['approved', 'rejected'],
    approved: ['processing', 'completed', 'cancelled'],
    processing: ['completed', 'cancelled'],
    rejected: [],
    completed: [],
    cancelled: []
  };

  const current = await query(
    'SELECT status FROM returns WHERE tenant_id = $1 AND id = $2',
    [tenantId, returnId]
  );

  if (current.rows.length === 0) return null;

  const currentStatus = current.rows[0].status;
  if (!validTransitions[currentStatus]?.includes(status)) {
    throw Object.assign(new Error(`Cannot transition from ${currentStatus} to ${status}`), { status: 400 });
  }

  const updates = ['status = $3', 'updated_at = NOW()'];
  const params = [tenantId, returnId, status];

  if (status === 'approved') {
    updates.push('approved_at = NOW()', `approved_by = $${params.length + 1}`);
    params.push(userId);
  }
  if (status === 'completed') {
    updates.push('completed_at = NOW()');
  }

  const result = await query(
    `UPDATE returns SET ${updates.join(', ')} WHERE tenant_id = $1 AND id = $2 RETURNING *`,
    params
  );

  const eventSubject = status === 'approved'
    ? 'ecommerce.return.approved.v1'
    : status === 'completed'
      ? 'ecommerce.return.completed.v1'
      : null;

  if (eventSubject) {
    try {
      await publishEnvelope(eventSubject, 1, {
        return_id: returnId,
        tenant_id: tenantId,
        status,
        timestamp: new Date().toISOString()
      });
    } catch (_) { /* non-fatal */ }
  }

  return result.rows[0];
}

module.exports = { listReturns, getReturn, createReturn, updateReturnStatus };
