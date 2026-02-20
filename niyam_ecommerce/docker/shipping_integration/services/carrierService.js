// Carrier management business logic service

const { query } = require('@vruksha/platform/db/postgres');

async function listCarriers(tenantId, activeOnly) {
  let sql = 'SELECT * FROM carriers WHERE tenant_id = $1';
  const params = [tenantId];

  if (activeOnly) {
    sql += ' AND is_active = true';
  }

  sql += ' ORDER BY name ASC';
  const result = await query(sql, params);
  return result.rows;
}

async function getCarrier(tenantId, carrierId) {
  const result = await query(
    'SELECT * FROM carriers WHERE id = $1 AND tenant_id = $2',
    [carrierId, tenantId]
  );
  return result.rows[0] || null;
}

async function createCarrier(tenantId, data) {
  const result = await query(
    `INSERT INTO carriers (tenant_id, name, code, is_active, config, base_rate, per_kg_rate)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      tenantId, data.name, data.code, data.is_active !== false,
      JSON.stringify(data.config || {}),
      data.base_rate || 5.00, data.per_kg_rate || 2.00
    ]
  );
  return result.rows[0];
}

async function updateCarrier(tenantId, carrierId, data) {
  const fields = [];
  const params = [];
  let idx = 1;

  if (data.name !== undefined) { fields.push(`name = $${idx}`); params.push(data.name); idx++; }
  if (data.code !== undefined) { fields.push(`code = $${idx}`); params.push(data.code); idx++; }
  if (data.is_active !== undefined) { fields.push(`is_active = $${idx}`); params.push(data.is_active); idx++; }
  if (data.config !== undefined) { fields.push(`config = $${idx}`); params.push(JSON.stringify(data.config)); idx++; }
  if (data.base_rate !== undefined) { fields.push(`base_rate = $${idx}`); params.push(data.base_rate); idx++; }
  if (data.per_kg_rate !== undefined) { fields.push(`per_kg_rate = $${idx}`); params.push(data.per_kg_rate); idx++; }

  if (fields.length === 0) {
    return { success: false, error: 'No fields to update' };
  }

  fields.push('updated_at = NOW()');
  params.push(carrierId, tenantId);

  const result = await query(
    `UPDATE carriers SET ${fields.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
    params
  );

  if (result.rows.length === 0) {
    return { success: false, error: 'Carrier not found' };
  }

  return { success: true, carrier: result.rows[0] };
}

async function deleteCarrier(tenantId, carrierId) {
  const result = await query(
    'DELETE FROM carriers WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [carrierId, tenantId]
  );
  if (result.rows.length === 0) {
    return { success: false, error: 'Carrier not found' };
  }
  return { success: true, message: 'Carrier deleted' };
}

module.exports = {
  listCarriers,
  getCarrier,
  createCarrier,
  updateCarrier,
  deleteCarrier
};
