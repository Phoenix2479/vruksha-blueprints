// NATS event consumer for inventory sync
// Subscribes to order events to reserve stock automatically

const nats = require('nats');
const { query, getClient } = require('@vruksha/platform/db/postgres');

let connection = null;

async function start() {
  const url = process.env.NATS_URL || 'nats://127.0.0.1:4222';
  try {
    connection = await nats.connect({ servers: url });
    console.log('Inventory Sync: Connected to NATS at', url);

    const sc = nats.StringCodec();

    // Subscribe to order.created events - reserve stock for order items
    const orderSub = connection.subscribe('ecommerce.order.created.v1');
    (async () => {
      for await (const msg of orderSub) {
        try {
          const envelope = JSON.parse(sc.decode(msg.data));
          const data = envelope.payload || envelope;
          await onOrderCreated(data);
        } catch (err) {
          console.error('Inventory Sync: Error processing order.created:', err.message);
        }
      }
    })();

    console.log('Inventory Sync: Subscribed to ecommerce.order.created.v1');
  } catch (err) {
    console.error('Inventory Sync: Failed to connect to NATS:', err.message);
  }
}

async function onOrderCreated(data) {
  const tenantId = data.tenantId || data.tenant_id;
  if (!tenantId) return;

  const items = data.items || data.line_items || [];
  if (items.length === 0) return;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    for (const item of items) {
      const productId = item.product_id;
      const variantId = item.variant_id || null;
      const qty = parseInt(item.quantity) || 1;
      const location = item.location || 'default';

      // Reserve stock by incrementing the reserved column
      await client.query(
        `UPDATE stock_records
         SET reserved = reserved + $1, updated_at = NOW()
         WHERE tenant_id = $2 AND product_id = $3
           AND COALESCE(variant_id, '') = COALESCE($4, '')
           AND location = $5`,
        [qty, tenantId, productId, variantId, location]
      );
    }

    await client.query('COMMIT');
    console.log(`Inventory Sync: Reserved stock for order ${data.order_id || 'unknown'} (${items.length} items)`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Inventory Sync: Failed to reserve stock:', error.message);
  } finally {
    client.release();
  }
}

async function stop() {
  if (connection) {
    await connection.drain();
    connection = null;
    console.log('Inventory Sync: NATS connection closed');
  }
}

module.exports = { start, stop };
