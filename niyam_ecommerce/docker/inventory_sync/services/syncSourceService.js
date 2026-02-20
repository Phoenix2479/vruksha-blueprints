// Sync source business logic service

const { query } = require('@vruksha/platform/db/postgres');

async function listSources(tenantId) {
  const result = await query(
    'SELECT * FROM sync_sources WHERE tenant_id = $1 ORDER BY created_at DESC',
    [tenantId]
  );
  return result.rows;
}

async function getSource(tenantId, sourceId) {
  const result = await query(
    'SELECT * FROM sync_sources WHERE id = $1 AND tenant_id = $2',
    [sourceId, tenantId]
  );
  return result.rows[0] || null;
}

async function createSource(tenantId, data) {
  const result = await query(
    `INSERT INTO sync_sources (tenant_id, name, type, config, is_active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [tenantId, data.name, data.type, JSON.stringify(data.config || {}), data.is_active !== false]
  );
  return result.rows[0];
}

async function updateSource(tenantId, sourceId, data) {
  const fields = [];
  const params = [];
  let idx = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${idx}`);
    params.push(data.name);
    idx++;
  }
  if (data.type !== undefined) {
    fields.push(`type = $${idx}`);
    params.push(data.type);
    idx++;
  }
  if (data.config !== undefined) {
    fields.push(`config = $${idx}`);
    params.push(JSON.stringify(data.config));
    idx++;
  }
  if (data.is_active !== undefined) {
    fields.push(`is_active = $${idx}`);
    params.push(data.is_active);
    idx++;
  }
  if (data.last_synced_at !== undefined) {
    fields.push(`last_synced_at = $${idx}`);
    params.push(data.last_synced_at);
    idx++;
  }

  if (fields.length === 0) {
    return { success: false, error: 'No fields to update' };
  }

  fields.push('updated_at = NOW()');

  params.push(sourceId, tenantId);
  const result = await query(
    `UPDATE sync_sources SET ${fields.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
    params
  );

  if (result.rows.length === 0) {
    return { success: false, error: 'Sync source not found' };
  }

  return { success: true, source: result.rows[0] };
}

async function deleteSource(tenantId, sourceId) {
  const result = await query(
    'DELETE FROM sync_sources WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [sourceId, tenantId]
  );
  if (result.rows.length === 0) {
    return { success: false, error: 'Sync source not found' };
  }
  return { success: true, message: 'Sync source deleted' };
}

module.exports = {
  listSources,
  getSource,
  createSource,
  updateSource,
  deleteSource
};
