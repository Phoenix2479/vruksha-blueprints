// Tracking event business logic service

const { query } = require('@vruksha/platform/db/postgres');

async function getTimeline(tenantId, shipmentId) {
  const result = await query(
    'SELECT * FROM tracking_events WHERE shipment_id = $1 AND tenant_id = $2 ORDER BY occurred_at ASC',
    [shipmentId, tenantId]
  );
  return result.rows;
}

async function addEvent(tenantId, data) {
  // Verify shipment exists
  const shipmentResult = await query(
    'SELECT id FROM shipments WHERE id = $1 AND tenant_id = $2',
    [data.shipment_id, tenantId]
  );
  if (shipmentResult.rows.length === 0) {
    return { success: false, error: 'Shipment not found' };
  }

  const result = await query(
    `INSERT INTO tracking_events (tenant_id, shipment_id, status, location, description, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      tenantId, data.shipment_id, data.status,
      data.location || null, data.description || null,
      data.occurred_at || new Date().toISOString()
    ]
  );

  // Update shipment status to match latest tracking event
  await query(
    'UPDATE shipments SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
    [data.status, data.shipment_id, tenantId]
  );

  return { success: true, event: result.rows[0] };
}

async function getByTracking(tenantId, trackingNumber) {
  const shipmentResult = await query(
    'SELECT * FROM shipments WHERE tracking_number = $1 AND tenant_id = $2',
    [trackingNumber, tenantId]
  );

  if (shipmentResult.rows.length === 0) {
    return null;
  }

  const shipment = shipmentResult.rows[0];
  const events = await query(
    'SELECT * FROM tracking_events WHERE shipment_id = $1 AND tenant_id = $2 ORDER BY occurred_at ASC',
    [shipment.id, tenantId]
  );

  return {
    shipment,
    events: events.rows
  };
}

module.exports = {
  getTimeline,
  addEvent,
  getByTracking
};
