// NATS event consumer for abandoned cart recovery
// Subscribes to cart.abandoned events to track abandoned carts

const nats = require('nats');
const { query } = require('@vruksha/platform/db/postgres');

let connection = null;

async function start() {
  const url = process.env.NATS_URL || 'nats://127.0.0.1:4222';
  try {
    connection = await nats.connect({ servers: url });
    console.log('Abandoned Cart Recovery: Connected to NATS at', url);

    const sc = nats.StringCodec();

    // Subscribe to cart.abandoned events
    const cartSub = connection.subscribe('ecommerce.cart.abandoned.v1');
    (async () => {
      for await (const msg of cartSub) {
        try {
          const envelope = JSON.parse(sc.decode(msg.data));
          const data = envelope.payload || envelope;
          await onCartAbandoned(data);
        } catch (err) {
          console.error('Abandoned Cart Recovery: Error processing cart.abandoned:', err.message);
        }
      }
    })();

    console.log('Abandoned Cart Recovery: Subscribed to ecommerce.cart.abandoned.v1');
  } catch (err) {
    console.error('Abandoned Cart Recovery: Failed to connect to NATS:', err.message);
  }
}

async function onCartAbandoned(data) {
  const tenantId = data.tenantId || data.tenant_id;
  if (!tenantId) return;

  const cartId = data.cart_id;
  const customerId = data.customer_id || null;
  const customerEmail = data.customer_email || data.email || null;
  const cartTotal = parseFloat(data.cart_total || data.total) || 0;
  const itemCount = parseInt(data.item_count) || 0;
  const cartItems = JSON.stringify(data.items || []);

  await query(
    `INSERT INTO abandoned_carts
     (tenant_id, cart_id, customer_id, customer_email, cart_total, item_count, cart_items, abandoned_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (tenant_id, cart_id) DO UPDATE SET
       cart_total = EXCLUDED.cart_total,
       item_count = EXCLUDED.item_count,
       cart_items = EXCLUDED.cart_items,
       abandoned_at = NOW()`,
    [tenantId, cartId, customerId, customerEmail, cartTotal, itemCount, cartItems]
  );

  console.log(`Abandoned Cart Recovery: Tracked abandoned cart ${cartId}`);
}

async function stop() {
  if (connection) {
    await connection.drain();
    connection = null;
    console.log('Abandoned Cart Recovery: NATS connection closed');
  }
}

module.exports = { start, stop };
