// NATS event consumer for customer accounts
// Subscribes to order events to update customer lifetime stats

const nats = require('nats');
const { query } = require('@vruksha/platform/db/postgres');

let connection = null;

async function start() {
  const url = process.env.NATS_URL || 'nats://127.0.0.1:4222';
  try {
    connection = await nats.connect({ servers: url });
    console.log('Customer Accounts: Connected to NATS at', url);

    const sc = nats.StringCodec();

    // Subscribe to order.created events
    const orderSub = connection.subscribe('ecommerce.order.created.v1');
    (async () => {
      for await (const msg of orderSub) {
        try {
          const envelope = JSON.parse(sc.decode(msg.data));
          const data = envelope.payload || envelope;
          await onOrderCreated(data);
        } catch (err) {
          console.error('Customer Accounts: Error processing order.created:', err.message);
        }
      }
    })();

    console.log('Customer Accounts: Subscribed to ecommerce.order.created.v1');
  } catch (err) {
    console.error('Customer Accounts: Failed to connect to NATS:', err.message);
  }
}

async function onOrderCreated(data) {
  const tenantId = data.tenantId || data.tenant_id;
  const customerId = data.customer_id;
  if (!tenantId || !customerId) return;

  const total = parseFloat(data.total) || 0;

  await query(
    `UPDATE customers
     SET total_spent = COALESCE(total_spent, 0) + $1,
         order_count = COALESCE(order_count, 0) + 1,
         last_order_date = NOW(),
         updated_at = NOW()
     WHERE tenant_id = $2 AND id = $3`,
    [total, tenantId, customerId]
  );

  console.log(`Customer Accounts: Updated stats for customer ${customerId} (+$${total.toFixed(2)})`);
}

async function stop() {
  if (connection) {
    await connection.drain();
    connection = null;
    console.log('Customer Accounts: NATS connection closed');
  }
}

module.exports = { start, stop };
