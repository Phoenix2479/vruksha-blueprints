// Order management business logic service

const { query, getClient } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');

async function listOrders(tenantId, filters = {}) {
  const { status, customer_id, payment_status, fulfillment_status, limit = 100, offset = 0 } = filters;
  let sql = 'SELECT * FROM orders WHERE tenant_id = $1';
  const params = [tenantId];
  let idx = 2;

  if (status) {
    sql += ` AND status = $${idx}`;
    params.push(status);
    idx++;
  }
  if (customer_id) {
    sql += ` AND customer_id = $${idx}`;
    params.push(customer_id);
    idx++;
  }
  if (payment_status) {
    sql += ` AND payment_status = $${idx}`;
    params.push(payment_status);
    idx++;
  }
  if (fulfillment_status) {
    sql += ` AND fulfillment_status = $${idx}`;
    params.push(fulfillment_status);
    idx++;
  }

  sql += ` ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
  params.push(parseInt(limit), parseInt(offset));

  const result = await query(sql, params);
  return result.rows;
}

async function getOrder(tenantId, orderId) {
  const orderResult = await query(
    'SELECT * FROM orders WHERE id = $1 AND tenant_id = $2',
    [orderId, tenantId]
  );
  if (orderResult.rows.length === 0) return null;

  const order = orderResult.rows[0];

  const itemsResult = await query(
    'SELECT * FROM order_items WHERE order_id = $1 AND tenant_id = $2 ORDER BY created_at ASC',
    [orderId, tenantId]
  );

  const fulfillmentsResult = await query(
    'SELECT * FROM fulfillments WHERE order_id = $1 AND tenant_id = $2 ORDER BY created_at DESC',
    [orderId, tenantId]
  );

  const refundsResult = await query(
    'SELECT * FROM refunds WHERE order_id = $1 AND tenant_id = $2 ORDER BY created_at DESC',
    [orderId, tenantId]
  );

  return {
    ...order,
    line_items: itemsResult.rows,
    fulfillments: fulfillmentsResult.rows,
    refunds: refundsResult.rows
  };
}

async function createOrder(tenantId, data) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    const subtotal = (data.items || []).reduce((sum, item) => {
      return sum + (item.quantity || 1) * (item.unit_price || 0);
    }, 0);
    const discount = parseFloat(data.discount) || 0;
    const shippingCost = parseFloat(data.shipping_cost) || 0;
    const tax = parseFloat(data.tax) || 0;
    const total = subtotal - discount + shippingCost + tax;

    const orderResult = await client.query(
      `INSERT INTO orders (
        tenant_id, order_number, customer_id, items, subtotal, discount,
        shipping_cost, tax, total, status, payment_status, fulfillment_status,
        shipping_address, billing_address, notes, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        tenantId, orderNumber, data.customer_id || null,
        JSON.stringify(data.items || []), subtotal, discount,
        shippingCost, tax, total, 'pending', 'unpaid', 'unfulfilled',
        JSON.stringify(data.shipping_address || {}),
        JSON.stringify(data.billing_address || {}),
        data.notes || null, JSON.stringify(data.metadata || {})
      ]
    );

    const order = orderResult.rows[0];

    // Insert order items
    for (const item of (data.items || [])) {
      const itemTotal = (item.quantity || 1) * (item.unit_price || 0);
      await client.query(
        `INSERT INTO order_items (
          tenant_id, order_id, product_id, variant_id, sku, name, quantity, unit_price, total, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          tenantId, order.id, item.product_id || null, item.variant_id || null,
          item.sku || null, item.name || 'Unknown Item', item.quantity || 1,
          item.unit_price || 0, itemTotal, JSON.stringify(item.metadata || {})
        ]
      );
    }

    await client.query('COMMIT');

    // Publish event
    try {
      await publishEnvelope('ecommerce.order.created.v1', 1, {
        order_id: order.id,
        order_number: orderNumber,
        customer_id: data.customer_id,
        total,
        item_count: (data.items || []).length,
        timestamp: new Date().toISOString()
      });
    } catch (_) { /* event publish failure is non-fatal */ }

    return order;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateOrderStatus(tenantId, orderId, status) {
  const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return { success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` };
  }

  const existing = await query(
    'SELECT * FROM orders WHERE id = $1 AND tenant_id = $2',
    [orderId, tenantId]
  );

  if (existing.rows.length === 0) {
    return { success: false, error: 'Order not found' };
  }

  const order = existing.rows[0];

  // Cancelled orders cannot transition
  if (order.status === 'cancelled' && status !== 'cancelled') {
    return { success: false, error: 'Cannot change status of a cancelled order' };
  }

  // Delivered orders can only be cancelled
  if (order.status === 'delivered' && status !== 'cancelled') {
    return { success: false, error: 'Delivered orders can only be cancelled' };
  }

  const result = await query(
    'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3 RETURNING *',
    [status, orderId, tenantId]
  );

  const updated = result.rows[0];

  // Notify accounting on confirmed
  if (status === 'confirmed') {
    try {
      await publishEnvelope('ecommerce.sale.completed', 1, {
        order_id: updated.id,
        order_number: updated.order_number,
        customer_id: updated.customer_id,
        total: updated.total,
        tax: updated.tax,
        timestamp: new Date().toISOString()
      });
    } catch (_) { /* non-fatal */ }
  }

  return { success: true, order: updated };
}

module.exports = {
  listOrders,
  getOrder,
  createOrder,
  updateOrderStatus
};
