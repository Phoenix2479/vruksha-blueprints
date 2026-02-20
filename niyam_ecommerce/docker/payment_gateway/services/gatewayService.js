// Gateway configuration business logic service

const { query } = require('@vruksha/platform/db/postgres');

async function listGateways(tenantId, { active_only } = {}) {
  let sql = 'SELECT * FROM gateway_configs WHERE tenant_id = $1';
  const params = [tenantId];
  let idx = 2;

  if (active_only === 'true' || active_only === true) {
    sql += ` AND is_active = true`;
  }

  sql += ' ORDER BY is_default DESC, created_at DESC';

  const result = await query(sql, params);
  return result.rows;
}

async function getGateway(id, tenantId) {
  const result = await query(
    'SELECT * FROM gateway_configs WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  return result.rows[0] || null;
}

async function getDefaultGateway(tenantId) {
  const result = await query(
    'SELECT * FROM gateway_configs WHERE tenant_id = $1 AND is_default = true AND is_active = true LIMIT 1',
    [tenantId]
  );
  if (result.rows[0]) return result.rows[0];

  // Fallback to first active gateway
  const fallback = await query(
    'SELECT * FROM gateway_configs WHERE tenant_id = $1 AND is_active = true ORDER BY created_at ASC LIMIT 1',
    [tenantId]
  );
  return fallback.rows[0] || null;
}

async function createGateway(tenantId, data) {
  const { provider, display_name, credentials, is_active, is_default, supported_methods } = data;

  // If setting as default, unset other defaults first
  if (is_default) {
    await query(
      'UPDATE gateway_configs SET is_default = false, updated_at = NOW() WHERE tenant_id = $1 AND is_default = true',
      [tenantId]
    );
  }

  const result = await query(
    `INSERT INTO gateway_configs (tenant_id, provider, display_name, credentials, is_active, is_default, supported_methods)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      tenantId,
      provider,
      display_name,
      JSON.stringify(credentials || {}),
      is_active !== false,
      is_default || false,
      JSON.stringify(supported_methods || ['card'])
    ]
  );

  return result.rows[0];
}

async function updateGateway(id, tenantId, data) {
  const existing = await getGateway(id, tenantId);
  if (!existing) return null;

  const fields = [];
  const params = [];
  let idx = 1;

  if (data.provider !== undefined) {
    fields.push(`provider = $${idx++}`);
    params.push(data.provider);
  }
  if (data.display_name !== undefined) {
    fields.push(`display_name = $${idx++}`);
    params.push(data.display_name);
  }
  if (data.credentials !== undefined) {
    fields.push(`credentials = $${idx++}`);
    params.push(JSON.stringify(data.credentials));
  }
  if (data.is_active !== undefined) {
    fields.push(`is_active = $${idx++}`);
    params.push(data.is_active);
  }
  if (data.supported_methods !== undefined) {
    fields.push(`supported_methods = $${idx++}`);
    params.push(JSON.stringify(data.supported_methods));
  }
  if (data.is_default !== undefined) {
    // If setting as default, unset other defaults first
    if (data.is_default) {
      await query(
        'UPDATE gateway_configs SET is_default = false, updated_at = NOW() WHERE tenant_id = $1 AND is_default = true AND id != $2',
        [tenantId, id]
      );
    }
    fields.push(`is_default = $${idx++}`);
    params.push(data.is_default);
  }

  if (fields.length === 0) return existing;

  fields.push(`updated_at = NOW()`);
  params.push(id, tenantId);

  const result = await query(
    `UPDATE gateway_configs SET ${fields.join(', ')} WHERE id = $${idx++} AND tenant_id = $${idx} RETURNING *`,
    params
  );

  return result.rows[0] || null;
}

async function deleteGateway(id, tenantId) {
  const result = await query(
    'DELETE FROM gateway_configs WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [id, tenantId]
  );
  return result.rows.length > 0;
}

module.exports = {
  listGateways,
  getGateway,
  getDefaultGateway,
  createGateway,
  updateGateway,
  deleteGateway
};
