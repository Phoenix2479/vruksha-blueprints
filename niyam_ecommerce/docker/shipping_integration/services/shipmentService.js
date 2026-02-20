// Shipment management business logic service

const { query, getClient } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');

async function listShipments(tenantId, filters = {}) {
  const { order_id, carrier_id, status, limit = 100, offset = 0 } = filters;
  let sql = 'SELECT s.*, c.name as carrier_name, c.code as carrier_code FROM shipments s LEFT JOIN carriers c ON s.carrier_id = c.id WHERE s.tenant_id = $1';
  const params = [tenantId];
  let idx = 2;

  if (order_id) { sql += ` AND s.order_id = $${idx}`; params.push(order_id); idx++; }
  if (carrier_id) { sql += ` AND s.carrier_id = $${idx}`; params.push(carrier_id); idx++; }
  if (status) { sql += ` AND s.status = $${idx}`; params.push(status); idx++; }

  sql += ` ORDER BY s.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
  params.push(parseInt(limit), parseInt(offset));

  const result = await query(sql, params);
  return result.rows;
}

async function getShipment(tenantId, shipmentId) {
  const result = await query(
    `SELECT s.*, c.name as carrier_name, c.code as carrier_code
     FROM shipments s LEFT JOIN carriers c ON s.carrier_id = c.id
     WHERE s.id = $1 AND s.tenant_id = $2`,
    [shipmentId, tenantId]
  );
  return result.rows[0] || null;
}

async function createShipment(tenantId, data) {
  const trackingNumber = data.tracking_number || `TRK-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

  // Calculate estimated delivery (5 business days from now if not provided)
  const estimatedDelivery = data.estimated_delivery || new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();

  // Calculate cost if carrier is provided and weight is given
  let cost = data.cost || 0;
  if (!data.cost && data.carrier_id && data.weight) {
    const carrierResult = await query(
      'SELECT base_rate, per_kg_rate FROM carriers WHERE id = $1 AND tenant_id = $2',
      [data.carrier_id, tenantId]
    );
    if (carrierResult.rows.length > 0) {
      const carrier = carrierResult.rows[0];
      cost = parseFloat(carrier.base_rate) + (parseFloat(data.weight) * parseFloat(carrier.per_kg_rate));
    }
  }

  const result = await query(
    `INSERT INTO shipments (
      tenant_id, order_id, carrier_id, tracking_number, label_url,
      status, estimated_delivery, cost, weight, dimensions, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *`,
    [
      tenantId, data.order_id, data.carrier_id || null, trackingNumber,
      data.label_url || null, 'pending', estimatedDelivery,
      cost, data.weight || 0,
      JSON.stringify(data.dimensions || {}), JSON.stringify(data.metadata || {})
    ]
  );

  const shipment = result.rows[0];

  // Create initial tracking event
  await query(
    `INSERT INTO tracking_events (tenant_id, shipment_id, status, location, description, occurred_at)
     VALUES ($1, $2, 'created', $3, 'Shipment created', NOW())`,
    [tenantId, shipment.id, data.origin_location || 'Origin']
  );

  // Publish event
  try {
    await publishEnvelope('ecommerce.shipment.created.v1', 1, {
      shipment_id: shipment.id,
      order_id: data.order_id,
      tracking_number: trackingNumber,
      carrier_id: data.carrier_id,
      estimated_delivery: estimatedDelivery,
      timestamp: new Date().toISOString()
    });
  } catch (_) { /* non-fatal */ }

  return shipment;
}

async function updateShipmentStatus(tenantId, shipmentId, status) {
  const validStatuses = ['pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'returned', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return { success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` };
  }

  const actualDelivery = status === 'delivered' ? new Date().toISOString() : null;

  const result = await query(
    `UPDATE shipments SET status = $1, actual_delivery = COALESCE($2::timestamptz, actual_delivery), updated_at = NOW()
     WHERE id = $3 AND tenant_id = $4 RETURNING *`,
    [status, actualDelivery, shipmentId, tenantId]
  );

  if (result.rows.length === 0) {
    return { success: false, error: 'Shipment not found' };
  }

  const shipment = result.rows[0];

  // Publish delivered event
  if (status === 'delivered') {
    try {
      await publishEnvelope('ecommerce.shipment.delivered.v1', 1, {
        shipment_id: shipment.id,
        order_id: shipment.order_id,
        tracking_number: shipment.tracking_number,
        delivered_at: actualDelivery,
        timestamp: new Date().toISOString()
      });
    } catch (_) { /* non-fatal */ }
  }

  return { success: true, shipment };
}

module.exports = {
  listShipments,
  getShipment,
  createShipment,
  updateShipmentStatus
};
