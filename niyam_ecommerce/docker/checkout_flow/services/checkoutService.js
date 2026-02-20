// Checkout business logic service

const { query } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');
const { v4: uuidv4 } = require('uuid');

// Checkout session expiry: 30 minutes
const CHECKOUT_EXPIRY_MS = parseInt(process.env.CHECKOUT_EXPIRY_MS) || 30 * 60 * 1000;

// Step ordering for validation
const STEP_ORDER = ['address', 'shipping', 'payment', 'confirm', 'completed'];

function canAdvanceTo(currentStep, targetStep) {
  const currentIdx = STEP_ORDER.indexOf(currentStep);
  const targetIdx = STEP_ORDER.indexOf(targetStep);
  return targetIdx === currentIdx + 1;
}

async function initCheckout(tenantId, data) {
  const id = uuidv4();
  const expiresAt = new Date(Date.now() + CHECKOUT_EXPIRY_MS).toISOString();

  const result = await query(
    `INSERT INTO checkout_sessions (
       id, tenant_id, cart_id, customer_id, customer_email,
       subtotal, tax_amount, discount_amount, total, currency,
       cart_snapshot, notes, metadata, expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      id, tenantId, data.cart_id, data.customer_id || null,
      data.customer_email || null,
      data.subtotal || 0, data.tax_amount || 0,
      data.discount_amount || 0, data.total || 0,
      data.currency || 'USD',
      JSON.stringify(data.cart_items || []),
      data.notes || null, JSON.stringify(data.metadata || {}),
      expiresAt
    ]
  );

  return result.rows[0];
}

async function getCheckout(sessionId, tenantId) {
  const result = await query(
    'SELECT * FROM checkout_sessions WHERE id = $1 AND tenant_id = $2',
    [sessionId, tenantId]
  );
  if (result.rows.length === 0) return null;

  const session = result.rows[0];

  // Check if expired
  if (session.status === 'pending' && session.expires_at && new Date(session.expires_at) < new Date()) {
    await query(
      "UPDATE checkout_sessions SET status = 'expired', updated_at = NOW() WHERE id = $1 AND tenant_id = $2",
      [sessionId, tenantId]
    );
    session.status = 'expired';
  }

  return session;
}

async function setAddress(sessionId, tenantId, data) {
  const session = await getCheckout(sessionId, tenantId);
  if (!session) return null;
  if (session.status !== 'pending') return { error: 'Checkout session is not active' };
  if (session.current_step !== 'address') return { error: 'Cannot set address at current step' };

  const billingFields = data.billing_same_as_shipping !== false ? {
    billing_address_line1: data.shipping_address_line1,
    billing_address_line2: data.shipping_address_line2 || null,
    billing_city: data.shipping_city,
    billing_state: data.shipping_state,
    billing_postal_code: data.shipping_postal_code,
    billing_country: data.shipping_country,
  } : {
    billing_address_line1: data.billing_address_line1,
    billing_address_line2: data.billing_address_line2 || null,
    billing_city: data.billing_city,
    billing_state: data.billing_state,
    billing_postal_code: data.billing_postal_code,
    billing_country: data.billing_country,
  };

  const result = await query(
    `UPDATE checkout_sessions SET
       shipping_name = $1, shipping_address_line1 = $2, shipping_address_line2 = $3,
       shipping_city = $4, shipping_state = $5, shipping_postal_code = $6,
       shipping_country = $7, shipping_phone = $8,
       billing_address_line1 = $9, billing_address_line2 = $10,
       billing_city = $11, billing_state = $12, billing_postal_code = $13,
       billing_country = $14, billing_same_as_shipping = $15,
       current_step = 'shipping', updated_at = NOW()
     WHERE id = $16 AND tenant_id = $17
     RETURNING *`,
    [
      data.shipping_name, data.shipping_address_line1, data.shipping_address_line2 || null,
      data.shipping_city, data.shipping_state, data.shipping_postal_code,
      data.shipping_country, data.shipping_phone || null,
      billingFields.billing_address_line1, billingFields.billing_address_line2,
      billingFields.billing_city, billingFields.billing_state,
      billingFields.billing_postal_code, billingFields.billing_country,
      data.billing_same_as_shipping !== false,
      sessionId, tenantId
    ]
  );

  return result.rows[0];
}

async function setShipping(sessionId, tenantId, data) {
  const session = await getCheckout(sessionId, tenantId);
  if (!session) return null;
  if (session.status !== 'pending') return { error: 'Checkout session is not active' };
  if (session.current_step !== 'shipping') return { error: 'Cannot set shipping at current step' };

  // Recalculate total with shipping cost
  const newTotal = parseFloat(session.subtotal) + parseFloat(session.tax_amount) - parseFloat(session.discount_amount) + data.shipping_cost;

  const result = await query(
    `UPDATE checkout_sessions SET
       shipping_method = $1, shipping_carrier = $2, shipping_cost = $3,
       estimated_delivery_date = $4, total = $5,
       current_step = 'payment', updated_at = NOW()
     WHERE id = $6 AND tenant_id = $7
     RETURNING *`,
    [
      data.shipping_method, data.shipping_carrier || null,
      data.shipping_cost, data.estimated_delivery_date || null,
      Math.max(newTotal, 0),
      sessionId, tenantId
    ]
  );

  return result.rows[0];
}

async function setPayment(sessionId, tenantId, data) {
  const session = await getCheckout(sessionId, tenantId);
  if (!session) return null;
  if (session.status !== 'pending') return { error: 'Checkout session is not active' };
  if (session.current_step !== 'payment') return { error: 'Cannot set payment at current step' };

  const result = await query(
    `UPDATE checkout_sessions SET
       payment_method = $1, payment_reference = $2,
       payment_status = 'authorized', payment_amount = $3,
       current_step = 'confirm', updated_at = NOW()
     WHERE id = $4 AND tenant_id = $5
     RETURNING *`,
    [
      data.payment_method, data.payment_reference || null,
      session.total,
      sessionId, tenantId
    ]
  );

  return result.rows[0];
}

async function placeOrder(sessionId, tenantId) {
  const session = await getCheckout(sessionId, tenantId);
  if (!session) return null;
  if (session.status !== 'pending') return { error: 'Checkout session is not active' };
  if (session.current_step !== 'confirm') return { error: 'Cannot place order at current step' };

  // Validate all required fields are set
  if (!session.shipping_address_line1) return { error: 'Shipping address is required' };
  if (!session.shipping_method) return { error: 'Shipping method is required' };
  if (!session.payment_method) return { error: 'Payment method is required' };
  if (session.payment_status !== 'authorized') return { error: 'Payment has not been authorized' };

  // Generate order reference
  const orderId = uuidv4();
  const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

  const result = await query(
    `UPDATE checkout_sessions SET
       status = 'completed', current_step = 'completed',
       payment_status = 'captured',
       order_id = $1, order_number = $2,
       completed_at = NOW(), updated_at = NOW()
     WHERE id = $3 AND tenant_id = $4
     RETURNING *`,
    [orderId, orderNumber, sessionId, tenantId]
  );

  const completed = result.rows[0];
  try {
    await publishEnvelope('ecommerce.checkout.completed.v1', 1, {
      session_id: completed.id,
      order_id: orderId,
      order_number: orderNumber,
      customer_id: completed.customer_id,
      total: completed.total,
      payment_method: completed.payment_method,
      timestamp: new Date().toISOString()
    });
  } catch (_) { /* event publish failure is non-fatal */ }

  return completed;
}

async function cancelCheckout(sessionId, tenantId) {
  const result = await query(
    `UPDATE checkout_sessions SET
       status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND status = 'pending'
     RETURNING *`,
    [sessionId, tenantId]
  );

  if (result.rows.length === 0) return null;

  const cancelled = result.rows[0];
  try {
    await publishEnvelope('ecommerce.checkout.failed.v1', 1, {
      session_id: cancelled.id,
      cart_id: cancelled.cart_id,
      customer_id: cancelled.customer_id,
      reason: 'cancelled',
      timestamp: new Date().toISOString()
    });
  } catch (_) { /* event publish failure is non-fatal */ }

  return cancelled;
}

async function listCheckouts(tenantId, { customer_id, status, limit, offset }) {
  const conditions = ['tenant_id = $1'];
  const params = [tenantId];
  let idx = 2;

  if (customer_id) {
    conditions.push(`customer_id = $${idx}`);
    params.push(customer_id);
    idx += 1;
  }

  if (status) {
    conditions.push(`status = $${idx}`);
    params.push(status);
    idx += 1;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const effectiveLimit = Math.min(parseInt(limit) || 50, 200);
  const effectiveOffset = parseInt(offset) || 0;

  const countResult = await query(
    `SELECT COUNT(*) as total FROM checkout_sessions ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].total);

  params.push(effectiveLimit, effectiveOffset);
  const result = await query(
    `SELECT * FROM checkout_sessions ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );

  return {
    sessions: result.rows,
    pagination: {
      page: Math.floor(effectiveOffset / effectiveLimit) + 1,
      limit: effectiveLimit,
      total
    }
  };
}

module.exports = {
  initCheckout,
  getCheckout,
  setAddress,
  setShipping,
  setPayment,
  placeOrder,
  cancelCheckout,
  listCheckouts
};
