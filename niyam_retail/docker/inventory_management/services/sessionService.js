/**
 * Ingestion Session Service for Docker Version
 * Manages import sessions with PostgreSQL persistence
 * Features:
 * - 30-day default expiry
 * - Expiry warnings for sessions within 7 days
 * - NATS KV caching for fast access
 */

const { getClient, query } = require('@vruksha/platform/db/postgres');
const kvStore = require('@vruksha/platform/nats/kv_store');

const DEFAULT_EXPIRY_DAYS = 30;
const WARNING_THRESHOLD_DAYS = 7;

/**
 * Get all sessions for a tenant with optional status filter
 * Includes expiry warnings for sessions about to expire
 */
async function getSessions(tenantId, options = {}) {
  const { status, limit = 50, offset = 0 } = options;
  
  let whereClause = 'tenant_id = $1';
  const params = [tenantId];
  let paramIndex = 2;

  if (status) {
    whereClause += ` AND status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  // Get sessions
  const result = await query(
    `SELECT id, source_type, original_filename, status, ai_mode, ai_confidence,
            import_notes, created_at, updated_at, expires_at, committed_at,
            EXTRACT(DAY FROM (expires_at - NOW()))::INTEGER as expires_in_days,
            (SELECT COUNT(*) FROM jsonb_array_elements(mapped_data)) as row_count
     FROM ingestion_sessions
     WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  // Get expiring soon warnings
  const expiringResult = await query(
    `SELECT id, original_filename, expires_at,
            EXTRACT(DAY FROM (expires_at - NOW()))::INTEGER as expires_in_days
     FROM ingestion_sessions
     WHERE tenant_id = $1 
       AND status = 'pending'
       AND expires_at <= NOW() + INTERVAL '${WARNING_THRESHOLD_DAYS} days'
     ORDER BY expires_at ASC`,
    [tenantId]
  );

  const expiringSoon = expiringResult.rows.map(row => ({
    id: row.id,
    filename: row.original_filename,
    expires_at: row.expires_at,
    expires_in_days: row.expires_in_days,
    message: row.expires_in_days <= 1 
      ? 'This session will be deleted tomorrow!'
      : `This session will be deleted in ${row.expires_in_days} days`
  }));

  return {
    sessions: result.rows,
    expiring_soon: expiringSoon,
    has_expiry_warnings: expiringSoon.length > 0
  };
}

/**
 * Get a single session by ID with full data
 */
async function getSession(tenantId, sessionId) {
  // Try KV cache first for performance
  const cacheKey = `session.${tenantId}.${sessionId}`;
  const cached = await kvStore.get(cacheKey);
  if (cached && cached.mapped_data) {
    return cached;
  }

  // Fetch from PostgreSQL
  const result = await query(
    `SELECT * FROM ingestion_sessions
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, sessionId]
  );

  const session = result.rows[0] || null;
  
  if (session) {
    // Cache for 1 hour
    await kvStore.set(cacheKey, session, 3600);
  }

  return session;
}

/**
 * Create a new session with 30-day expiry
 */
async function createSession(tenantId, data = {}) {
  const {
    supplier_template_id = null,
    source_type = null,
    original_filename = null,
    raw_data = null,
    mapped_data = null,
    column_mapping = null,
    warnings = [],
    ai_mode = null,
    ai_confidence = null,
    import_notes = null,
    expiry_days = DEFAULT_EXPIRY_DAYS
  } = data;

  const result = await query(
    `INSERT INTO ingestion_sessions
      (tenant_id, supplier_template_id, source_type, original_filename,
       raw_data, mapped_data, column_mapping, warnings, ai_mode, ai_confidence,
       import_notes, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW() + INTERVAL '${expiry_days} days')
     RETURNING *`,
    [
      tenantId,
      supplier_template_id,
      source_type,
      original_filename,
      raw_data ? JSON.stringify(raw_data) : null,
      mapped_data ? JSON.stringify(mapped_data) : null,
      column_mapping ? JSON.stringify(column_mapping) : null,
      JSON.stringify(warnings),
      ai_mode,
      ai_confidence,
      import_notes
    ]
  );

  const session = result.rows[0];
  
  // Cache in NATS KV
  const cacheKey = `session.${tenantId}.${session.id}`;
  await kvStore.set(cacheKey, session, 3600);

  return session;
}

/**
 * Update session data
 */
async function updateSession(tenantId, sessionId, data) {
  const updates = [];
  const values = [tenantId, sessionId];
  let paramIndex = 3;

  const allowedFields = [
    'supplier_template_id', 'source_type', 'original_filename',
    'raw_data', 'mapped_data', 'column_mapping', 'warnings',
    'ai_mode', 'ai_confidence', 'status', 'import_notes'
  ];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      let value = data[field];
      // JSON stringify arrays/objects
      if (['raw_data', 'mapped_data', 'column_mapping', 'warnings'].includes(field) && typeof value === 'object') {
        value = JSON.stringify(value);
      }
      updates.push(`${field} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  }

  // Always update updated_at
  updates.push('updated_at = NOW()');

  if (updates.length === 1) { // Only updated_at
    return getSession(tenantId, sessionId);
  }

  const result = await query(
    `UPDATE ingestion_sessions
     SET ${updates.join(', ')}
     WHERE tenant_id = $1 AND id = $2
     RETURNING *`,
    values
  );

  const session = result.rows[0];
  
  if (session) {
    // Update cache
    const cacheKey = `session.${tenantId}.${sessionId}`;
    await kvStore.set(cacheKey, session, 3600);
  }

  return session;
}

/**
 * Delete a session
 */
async function deleteSession(tenantId, sessionId) {
  // Delete from PostgreSQL
  const result = await query(
    `DELETE FROM ingestion_sessions
     WHERE tenant_id = $1 AND id = $2
     RETURNING id`,
    [tenantId, sessionId]
  );

  // Clear cache
  const cacheKey = `session.${tenantId}.${sessionId}`;
  await kvStore.delete(cacheKey);

  return result.rowCount > 0;
}

/**
 * Mark session as committed
 */
async function commitSession(tenantId, sessionId, userId = null) {
  const result = await query(
    `UPDATE ingestion_sessions
     SET status = 'committed', 
         committed_at = NOW(), 
         committed_by = $3,
         updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2 AND status = 'pending'
     RETURNING *`,
    [tenantId, sessionId, userId]
  );

  const session = result.rows[0];
  
  if (session) {
    // Update cache
    const cacheKey = `session.${tenantId}.${sessionId}`;
    await kvStore.set(cacheKey, session, 3600);
  }

  return session;
}

/**
 * Cancel a session
 */
async function cancelSession(tenantId, sessionId) {
  const result = await query(
    `UPDATE ingestion_sessions
     SET status = 'cancelled', updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2 AND status = 'pending'
     RETURNING *`,
    [tenantId, sessionId]
  );

  const session = result.rows[0];
  
  if (session) {
    const cacheKey = `session.${tenantId}.${sessionId}`;
    await kvStore.set(cacheKey, session, 3600);
  }

  return session;
}

/**
 * Extend session expiry
 */
async function extendSessionExpiry(tenantId, sessionId, additionalDays = DEFAULT_EXPIRY_DAYS) {
  const result = await query(
    `UPDATE ingestion_sessions
     SET expires_at = expires_at + INTERVAL '${additionalDays} days',
         updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2 AND status = 'pending'
     RETURNING id, expires_at`,
    [tenantId, sessionId]
  );

  return result.rows[0] || null;
}

/**
 * Cleanup expired sessions (mark as expired)
 * This should be called by a cron job or scheduled task
 */
async function cleanupExpiredSessions() {
  const result = await query(
    `UPDATE ingestion_sessions 
     SET status = 'expired', updated_at = NOW()
     WHERE status = 'pending' AND expires_at < NOW()
     RETURNING id, tenant_id`
  );

  // Clear caches for expired sessions
  for (const row of result.rows) {
    const cacheKey = `session.${row.tenant_id}.${row.id}`;
    await kvStore.delete(cacheKey);
  }

  console.log(`[SessionService] Cleaned up ${result.rowCount} expired sessions`);
  return result.rowCount;
}

/**
 * Get sessions expiring within N days for a tenant
 */
async function getExpiringSessionsWarning(tenantId, days = WARNING_THRESHOLD_DAYS) {
  const result = await query(
    `SELECT id, original_filename, expires_at,
            EXTRACT(DAY FROM (expires_at - NOW()))::INTEGER as expires_in_days
     FROM ingestion_sessions
     WHERE tenant_id = $1 
       AND status = 'pending'
       AND expires_at <= NOW() + INTERVAL '${days} days'
     ORDER BY expires_at ASC`,
    [tenantId]
  );

  return result.rows.map(row => ({
    id: row.id,
    filename: row.original_filename,
    expires_at: row.expires_at,
    expires_in_days: row.expires_in_days,
    message: row.expires_in_days <= 0
      ? 'This session has expired and will be deleted soon!'
      : row.expires_in_days <= 1 
        ? 'This session will be deleted tomorrow!'
        : `This session will be deleted in ${row.expires_in_days} days`
  }));
}

/**
 * Get session count by status for a tenant
 */
async function getSessionStats(tenantId) {
  const result = await query(
    `SELECT 
       status,
       COUNT(*) as count
     FROM ingestion_sessions
     WHERE tenant_id = $1
     GROUP BY status`,
    [tenantId]
  );

  const stats = { pending: 0, committed: 0, cancelled: 0, expired: 0 };
  for (const row of result.rows) {
    stats[row.status] = parseInt(row.count);
  }
  stats.total = Object.values(stats).reduce((a, b) => a + b, 0);
  
  return stats;
}

module.exports = {
  getSessions,
  getSession,
  createSession,
  updateSession,
  deleteSession,
  commitSession,
  cancelSession,
  extendSessionExpiry,
  cleanupExpiredSessions,
  getExpiringSessionsWarning,
  getSessionStats,
  DEFAULT_EXPIRY_DAYS,
  WARNING_THRESHOLD_DAYS
};
