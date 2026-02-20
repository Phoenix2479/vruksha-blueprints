// Transaction business logic service

const { query } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');

/**
 * Simulate card last four digits
 */
function simulateCardLastFour() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/**
 * Generate a unique reference ID for the transaction
 */
function generateReferenceId(type) {
  const prefix = type === 'refund' ? 'REF' : type === 'capture' ? 'CAP' : 'TXN';
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

async function listTransactions(tenantId, { order_id, status, type, gateway_id, limit = 100, offset = 0 } = {}) {
  let sql = 'SELECT * FROM transactions WHERE tenant_id = $1';
  const params = [tenantId];
  let idx = 2;

  if (order_id) {
    sql += ` AND order_id = $${idx++}`;
    params.push(order_id);
  }
  if (status) {
    sql += ` AND status = $${idx++}`;
    params.push(status);
  }
  if (type) {
    sql += ` AND type = $${idx++}`;
    params.push(type);
  }
  if (gateway_id) {
    sql += ` AND gateway_id = $${idx++}`;
    params.push(gateway_id);
  }

  sql += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`;
  params.push(parseInt(limit), parseInt(offset));

  const result = await query(sql, params);
  return result.rows;
}

async function getTransaction(id, tenantId) {
  const result = await query(
    'SELECT * FROM transactions WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  return result.rows[0] || null;
}

async function authorize(tenantId, data) {
  const { order_id, gateway_id, amount, currency, payment_method, metadata } = data;

  const cardLastFour = simulateCardLastFour();
  const referenceId = generateReferenceId('authorize');

  const result = await query(
    `INSERT INTO transactions (tenant_id, order_id, gateway_id, type, amount, currency, status, payment_method, card_last_four, reference_id, metadata)
     VALUES ($1, $2, $3, 'charge', $4, $5, 'authorized', $6, $7, $8, $9)
     RETURNING *`,
    [
      tenantId,
      order_id || null,
      gateway_id || null,
      amount,
      currency || 'USD',
      payment_method || 'card',
      cardLastFour,
      referenceId,
      JSON.stringify(metadata || {})
    ]
  );

  const transaction = result.rows[0];

  try {
    await publishEnvelope('ecommerce.payment.authorized.v1', 1, {
      transaction_id: transaction.id,
      order_id: transaction.order_id,
      amount: transaction.amount,
      currency: transaction.currency,
      payment_method: transaction.payment_method,
      reference_id: transaction.reference_id
    });
  } catch (_) { /* non-blocking */ }

  return transaction;
}

async function capture(id, tenantId) {
  const existing = await getTransaction(id, tenantId);
  if (!existing) return { error: 'Transaction not found', status: 404 };
  if (existing.status !== 'authorized') {
    return { error: `Cannot capture transaction with status '${existing.status}'. Must be 'authorized'.`, status: 400 };
  }

  const referenceId = generateReferenceId('capture');

  const result = await query(
    `UPDATE transactions SET status = 'captured', type = 'capture', reference_id = $1, updated_at = NOW()
     WHERE id = $2 AND tenant_id = $3 RETURNING *`,
    [referenceId, id, tenantId]
  );

  const transaction = result.rows[0];

  try {
    await publishEnvelope('ecommerce.payment.captured.v1', 1, {
      transaction_id: transaction.id,
      order_id: transaction.order_id,
      amount: transaction.amount,
      currency: transaction.currency,
      payment_method: transaction.payment_method,
      reference_id: transaction.reference_id
    });
  } catch (_) { /* non-blocking */ }

  return { transaction };
}

async function refund(id, tenantId, data = {}) {
  const existing = await getTransaction(id, tenantId);
  if (!existing) return { error: 'Transaction not found', status: 404 };
  if (existing.status !== 'captured') {
    return { error: `Cannot refund transaction with status '${existing.status}'. Must be 'captured'.`, status: 400 };
  }

  const refundAmount = data.amount || existing.amount;
  if (refundAmount <= 0 || refundAmount > parseFloat(existing.amount)) {
    return { error: `Refund amount must be between 0.01 and ${existing.amount}`, status: 400 };
  }

  const referenceId = generateReferenceId('refund');
  const isFullRefund = refundAmount >= parseFloat(existing.amount);

  // Create a new refund transaction
  const refundResult = await query(
    `INSERT INTO transactions (tenant_id, order_id, gateway_id, type, amount, currency, status, payment_method, card_last_four, reference_id, parent_transaction_id, metadata)
     VALUES ($1, $2, $3, 'refund', $4, $5, 'refunded', $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      tenantId,
      existing.order_id,
      existing.gateway_id,
      refundAmount,
      existing.currency,
      existing.payment_method,
      existing.card_last_four,
      referenceId,
      id,
      JSON.stringify({ reason: data.reason || 'Customer requested refund', original_transaction_id: id })
    ]
  );

  // Mark original as refunded if full refund
  if (isFullRefund) {
    await query(
      `UPDATE transactions SET status = 'refunded', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
  }

  const refundTxn = refundResult.rows[0];

  try {
    await publishEnvelope('ecommerce.payment.refunded.v1', 1, {
      transaction_id: refundTxn.id,
      original_transaction_id: id,
      order_id: refundTxn.order_id,
      amount: refundTxn.amount,
      currency: refundTxn.currency,
      is_full_refund: isFullRefund,
      reason: data.reason
    });
  } catch (_) { /* non-blocking */ }

  return { transaction: refundTxn, original_status: isFullRefund ? 'refunded' : 'captured' };
}

async function voidTransaction(id, tenantId) {
  const existing = await getTransaction(id, tenantId);
  if (!existing) return { error: 'Transaction not found', status: 404 };
  if (existing.status !== 'authorized' && existing.status !== 'pending') {
    return { error: `Cannot void transaction with status '${existing.status}'. Must be 'authorized' or 'pending'.`, status: 400 };
  }

  const result = await query(
    `UPDATE transactions SET status = 'voided', type = 'void', updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    [id, tenantId]
  );

  return { transaction: result.rows[0] };
}

module.exports = {
  listTransactions,
  getTransaction,
  authorize,
  capture,
  refund,
  voidTransaction
};
