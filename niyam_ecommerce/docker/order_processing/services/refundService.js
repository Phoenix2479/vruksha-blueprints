// Refund business logic service

const { query, getClient } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');

async function listRefunds(tenantId, orderId) {
  const result = await query(
    'SELECT * FROM refunds WHERE order_id = $1 AND tenant_id = $2 ORDER BY created_at DESC',
    [orderId, tenantId]
  );
  return result.rows;
}

async function createRefund(tenantId, data) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Verify order exists
    const orderResult = await client.query(
      'SELECT * FROM orders WHERE id = $1 AND tenant_id = $2',
      [data.order_id, tenantId]
    );
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Order not found' };
    }

    const order = orderResult.rows[0];

    // Calculate total already refunded
    const refundedResult = await client.query(
      'SELECT COALESCE(SUM(amount), 0) as total_refunded FROM refunds WHERE order_id = $1 AND tenant_id = $2 AND status != \'rejected\'',
      [data.order_id, tenantId]
    );
    const totalRefunded = parseFloat(refundedResult.rows[0].total_refunded) || 0;
    const maxRefundable = parseFloat(order.total) - totalRefunded;

    const amount = parseFloat(data.amount);
    if (amount <= 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Refund amount must be positive' };
    }
    if (amount > maxRefundable) {
      await client.query('ROLLBACK');
      return { success: false, error: `Refund amount exceeds maximum refundable: ${maxRefundable.toFixed(2)}` };
    }

    const result = await client.query(
      `INSERT INTO refunds (
        tenant_id, order_id, amount, reason, items, status, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        tenantId, data.order_id, amount, data.reason || null,
        JSON.stringify(data.items || []), 'pending', data.notes || null
      ]
    );

    await client.query('COMMIT');

    return { success: true, refund: result.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateRefundStatus(tenantId, refundId, status) {
  const validStatuses = ['pending', 'approved', 'processed', 'rejected'];
  if (!validStatuses.includes(status)) {
    return { success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` };
  }

  const processedAt = status === 'processed' ? new Date().toISOString() : null;

  const result = await query(
    `UPDATE refunds SET status = $1, processed_at = COALESCE($2::timestamptz, processed_at), updated_at = NOW()
     WHERE id = $3 AND tenant_id = $4 RETURNING *`,
    [status, processedAt, refundId, tenantId]
  );

  if (result.rows.length === 0) {
    return { success: false, error: 'Refund not found' };
  }

  const refund = result.rows[0];

  // Notify accounting on processed
  if (status === 'processed') {
    try {
      await publishEnvelope('ecommerce.order.refunded.v1', 1, {
        order_id: refund.order_id,
        refund_id: refund.id,
        amount: refund.amount,
        reason: refund.reason,
        timestamp: new Date().toISOString()
      });
    } catch (_) { /* non-fatal */ }
  }

  return { success: true, refund };
}

module.exports = {
  listRefunds,
  createRefund,
  updateRefundStatus
};
