// NATS event consumer for sales analytics
// Subscribes to order and payment events to update analytics tables

const nats = require('nats');
const { query } = require('@vruksha/platform/db/postgres');

let connection = null;

async function start() {
  const url = process.env.NATS_URL || 'nats://127.0.0.1:4222';
  try {
    connection = await nats.connect({ servers: url });
    console.log('Sales Analytics: Connected to NATS at', url);

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
          console.error('Sales Analytics: Error processing order.created:', err.message);
        }
      }
    })();

    // Subscribe to payment.captured events
    const paymentSub = connection.subscribe('ecommerce.payment.captured.v1');
    (async () => {
      for await (const msg of paymentSub) {
        try {
          const envelope = JSON.parse(sc.decode(msg.data));
          const data = envelope.payload || envelope;
          await onPaymentCaptured(data);
        } catch (err) {
          console.error('Sales Analytics: Error processing payment.captured:', err.message);
        }
      }
    })();

    console.log('Sales Analytics: Subscribed to ecommerce.order.created.v1, ecommerce.payment.captured.v1');
  } catch (err) {
    console.error('Sales Analytics: Failed to connect to NATS:', err.message);
  }
}

async function onOrderCreated(data) {
  const tenantId = data.tenantId || data.tenant_id;
  if (!tenantId) return;

  const today = new Date().toISOString().slice(0, 10);

  await query(
    `INSERT INTO daily_sales (tenant_id, date, total_orders, total_items_sold)
     VALUES ($1, $2, 1, $3)
     ON CONFLICT (tenant_id, date) DO UPDATE SET
       total_orders = daily_sales.total_orders + 1,
       total_items_sold = daily_sales.total_items_sold + EXCLUDED.total_items_sold`,
    [tenantId, today, data.item_count || 0]
  );
}

async function onPaymentCaptured(data) {
  const tenantId = data.tenantId || data.tenant_id;
  if (!tenantId) return;

  const today = new Date().toISOString().slice(0, 10);
  const amount = parseFloat(data.amount) || 0;

  await query(
    `INSERT INTO daily_sales (tenant_id, date, total_revenue, net_revenue)
     VALUES ($1, $2, $3, $3)
     ON CONFLICT (tenant_id, date) DO UPDATE SET
       total_revenue = daily_sales.total_revenue + EXCLUDED.total_revenue,
       net_revenue = daily_sales.net_revenue + EXCLUDED.net_revenue,
       avg_order_value = CASE
         WHEN daily_sales.total_orders > 0
         THEN (daily_sales.total_revenue + EXCLUDED.total_revenue) / daily_sales.total_orders
         ELSE 0
       END`,
    [tenantId, today, amount]
  );
}

async function stop() {
  if (connection) {
    await connection.drain();
    connection = null;
    console.log('Sales Analytics: NATS connection closed');
  }
}

module.exports = { start, stop };
