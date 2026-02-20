// NATS event consumer for returns management
// Subscribes to refund events to update return status

const nats = require('nats');
const { query } = require('@vruksha/platform/db/postgres');

let connection = null;

async function start() {
  const url = process.env.NATS_URL || 'nats://127.0.0.1:4222';
  try {
    connection = await nats.connect({ servers: url });
    console.log('Returns Management: Connected to NATS at', url);

    const sc = nats.StringCodec();

    // Subscribe to order.refunded events
    const refundSub = connection.subscribe('ecommerce.order.refunded.v1');
    (async () => {
      for await (const msg of refundSub) {
        try {
          const envelope = JSON.parse(sc.decode(msg.data));
          const data = envelope.payload || envelope;
          await onOrderRefunded(data);
        } catch (err) {
          console.error('Returns Management: Error processing order.refunded:', err.message);
        }
      }
    })();

    console.log('Returns Management: Subscribed to ecommerce.order.refunded.v1');
  } catch (err) {
    console.error('Returns Management: Failed to connect to NATS:', err.message);
  }
}

async function onOrderRefunded(data) {
  const tenantId = data.tenantId || data.tenant_id;
  const orderId = data.order_id;
  if (!tenantId || !orderId) return;

  // Find associated return and mark as completed
  await query(
    `UPDATE returns SET status = 'completed', completed_at = NOW(), updated_at = NOW()
     WHERE tenant_id = $1 AND order_id = $2 AND status IN ('approved', 'processing')`,
    [tenantId, orderId]
  );

  console.log(`Returns Management: Marked returns for order ${orderId} as completed (refund processed)`);
}

async function stop() {
  if (connection) {
    await connection.drain();
    connection = null;
    console.log('Returns Management: NATS connection closed');
  }
}

module.exports = { start, stop };
