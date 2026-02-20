/**
 * Maintenance Service - Lite Version
 * Handles database cleanup, vacuum, and scheduled maintenance tasks
 */

const { query, run, saveDb, DB_PATH } = require('./db');

// Configuration
const DEFAULT_SESSION_RETENTION_DAYS = 7;
const DEFAULT_FAILED_UPLOAD_RETENTION_HOURS = 24;
const MAINTENANCE_INTERVAL_HOURS = 24;

let maintenanceInterval = null;

/**
 * Clean up old ingestion sessions
 * @param {number} days - Sessions older than this many days will be deleted
 * @returns {number} - Number of sessions deleted
 */
function cleanupOldSessions(days = DEFAULT_SESSION_RETENTION_DAYS) {
  try {
    // First count how many will be deleted
    const countResult = query(`
      SELECT COUNT(*) as count FROM ingestion_sessions 
      WHERE datetime(created_at) < datetime('now', '-${days} days')
    `);
    const count = countResult[0]?.count || 0;

    if (count > 0) {
      run(`
        DELETE FROM ingestion_sessions 
        WHERE datetime(created_at) < datetime('now', '-${days} days')
      `);
      console.log(`[Maintenance] Cleaned up ${count} old ingestion sessions (older than ${days} days)`);
    }

    return count;
  } catch (err) {
    console.error('[Maintenance] Error cleaning up old sessions:', err.message);
    return 0;
  }
}

/**
 * Clean up failed/rejected uploads
 * @param {number} hours - Failed uploads older than this many hours will be deleted
 * @returns {number} - Number of uploads deleted
 */
function cleanupFailedUploads(hours = DEFAULT_FAILED_UPLOAD_RETENTION_HOURS) {
  try {
    const countResult = query(`
      SELECT COUNT(*) as count FROM ingestion_sessions 
      WHERE status IN ('rejected', 'failed', 'error')
      AND datetime(created_at) < datetime('now', '-${hours} hours')
    `);
    const count = countResult[0]?.count || 0;

    if (count > 0) {
      run(`
        DELETE FROM ingestion_sessions 
        WHERE status IN ('rejected', 'failed', 'error')
        AND datetime(created_at) < datetime('now', '-${hours} hours')
      `);
      console.log(`[Maintenance] Cleaned up ${count} failed uploads (older than ${hours} hours)`);
    }

    return count;
  } catch (err) {
    console.error('[Maintenance] Error cleaning up failed uploads:', err.message);
    return 0;
  }
}

/**
 * Clean up orphaned AI usage logs
 * @param {number} days - Logs older than this many days will be deleted
 * @returns {number} - Number of logs deleted
 */
function cleanupAIUsageLogs(days = 30) {
  try {
    const countResult = query(`
      SELECT COUNT(*) as count FROM ai_usage_log 
      WHERE datetime(created_at) < datetime('now', '-${days} days')
    `);
    const count = countResult[0]?.count || 0;

    if (count > 0) {
      run(`
        DELETE FROM ai_usage_log 
        WHERE datetime(created_at) < datetime('now', '-${days} days')
      `);
      console.log(`[Maintenance] Cleaned up ${count} old AI usage logs (older than ${days} days)`);
    }

    return count;
  } catch (err) {
    console.error('[Maintenance] Error cleaning up AI usage logs:', err.message);
    return 0;
  }
}

/**
 * Clean up old barcode and ingestion corrections (keep last 1000 per type)
 * @returns {number} - Number of corrections deleted
 */
function cleanupOldCorrections() {
  try {
    let totalDeleted = 0;

    // Barcode corrections - keep last 1000
    const barcodeCount = query('SELECT COUNT(*) as count FROM barcode_corrections')[0]?.count || 0;
    if (barcodeCount > 1000) {
      run(`
        DELETE FROM barcode_corrections 
        WHERE id NOT IN (SELECT id FROM barcode_corrections ORDER BY created_at DESC LIMIT 1000)
      `);
      const deleted = barcodeCount - 1000;
      totalDeleted += deleted;
      console.log(`[Maintenance] Cleaned up ${deleted} old barcode corrections`);
    }

    // Ingestion corrections - keep last 1000
    const ingestionCount = query('SELECT COUNT(*) as count FROM ingestion_corrections')[0]?.count || 0;
    if (ingestionCount > 1000) {
      run(`
        DELETE FROM ingestion_corrections 
        WHERE id NOT IN (SELECT id FROM ingestion_corrections ORDER BY created_at DESC LIMIT 1000)
      `);
      const deleted = ingestionCount - 1000;
      totalDeleted += deleted;
      console.log(`[Maintenance] Cleaned up ${deleted} old ingestion corrections`);
    }

    // Layout suggestions - keep last 100
    const layoutCount = query('SELECT COUNT(*) as count FROM layout_suggestions')[0]?.count || 0;
    if (layoutCount > 100) {
      run(`
        DELETE FROM layout_suggestions 
        WHERE id NOT IN (SELECT id FROM layout_suggestions ORDER BY created_at DESC LIMIT 100)
      `);
      const deleted = layoutCount - 100;
      totalDeleted += deleted;
      console.log(`[Maintenance] Cleaned up ${deleted} old layout suggestions`);
    }

    return totalDeleted;
  } catch (err) {
    console.error('[Maintenance] Error cleaning up corrections:', err.message);
    return 0;
  }
}

/**
 * Run VACUUM on SQLite database
 * This reclaims disk space and defragments the database
 */
function vacuumDatabase() {
  try {
    console.log('[Maintenance] Running VACUUM on database...');
    run('VACUUM');
    saveDb();
    console.log('[Maintenance] VACUUM completed successfully');
    return true;
  } catch (err) {
    console.error('[Maintenance] VACUUM failed:', err.message);
    return false;
  }
}

/**
 * Run ANALYZE on SQLite database to update query statistics
 */
function analyzeDatabase() {
  try {
    console.log('[Maintenance] Running ANALYZE on database...');
    run('ANALYZE');
    console.log('[Maintenance] ANALYZE completed successfully');
    return true;
  } catch (err) {
    console.error('[Maintenance] ANALYZE failed:', err.message);
    return false;
  }
}

/**
 * Get database statistics
 * @returns {Object} - Database statistics
 */
function getDatabaseStats() {
  try {
    const stats = {
      products: query('SELECT COUNT(*) as count FROM products WHERE active = 1')[0]?.count || 0,
      inventory: query('SELECT COUNT(*) as count FROM inventory')[0]?.count || 0,
      sessions: query('SELECT COUNT(*) as count FROM ingestion_sessions')[0]?.count || 0,
      pendingSessions: query("SELECT COUNT(*) as count FROM ingestion_sessions WHERE status = 'pending'")[0]?.count || 0,
      templates: query('SELECT COUNT(*) as count FROM supplier_templates')[0]?.count || 0,
      printerProfiles: query('SELECT COUNT(*) as count FROM printer_profiles')[0]?.count || 0,
      aiUsageLogs: query('SELECT COUNT(*) as count FROM ai_usage_log')[0]?.count || 0,
      barcodeCorrections: query('SELECT COUNT(*) as count FROM barcode_corrections')[0]?.count || 0,
    };

    return stats;
  } catch (err) {
    console.error('[Maintenance] Error getting database stats:', err.message);
    return {};
  }
}

/**
 * Run all maintenance tasks
 * @returns {Object} - Summary of maintenance operations
 */
function runFullMaintenance() {
  console.log('[Maintenance] Starting full maintenance cycle...');
  const startTime = Date.now();

  const summary = {
    timestamp: new Date().toISOString(),
    oldSessionsDeleted: cleanupOldSessions(),
    failedUploadsDeleted: cleanupFailedUploads(),
    aiLogsDeleted: cleanupAIUsageLogs(),
    correctionsDeleted: cleanupOldCorrections(),
    vacuumSuccess: vacuumDatabase(),
    analyzeSuccess: analyzeDatabase(),
    durationMs: 0,
    stats: getDatabaseStats()
  };

  summary.durationMs = Date.now() - startTime;
  console.log(`[Maintenance] Full maintenance completed in ${summary.durationMs}ms`);
  console.log('[Maintenance] Summary:', JSON.stringify(summary, null, 2));

  return summary;
}

/**
 * Start scheduled maintenance (runs every MAINTENANCE_INTERVAL_HOURS)
 */
function startScheduledMaintenance() {
  if (maintenanceInterval) {
    console.log('[Maintenance] Scheduled maintenance already running');
    return;
  }

  const intervalMs = MAINTENANCE_INTERVAL_HOURS * 60 * 60 * 1000;
  
  // Run initial maintenance after a short delay (don't block startup)
  setTimeout(() => {
    console.log('[Maintenance] Running initial maintenance check...');
    runFullMaintenance();
  }, 10000); // 10 seconds after startup

  // Schedule regular maintenance
  maintenanceInterval = setInterval(() => {
    console.log('[Maintenance] Running scheduled maintenance...');
    runFullMaintenance();
  }, intervalMs);

  console.log(`[Maintenance] Scheduled maintenance enabled (every ${MAINTENANCE_INTERVAL_HOURS} hours)`);
}

/**
 * Stop scheduled maintenance
 */
function stopScheduledMaintenance() {
  if (maintenanceInterval) {
    clearInterval(maintenanceInterval);
    maintenanceInterval = null;
    console.log('[Maintenance] Scheduled maintenance stopped');
  }
}

module.exports = {
  cleanupOldSessions,
  cleanupFailedUploads,
  cleanupAIUsageLogs,
  cleanupOldCorrections,
  vacuumDatabase,
  analyzeDatabase,
  getDatabaseStats,
  runFullMaintenance,
  startScheduledMaintenance,
  stopScheduledMaintenance,
  // Constants
  DEFAULT_SESSION_RETENTION_DAYS,
  DEFAULT_FAILED_UPLOAD_RETENTION_HOURS,
  MAINTENANCE_INTERVAL_HOURS
};
