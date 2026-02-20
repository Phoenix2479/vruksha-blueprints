// NATS event consumer for order processing
// Subscribes to checkout.completed events to auto-create orders

const nats = require('nats');
const { query } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');
const { v4: uuidv4 } = require('uuid');

let connection = null;

async function start() {
  const url = process.env.NATS_URL || 'nats://127.0.0.1:4222';
  try {
    connection = await nats.connect({ servers: url });
    console.log('Order Processing: Connected to NATS at', url);

    const sc = nats.StringCodec();

    // Subscribe to checkout.completed events
    const checkoutSub = connection.subscribe('ecommerce.checkout.completed.v1');
    (async () => {
      for await (const msg of checkoutSub) {
        try {
          const envelope = JSON.parse(sc.decode(msg.data));
          const data = envelope.payload || envelope;
          await onCheckoutCompleted(data);
        } catch (err) {
          console.error('Order Processing: Error processing checkout.completed:', err.message);
        }
      }
    })();

    console.log('Order Processing: Subscribed to ecommerce.checkout.completed.v1');
  } catch (err) {
    console.error('Order Processing: Failed to connect to NATS:', err.message);
  }
}

async function onCheckoutCompleted(data) {
  const tenantId = data.tenantId || data.tenant_id;
  if (!tenantId) return;

  const checkoutId = data.checkout_id;
  const customerId = data.customer_id || null;
  const items = data.items || data.line_items || [];
  const subtotal = parseFloat(data.subtotal) || 0;
  const tax = parseFloat(data.tax) || 0;
  const shipping = parseFloat(data.shipping_cost) || 0;
  const total = parseFloat(data.total) || subtotal + tax + shipping;
  const shippingAddress = JSON.stringify(data.shipping_address || {});
  const billingAddress = JSON.stringify(data.billing_address || {});

  // Check if order already exists for this checkout
  const existing = await query(
    'SELECT id FROM orders WHERE tenant_id = $1 AND checkout_id = $2',
    [tenantId, checkoutId]
  );

  if (existing.rows.length > 0) {
    console.log(`Order Processing: Order already exists for checkout ${checkoutId}`);
    return;
  }

  const orderId = uuidv4();

  await query(
    `INSERT INTO orders
     (id, tenant_id, checkout_id, customer_id, status, subtotal, tax, shipping_cost, total,
      shipping_address, billing_address, item_count, created_at)
     VALUES ($1, $2, $3, $4, 'confirmed', $5, $6, $7, $8, $9, $10, $11, NOW())`,
    [orderId, tenantId, checkoutId, customerId, subtotal, tax, shipping, total,
     shippingAddress, billingAddress, items.length]
  );

  // Insert order items
  for (const item of items) {
    await query(
      `INSERT INTO order_items
       (id, tenant_id, order_id, product_id, variant_id, quantity, unit_price, total_price)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [uuidv4(), tenantId, orderId, item.product_id, item.variant_id || null,
       item.quantity || 1, parseFloat(item.unit_price) || 0,
       parseFloat(item.total_price || item.line_total) || 0]
    );
  }

  // Publish order.created event
  try {
    await publishEnvelope('ecommerce.order.created.v1', 1, {
      order_id: orderId,
      tenant_id: tenantId,
      customer_id: customerId,
      checkout_id: checkoutId,
      total,
      item_count: items.length,
      items,
      timestamp: new Date().toISOString()
    });
  } catch (_) { /* non-fatal */ }

  console.log(`Order Processing: Created order ${orderId} from checkout ${checkoutId}`);
}

async function stop() {
  if (connection) {
    await connection.drain();
    connection = null;
    console.log('Order Processing: NATS connection closed');
  }
}

module.exports = { start, stop };
