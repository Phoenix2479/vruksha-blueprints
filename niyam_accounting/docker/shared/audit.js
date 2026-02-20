/**
 * Audit Trail Utility (Postgres version)
 * Logs all create/update/delete operations across all services
 */

let _query;

function initAudit(queryFn) {
  _query = queryFn;
}

async function logAudit(tableName, recordId, action, oldValues, newValues, req, tenantId) {
  try {
    await _query(
      `INSERT INTO acc_audit_log (tenant_id, table_name, record_id, action, old_values, new_values, user_id, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        tenantId || 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        tableName, recordId, action,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        (req && req.user && req.user.id) || 'system',
        req ? (req.ip || req.connection?.remoteAddress || '') : '',
        req ? (req.headers?.['user-agent'] || '').substring(0, 255) : ''
      ]
    );
  } catch (err) {
    console.error('[Audit] Log failed:', err.message);
  }
}

async function getAuditLog(filters = {}, tenantId) {
  let sql = 'SELECT * FROM acc_audit_log WHERE tenant_id = $1';
  const params = [tenantId];
  let idx = 2;

  if (filters.table_name) { sql += ` AND table_name = $${idx++}`; params.push(filters.table_name); }
  if (filters.record_id) { sql += ` AND record_id = $${idx++}`; params.push(filters.record_id); }
  if (filters.action) { sql += ` AND action = $${idx++}`; params.push(filters.action); }
  if (filters.user_id) { sql += ` AND user_id = $${idx++}`; params.push(filters.user_id); }
  if (filters.from_date) { sql += ` AND created_at >= $${idx++}`; params.push(filters.from_date); }
  if (filters.to_date) { sql += ` AND created_at <= $${idx++}`; params.push(filters.to_date + 'T23:59:59'); }

  sql += ' ORDER BY created_at DESC';
  if (filters.limit) { sql += ` LIMIT $${idx++}`; params.push(parseInt(filters.limit)); }
  if (filters.offset) { sql += ` OFFSET $${idx++}`; params.push(parseInt(filters.offset)); }

  const result = await _query(sql, params);
  return result.rows;
}

async function getRecordHistory(recordId, tenantId) {
  const result = await _query(
    'SELECT * FROM acc_audit_log WHERE record_id = $1 AND tenant_id = $2 ORDER BY created_at DESC',
    [recordId, tenantId]
  );
  return result.rows;
}

async function cleanupAuditLog(tenantId) {
  try {
    await _query(
      `DELETE FROM acc_audit_log WHERE tenant_id = $1 AND created_at < NOW() - INTERVAL '1095 days'`,
      [tenantId]
    );
  } catch (err) {
    console.error('[Audit] Cleanup failed:', err.message);
  }
}

module.exports = { initAudit, logAudit, getAuditLog, getRecordHistory, cleanupAuditLog };
