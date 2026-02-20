// Fulfillment business logic service

const { query, getClient } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');

async function listFulfillments(tenantId, orderId) {
  const result = await query(
    'SELECT * FROM fulfillments WHERE order_id = $1 AND tenant_id = $2 ORDER BY created_at DESC',
    [orderId, tenantId]
  );
  return result.rows;
}

async function createFulfillment(tenantId, data) {
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

    if (order.status === 'cancelled') {
      await client.query('ROLLBACK');
      return { success: false, error: 'Cannot fulfill a cancelled order' };
    }

    const trackingNumber = data.tracking_number || `TRK-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    const result = await client.query(
      `INSERT INTO fulfillments (
        tenant_id, order_id, tracking_number, carrier, items, status, shipped_at, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        tenantId, data.order_id, trackingNumber, data.carrier || null,
        JSON.stringify(data.items || []), 'shipped', new Date().toISOString(),
        data.notes || null
      ]
    );

    const fulfillment = result.rows[0];

    // Update order fulfillment status
    // Check if all items are now fulfilled
    const allFulfillments = await client.query(
      'SELECT items FROM fulfillments WHERE order_id = $1 AND tenant_id = $2',
      [data.order_id, tenantId]
    );

    let totalFulfilledItems = 0;
    for (const f of allFulfillments.rows) {
      const fItems = typeof f.items === 'string' ? JSON.parse(f.items) : (f.items || []);
      totalFulfilledItems += fItems.reduce((sum, i) => sum + (i.quantity || 1), 0);
    }

    const orderItems = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
    const totalOrderItems = orderItems.reduce((sum, i) => sum + (i.quantity || 1), 0);

    const fulfillmentStatus = totalFulfilledItems >= totalOrderItems ? 'fulfilled' : 'partial';

    await client.query(
      'UPDATE orders SET fulfillment_status = $1, status = CASE WHEN status = \'processing\' OR status = \'confirmed\' THEN \'shipped\' ELSE status END, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
      [fulfillmentStatus, data.order_id, tenantId]
    );

    await client.query('COMMIT');

    // Publish event
    try {
      await publishEnvelope('ecommerce.order.fulfilled.v1', 1, {
        order_id: data.order_id,
        fulfillment_id: fulfillment.id,
        tracking_number: trackingNumber,
        carrier: data.carrier,
        fulfillment_status: fulfillmentStatus,
        timestamp: new Date().toISOString()
      });
    } catch (_) { /* non-fatal */ }

    return { success: true, fulfillment };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateFulfillmentStatus(tenantId, fulfillmentId, status) {
  const validStatuses = ['pending', 'shipped', 'in_transit', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return { success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` };
  }

  const deliveredAt = status === 'delivered' ? new Date().toISOString() : null;

  const result = await query(
    `UPDATE fulfillments SET status = $1, delivered_at = COALESCE($2::timestamptz, delivered_at), updated_at = NOW()
     WHERE id = $3 AND tenant_id = $4 RETURNING *`,
    [status, deliveredAt, fulfillmentId, tenantId]
  );

  if (result.rows.length === 0) {
    return { success: false, error: 'Fulfillment not found' };
  }

  // If delivered, check if order should be marked delivered
  if (status === 'delivered') {
    const fulfillment = result.rows[0];
    const pendingResult = await query(
      'SELECT COUNT(*) as cnt FROM fulfillments WHERE order_id = $1 AND tenant_id = $2 AND status != \'delivered\' AND status != \'cancelled\'',
      [fulfillment.order_id, tenantId]
    );
    if (parseInt(pendingResult.rows[0].cnt) === 0) {
      await query(
        'UPDATE orders SET status = \'delivered\', updated_at = NOW() WHERE id = $1 AND tenant_id = $2',
        [fulfillment.order_id, tenantId]
      );
    }
  }

  return { success: true, fulfillment: result.rows[0] };
}

module.exports = {
  listFulfillments,
  createFulfillment,
  updateFulfillmentStatus
};
