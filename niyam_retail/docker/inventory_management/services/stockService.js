// Stock management business logic service

const { query, getClient } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');
const { DEFAULT_STORE_ID, DEFAULT_USER_ID } = require('../config/constants');

async function getStock(productId, tenantId) {
  const result = await query(
    `SELECT
       product_id, sku, store_id, quantity, reserved_quantity,
       available_quantity, reorder_point, reorder_quantity,
       last_counted_at, last_received_at
     FROM inventory
     WHERE product_id = $1 AND store_id = $2 AND tenant_id = $3`,
    [productId, DEFAULT_STORE_ID, tenantId]
  );

  if (result.rows.length === 0) {
    return {
      product_id: productId,
      store_id: DEFAULT_STORE_ID,
      quantity: 0,
      reserved_quantity: 0,
      available_quantity: 0,
      reorder_point: 0,
      reorder_quantity: 0,
      last_counted_at: null,
      last_received_at: null,
    };
  }

  return result.rows[0];
}

async function adjustStock(tenantId, { product_id, quantity_change, reason, notes }) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const invResult = await client.query(
      `SELECT * FROM inventory
       WHERE product_id = $1 AND store_id = $2 AND tenant_id = $3
       FOR UPDATE`,
      [product_id, DEFAULT_STORE_ID, tenantId]
    );

    let inventoryRow = invResult.rows[0];

    if (!inventoryRow) {
      const productResult = await client.query(
        'SELECT sku FROM products WHERE id = $1',
        [product_id]
      );

      if (productResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Product not found' };
      }

      const sku = productResult.rows[0].sku;

      const insertInv = await client.query(
        `INSERT INTO inventory (
           tenant_id, product_id, sku, store_id, quantity, reserved_quantity,
           reorder_point, reorder_quantity
         ) VALUES ($1, $2, $3, $4, 0, 0, 0, 0)
         RETURNING *`,
        [tenantId, product_id, sku, DEFAULT_STORE_ID]
      );

      inventoryRow = insertInv.rows[0];
    }

    const oldQty = parseInt(inventoryRow.quantity, 10) || 0;
    const change = parseInt(quantity_change, 10);
    const newQty = oldQty + change;

    if (newQty < 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Stock quantity cannot be negative' };
    }

    await client.query(
      `UPDATE inventory
       SET quantity = $1,
           updated_at = NOW(),
           last_counted_at = NOW()
       WHERE id = $2 AND tenant_id = $3`,
      [newQty, inventoryRow.id, tenantId]
    );

    const txnResult = await client.query(
      `INSERT INTO inventory_transactions (
         tenant_id, product_id, sku, store_id, transaction_type, quantity,
         old_quantity, new_quantity, reference_id, reference_type,
         notes, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6,
                 $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        tenantId,
        inventoryRow.product_id,
        inventoryRow.sku,
        inventoryRow.store_id,
        'adjustment',
        change,
        oldQty,
        newQty,
        null,
        reason,
        notes || null,
        DEFAULT_USER_ID,
      ]
    );

    const adjustment = txnResult.rows[0];

    await client.query('COMMIT');

    await publishEnvelope('retail.inventory.stock.adjusted.v1', 1, {
      product_id: inventoryRow.product_id,
      store_id: inventoryRow.store_id,
      quantity_change: change,
      new_quantity: newQty,
      reason,
      timestamp: new Date().toISOString(),
    });

    return { success: true, adjustment };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getStockHistory(productId, tenantId) {
  const result = await query(
    `SELECT
       id, transaction_type, quantity, old_quantity, new_quantity,
       reference_id, reference_type, notes, created_by, created_at
     FROM inventory_transactions
     WHERE tenant_id = $3 AND product_id = $1 AND store_id = $2
     ORDER BY created_at DESC
     LIMIT 100`,
    [productId, DEFAULT_STORE_ID, tenantId]
  );

  return result.rows;
}

async function getDeadStock() {
  const result = await query(
    `SELECT p.id, p.name, p.sku, i.quantity, i.last_counted_at
     FROM products p
     JOIN inventory i ON p.id = i.product_id
     WHERE i.quantity > 0 AND (i.last_counted_at < NOW() - INTERVAL '90 days' OR i.last_counted_at IS NULL)
     LIMIT 50`
  );
  return result.rows;
}

module.exports = {
  getStock,
  adjustStock,
  getStockHistory,
  getDeadStock
};
