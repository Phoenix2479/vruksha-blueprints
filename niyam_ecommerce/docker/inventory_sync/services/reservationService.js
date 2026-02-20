// Reservation business logic service

const { query, getClient } = require('@vruksha/platform/db/postgres');

async function listActive(tenantId, productId) {
  let sql = 'SELECT * FROM stock_reservations WHERE tenant_id = $1 AND status = \'active\'';
  const params = [tenantId];

  if (productId) {
    sql += ' AND product_id = $2';
    params.push(productId);
  }

  sql += ' ORDER BY created_at DESC';
  const result = await query(sql, params);
  return result.rows;
}

async function reserve(tenantId, data) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Find the stock record
    const stockResult = await client.query(
      `SELECT * FROM stock_records WHERE tenant_id = $1 AND product_id = $2 AND variant_id IS NOT DISTINCT FROM $3 AND location = $4 FOR UPDATE`,
      [tenantId, data.product_id, data.variant_id || null, data.location || 'default']
    );

    if (stockResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Stock record not found for this product/location' };
    }

    const stock = stockResult.rows[0];
    const available = stock.quantity - stock.reserved;

    if (data.quantity > available) {
      await client.query('ROLLBACK');
      return { success: false, error: `Insufficient stock. Available: ${available}, Requested: ${data.quantity}` };
    }

    // Create reservation
    const expiresAt = data.expires_at || new Date(Date.now() + 30 * 60 * 1000).toISOString(); // default 30 min
    const reservationResult = await client.query(
      `INSERT INTO stock_reservations (tenant_id, product_id, variant_id, order_id, quantity, status, expires_at, notes)
       VALUES ($1, $2, $3, $4, $5, 'active', $6, $7)
       RETURNING *`,
      [tenantId, data.product_id, data.variant_id || null, data.order_id || null, data.quantity, expiresAt, data.notes || null]
    );

    // Update reserved count on stock record
    await client.query(
      'UPDATE stock_records SET reserved = reserved + $1, updated_at = NOW() WHERE id = $2',
      [data.quantity, stock.id]
    );

    await client.query('COMMIT');

    return { success: true, reservation: reservationResult.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function release(tenantId, reservationId) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const resResult = await client.query(
      'SELECT * FROM stock_reservations WHERE id = $1 AND tenant_id = $2 AND status = \'active\' FOR UPDATE',
      [reservationId, tenantId]
    );

    if (resResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Active reservation not found' };
    }

    const reservation = resResult.rows[0];

    // Mark reservation as released
    await client.query(
      'UPDATE stock_reservations SET status = \'released\', updated_at = NOW() WHERE id = $1',
      [reservationId]
    );

    // Decrease reserved count on stock record
    await client.query(
      `UPDATE stock_records SET reserved = GREATEST(reserved - $1, 0), updated_at = NOW()
       WHERE tenant_id = $2 AND product_id = $3 AND variant_id IS NOT DISTINCT FROM $4`,
      [reservation.quantity, tenantId, reservation.product_id, reservation.variant_id]
    );

    await client.query('COMMIT');

    return { success: true, message: 'Reservation released' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  listActive,
  reserve,
  release
};
