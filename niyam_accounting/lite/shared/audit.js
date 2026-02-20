/**
 * Audit Trail Utility
 * Logs all create/update/delete operations across all services
 */
const { v4: uuidv4 } = require('uuid');

let _query, _run, _get;

function initAudit(dbFns) {
  _query = dbFns.query;
  _run = dbFns.run;
  _get = dbFns.get;
}

function logAudit(tableName, recordId, action, oldValues, newValues, req) {
  try {
    const settings = _get ? _get('SELECT * FROM acc_audit_settings WHERE id = ?', ['default']) : null;
    if (settings && !settings.enabled) return;

    const id = uuidv4();
    _run(
      `INSERT INTO acc_audit_log (id, table_name, record_id, action, old_values, new_values, user_id, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, tableName, recordId, action,
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

function getAuditLog(filters = {}) {
  let sql = 'SELECT * FROM acc_audit_log WHERE 1=1';
  const params = [];

  if (filters.table_name) { sql += ' AND table_name = ?'; params.push(filters.table_name); }
  if (filters.record_id) { sql += ' AND record_id = ?'; params.push(filters.record_id); }
  if (filters.action) { sql += ' AND action = ?'; params.push(filters.action); }
  if (filters.user_id) { sql += ' AND user_id = ?'; params.push(filters.user_id); }
  if (filters.from_date) { sql += ' AND created_at >= ?'; params.push(filters.from_date); }
  if (filters.to_date) { sql += ' AND created_at <= ?'; params.push(filters.to_date + 'T23:59:59'); }

  sql += ' ORDER BY created_at DESC';
  if (filters.limit) { sql += ' LIMIT ?'; params.push(parseInt(filters.limit)); }
  if (filters.offset) { sql += ' OFFSET ?'; params.push(parseInt(filters.offset)); }

  return _query(sql, params);
}

function getRecordHistory(recordId) {
  return _query(
    'SELECT * FROM acc_audit_log WHERE record_id = ? ORDER BY created_at DESC',
    [recordId]
  );
}

function cleanupAuditLog() {
  try {
    const settings = _get('SELECT * FROM acc_audit_settings WHERE id = ?', ['default']);
    const days = (settings && settings.retention_days) || 1095;
    _run(`DELETE FROM acc_audit_log WHERE created_at < datetime('now', '-${days} days')`);
  } catch (err) {
    console.error('[Audit] Cleanup failed:', err.message);
  }
}

module.exports = { initAudit, logAudit, getAuditLog, getRecordHistory, cleanupAuditLog };
