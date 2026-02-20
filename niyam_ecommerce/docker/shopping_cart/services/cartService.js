// Cart business logic service

const { query } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');
const { v4: uuidv4 } = require('uuid');
const { CART_ABANDONMENT_TIMEOUT_MS } = require('../config/constants');

async function recalculateCart(cartId, tenantId) {
  // Recalculate each item's line_total and tax_amount
  await query(
    `UPDATE cart_items
     SET line_total = (quantity * unit_price) - discount_amount,
         tax_amount = ((quantity * unit_price) - discount_amount) * (tax_rate / 100),
         updated_at = NOW()
     WHERE cart_id = $1 AND tenant_id = $2`,
    [cartId, tenantId]
  );

  // Aggregate totals from items
  const totals = await query(
    `SELECT
       COALESCE(SUM(line_total), 0) as subtotal,
       COALESCE(SUM(tax_amount), 0) as tax_amount,
       COALESCE(SUM(discount_amount), 0) as discount_amount,
       COALESCE(SUM(quantity), 0) as item_count
     FROM cart_items
     WHERE cart_id = $1 AND tenant_id = $2`,
    [cartId, tenantId]
  );

  const row = totals.rows[0];
  const subtotal = parseFloat(row.subtotal);
  const taxAmount = parseFloat(row.tax_amount);
  const discountAmount = parseFloat(row.discount_amount);
  const itemCount = parseInt(row.item_count);

  // Get coupon discount
  const cart = await query(
    'SELECT coupon_discount FROM carts WHERE id = $1 AND tenant_id = $2',
    [cartId, tenantId]
  );
  const couponDiscount = cart.rows.length > 0 ? parseFloat(cart.rows[0].coupon_discount) : 0;
  const total = subtotal + taxAmount - couponDiscount;

  await query(
    `UPDATE carts
     SET subtotal = $1, tax_amount = $2, discount_amount = $3, total = $4,
         item_count = $5, last_activity_at = NOW(), updated_at = NOW()
     WHERE id = $6 AND tenant_id = $7`,
    [subtotal, taxAmount, discountAmount, Math.max(total, 0), itemCount, cartId, tenantId]
  );

  return { subtotal, tax_amount: taxAmount, discount_amount: discountAmount, coupon_discount: couponDiscount, total: Math.max(total, 0), item_count: itemCount };
}

async function createCart(tenantId, data) {
  const id = uuidv4();
  const expiresAt = new Date(Date.now() + CART_ABANDONMENT_TIMEOUT_MS).toISOString();

  const result = await query(
    `INSERT INTO carts (id, tenant_id, customer_id, session_id, currency, notes, metadata, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      id, tenantId, data.customer_id || null, data.session_id || null,
      data.currency || 'USD', data.notes || null,
      JSON.stringify(data.metadata || {}), expiresAt
    ]
  );

  return result.rows[0];
}

async function getCart(cartId, tenantId) {
  const cartResult = await query(
    'SELECT * FROM carts WHERE id = $1 AND tenant_id = $2',
    [cartId, tenantId]
  );
  if (cartResult.rows.length === 0) return null;

  const itemsResult = await query(
    `SELECT * FROM cart_items WHERE cart_id = $1 AND tenant_id = $2 ORDER BY created_at ASC`,
    [cartId, tenantId]
  );

  const cart = cartResult.rows[0];
  cart.items = itemsResult.rows;
  return cart;
}

async function getCartByCustomer(customerId, tenantId) {
  const cartResult = await query(
    `SELECT * FROM carts WHERE customer_id = $1 AND tenant_id = $2 AND status = 'active'
     ORDER BY last_activity_at DESC LIMIT 1`,
    [customerId, tenantId]
  );
  if (cartResult.rows.length === 0) return null;

  const cart = cartResult.rows[0];
  const itemsResult = await query(
    `SELECT * FROM cart_items WHERE cart_id = $1 AND tenant_id = $2 ORDER BY created_at ASC`,
    [cart.id, tenantId]
  );

  cart.items = itemsResult.rows;
  return cart;
}

async function addItem(cartId, tenantId, data) {
  // Check if item already exists in cart (same product + variant)
  let existingQuery;
  let existingParams;
  if (data.variant_id) {
    existingQuery = 'SELECT * FROM cart_items WHERE cart_id = $1 AND product_id = $2 AND variant_id = $3 AND tenant_id = $4';
    existingParams = [cartId, data.product_id, data.variant_id, tenantId];
  } else {
    existingQuery = 'SELECT * FROM cart_items WHERE cart_id = $1 AND product_id = $2 AND variant_id IS NULL AND tenant_id = $3';
    existingParams = [cartId, data.product_id, tenantId];
  }

  const existing = await query(existingQuery, existingParams);

  if (existing.rows.length > 0) {
    // Update quantity
    const newQty = existing.rows[0].quantity + (data.quantity || 1);
    await query(
      `UPDATE cart_items SET quantity = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
      [newQty, existing.rows[0].id, tenantId]
    );
  } else {
    // Add new item
    const id = uuidv4();
    const lineTotal = (data.quantity || 1) * data.unit_price;
    await query(
      `INSERT INTO cart_items (
         id, tenant_id, cart_id, product_id, variant_id, product_name, product_sku,
         product_image, quantity, unit_price, tax_rate, discount_amount, line_total, options, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        id, tenantId, cartId, data.product_id, data.variant_id || null,
        data.product_name, data.product_sku || null, data.product_image || null,
        data.quantity || 1, data.unit_price, data.tax_rate || 0,
        data.discount_amount || 0, lineTotal,
        JSON.stringify(data.options || {}), JSON.stringify(data.metadata || {})
      ]
    );
  }

  // Recalculate cart totals
  const totals = await recalculateCart(cartId, tenantId);

  try {
    await publishEnvelope('ecommerce.cart.updated.v1', 1, {
      cart_id: cartId,
      action: 'item_added',
      product_id: data.product_id,
      item_count: totals.item_count,
      total: totals.total,
      timestamp: new Date().toISOString()
    });
  } catch (_) { /* event publish failure is non-fatal */ }

  // Return updated cart
  return getCart(cartId, tenantId);
}

async function updateItemQuantity(cartId, itemId, tenantId, quantity) {
  const result = await query(
    `UPDATE cart_items SET quantity = $1, updated_at = NOW()
     WHERE id = $2 AND cart_id = $3 AND tenant_id = $4
     RETURNING *`,
    [quantity, itemId, cartId, tenantId]
  );

  if (result.rows.length === 0) return null;

  await recalculateCart(cartId, tenantId);
  return getCart(cartId, tenantId);
}

async function removeItem(cartId, itemId, tenantId) {
  const result = await query(
    'DELETE FROM cart_items WHERE id = $1 AND cart_id = $2 AND tenant_id = $3 RETURNING id',
    [itemId, cartId, tenantId]
  );

  if (result.rowCount === 0) return null;

  await recalculateCart(cartId, tenantId);
  return getCart(cartId, tenantId);
}

async function applyCoupon(cartId, tenantId, couponCode, discountAmount) {
  await query(
    `UPDATE carts SET coupon_code = $1, coupon_discount = $2, updated_at = NOW(), last_activity_at = NOW()
     WHERE id = $3 AND tenant_id = $4`,
    [couponCode, discountAmount, cartId, tenantId]
  );

  await recalculateCart(cartId, tenantId);
  return getCart(cartId, tenantId);
}

async function removeCoupon(cartId, tenantId) {
  await query(
    `UPDATE carts SET coupon_code = NULL, coupon_discount = 0, updated_at = NOW(), last_activity_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [cartId, tenantId]
  );

  await recalculateCart(cartId, tenantId);
  return getCart(cartId, tenantId);
}

async function getCartTotals(cartId, tenantId) {
  const cart = await query(
    'SELECT subtotal, tax_amount, discount_amount, coupon_code, coupon_discount, total, item_count, currency FROM carts WHERE id = $1 AND tenant_id = $2',
    [cartId, tenantId]
  );
  if (cart.rows.length === 0) return null;
  return cart.rows[0];
}

async function markAbandoned(tenantId) {
  const cutoff = new Date(Date.now() - CART_ABANDONMENT_TIMEOUT_MS).toISOString();

  const result = await query(
    `UPDATE carts SET status = 'abandoned', updated_at = NOW()
     WHERE tenant_id = $1 AND status = 'active' AND last_activity_at < $2
     RETURNING id, customer_id, total`,
    [tenantId, cutoff]
  );

  for (const cart of result.rows) {
    try {
      await publishEnvelope('ecommerce.cart.abandoned.v1', 1, {
        cart_id: cart.id,
        customer_id: cart.customer_id,
        total: cart.total,
        timestamp: new Date().toISOString()
      });
    } catch (_) { /* event publish failure is non-fatal */ }
  }

  return result.rows;
}

async function clearCart(cartId, tenantId) {
  await query(
    'DELETE FROM cart_items WHERE cart_id = $1 AND tenant_id = $2',
    [cartId, tenantId]
  );

  await query(
    `UPDATE carts SET subtotal = 0, tax_amount = 0, discount_amount = 0, total = 0,
       item_count = 0, coupon_code = NULL, coupon_discount = 0,
       last_activity_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [cartId, tenantId]
  );

  return getCart(cartId, tenantId);
}

async function deleteCart(cartId, tenantId) {
  const result = await query(
    'DELETE FROM carts WHERE id = $1 AND tenant_id = $2',
    [cartId, tenantId]
  );
  return result.rowCount > 0;
}

module.exports = {
  createCart,
  getCart,
  getCartByCustomer,
  addItem,
  updateItemQuantity,
  removeItem,
  applyCoupon,
  removeCoupon,
  getCartTotals,
  markAbandoned,
  clearCart,
  deleteCart,
  recalculateCart
};
