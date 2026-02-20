// Stock management business logic service

const { query, getClient } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');

async function getStockByProduct(tenantId, productId, variantId) {
  let sql = 'SELECT * FROM stock_records WHERE tenant_id = $1 AND product_id = $2';
  const params = [tenantId, productId];

  if (variantId) {
    sql += ' AND variant_id = $3';
    params.push(variantId);
  }

  sql += ' ORDER BY location ASC';
  const result = await query(sql, params);

  return result.rows.map(row => ({
    ...row,
    available: row.quantity - row.reserved
  }));
}

async function updateQuantity(tenantId, data) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const location = data.location || 'default';

    // Upsert stock record
    const result = await client.query(
      `INSERT INTO stock_records (tenant_id, product_id, variant_id, location, quantity, low_stock_threshold)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tenant_id, product_id, variant_id, location)
       DO UPDATE SET quantity = $5, updated_at = NOW()
       RETURNING *`,
      [
        tenantId, data.product_id, data.variant_id || null,
        location, data.quantity, data.low_stock_threshold || 10
      ]
    );

    const record = result.rows[0];
    const available = record.quantity - record.reserved;

    await client.query('COMMIT');

    // Check for low stock alert
    if (record.quantity <= record.low_stock_threshold) {
      await createLowStockAlert(tenantId, record);
    }

    // Publish event
    try {
      await publishEnvelope('ecommerce.stock.updated.v1', 1, {
        product_id: data.product_id,
        variant_id: data.variant_id,
        location,
        quantity: record.quantity,
        reserved: record.reserved,
        available,
        timestamp: new Date().toISOString()
      });
    } catch (_) { /* non-fatal */ }

    return { ...record, available };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function bulkUpdate(tenantId, items) {
  const client = await getClient();
  const results = [];
  try {
    await client.query('BEGIN');

    for (const item of items) {
      const location = item.location || 'default';
      const result = await client.query(
        `INSERT INTO stock_records (tenant_id, product_id, variant_id, location, quantity, low_stock_threshold)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tenant_id, product_id, variant_id, location)
         DO UPDATE SET quantity = $5, updated_at = NOW()
         RETURNING *`,
        [
          tenantId, item.product_id, item.variant_id || null,
          location, item.quantity, item.low_stock_threshold || 10
        ]
      );
      const record = result.rows[0];
      results.push({ ...record, available: record.quantity - record.reserved });

      // Check for low stock
      if (record.quantity <= record.low_stock_threshold) {
        await createLowStockAlertInTx(client, tenantId, record);
      }
    }

    await client.query('COMMIT');

    return results;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function createLowStockAlert(tenantId, record) {
  try {
    await query(
      `INSERT INTO stock_alerts (tenant_id, product_id, variant_id, type, message)
       VALUES ($1, $2, $3, 'low_stock', $4)`,
      [
        tenantId, record.product_id, record.variant_id,
        `Low stock alert: product ${record.product_id} at location ${record.location} has ${record.quantity} units (threshold: ${record.low_stock_threshold})`
      ]
    );
    try {
      await publishEnvelope('ecommerce.stock.alert.v1', 1, {
        product_id: record.product_id,
        variant_id: record.variant_id,
        location: record.location,
        quantity: record.quantity,
        threshold: record.low_stock_threshold,
        type: 'low_stock',
        timestamp: new Date().toISOString()
      });
    } catch (_) { /* non-fatal */ }
  } catch (_) { /* alert creation is non-fatal */ }
}

async function createLowStockAlertInTx(client, tenantId, record) {
  try {
    await client.query(
      `INSERT INTO stock_alerts (tenant_id, product_id, variant_id, type, message)
       VALUES ($1, $2, $3, 'low_stock', $4)`,
      [
        tenantId, record.product_id, record.variant_id,
        `Low stock alert: product ${record.product_id} at location ${record.location} has ${record.quantity} units (threshold: ${record.low_stock_threshold})`
      ]
    );
  } catch (_) { /* non-fatal */ }
}

module.exports = {
  getStockByProduct,
  updateQuantity,
  bulkUpdate
};
