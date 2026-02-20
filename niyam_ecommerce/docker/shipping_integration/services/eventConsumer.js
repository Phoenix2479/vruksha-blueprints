// NATS event consumer for shipping integration
// Subscribes to order.fulfilled events to auto-create shipment records

const nats = require('nats');
const { query } = require('@vruksha/platform/db/postgres');
const { v4: uuidv4 } = require('uuid');

let connection = null;

async function start() {
  const url = process.env.NATS_URL || 'nats://127.0.0.1:4222';
  try {
    connection = await nats.connect({ servers: url });
    console.log('Shipping Integration: Connected to NATS at', url);

    const sc = nats.StringCodec();

    // Subscribe to order.fulfilled events
    const fulfilledSub = connection.subscribe('ecommerce.order.fulfilled.v1');
    (async () => {
      for await (const msg of fulfilledSub) {
        try {
          const envelope = JSON.parse(sc.decode(msg.data));
          const data = envelope.payload || envelope;
          await onOrderFulfilled(data);
        } catch (err) {
          console.error('Shipping Integration: Error processing order.fulfilled:', err.message);
        }
      }
    })();

    console.log('Shipping Integration: Subscribed to ecommerce.order.fulfilled.v1');
  } catch (err) {
    console.error('Shipping Integration: Failed to connect to NATS:', err.message);
  }
}

async function onOrderFulfilled(data) {
  const tenantId = data.tenantId || data.tenant_id;
  if (!tenantId) return;

  const orderId = data.order_id;
  const fulfillmentId = data.fulfillment_id || null;
  const carrierId = data.carrier_id || null;
  const shippingAddress = JSON.stringify(data.shipping_address || {});
  const items = JSON.stringify(data.items || []);

  // Check if shipment already exists for this order
  const existing = await query(
    'SELECT id FROM shipments WHERE tenant_id = $1 AND order_id = $2',
    [tenantId, orderId]
  );

  if (existing.rows.length > 0) {
    console.log(`Shipping Integration: Shipment already exists for order ${orderId}`);
    return;
  }

  await query(
    `INSERT INTO shipments
     (id, tenant_id, order_id, fulfillment_id, carrier_id, status, shipping_address, items, created_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, NOW())`,
    [uuidv4(), tenantId, orderId, fulfillmentId, carrierId, shippingAddress, items]
  );

  console.log(`Shipping Integration: Created shipment for fulfilled order ${orderId}`);
}

async function stop() {
  if (connection) {
    await connection.drain();
    connection = null;
    console.log('Shipping Integration: NATS connection closed');
  }
}

module.exports = { start, stop };
