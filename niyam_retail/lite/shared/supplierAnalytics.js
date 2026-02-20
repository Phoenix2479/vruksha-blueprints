/**
 * Supplier Analytics Service - Lite Version
 * Calculates supplier reliability scores, trends, and reorder suggestions
 */

const { query, run, get } = require('./db');

// ============================================
// Schema Migration (ensure columns exist)
// ============================================

function ensureSchema() {
  try {
    // Check if reliability columns exist on supplier_templates
    const cols = query("PRAGMA table_info(supplier_templates)");
    const colNames = cols.map(c => c.name);
    
    if (!colNames.includes('reliability_score')) {
      run(`ALTER TABLE supplier_templates ADD COLUMN reliability_score REAL DEFAULT 0`);
    }
    if (!colNames.includes('auto_approve_enabled')) {
      run(`ALTER TABLE supplier_templates ADD COLUMN auto_approve_enabled INTEGER DEFAULT 0`);
    }
    if (!colNames.includes('last_assessment')) {
      run(`ALTER TABLE supplier_templates ADD COLUMN last_assessment TEXT`);
    }
    if (!colNames.includes('total_rows_processed')) {
      run(`ALTER TABLE supplier_templates ADD COLUMN total_rows_processed INTEGER DEFAULT 0`);
    }
    if (!colNames.includes('total_corrections')) {
      run(`ALTER TABLE supplier_templates ADD COLUMN total_corrections INTEGER DEFAULT 0`);
    }
    
    console.log('[SupplierAnalytics] Schema verified');
  } catch (e) {
    console.log('[SupplierAnalytics] Schema migration:', e.message);
  }
}

// Run schema check on load
ensureSchema();

// ============================================
// Core Analytics Functions
// ============================================

/**
 * Get detailed stats for a single supplier
 * @param {string} supplierId - Supplier template ID
 * @returns {Object} - Supplier statistics
 */
function getSupplierStats(supplierId) {
  try {
    const template = get('SELECT * FROM supplier_templates WHERE id = ?', [supplierId]);
    if (!template) return null;

    // Get session stats
    const sessionStats = query(`
      SELECT 
        COUNT(*) as total_sessions,
        SUM(CASE WHEN status = 'committed' THEN 1 ELSE 0 END) as approved_sessions,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_sessions,
        AVG(ai_confidence) as avg_confidence,
        MAX(created_at) as last_delivery,
        MIN(created_at) as first_delivery
      FROM ingestion_sessions 
      WHERE supplier_template_id = ?
    `, [supplierId]);

    const stats = sessionStats[0] || {};

    // Get correction stats
    const correctionStats = query(`
      SELECT COUNT(*) as correction_count
      FROM ingestion_corrections ic
      JOIN ingestion_sessions s ON ic.session_id = s.id
      WHERE s.supplier_template_id = ?
    `, [supplierId]);

    // Get recent sessions for trend
    const recentSessions = query(`
      SELECT ai_confidence, created_at, status
      FROM ingestion_sessions 
      WHERE supplier_template_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `, [supplierId]);

    // Calculate reliability score
    const totalSessions = stats.total_sessions || 0;
    const approvedSessions = stats.approved_sessions || 0;
    const reliability = totalSessions > 0 ? (approvedSessions / totalSessions) * 100 : 0;

    // Calculate correction rate
    const totalRows = template.total_rows_processed || 0;
    const totalCorrections = correctionStats[0]?.correction_count || 0;
    const correctionRate = totalRows > 0 ? (totalCorrections / totalRows) * 100 : 0;

    // Calculate consistency (how often column mapping stays the same)
    // Lower is better - means supplier format is consistent
    const consistency = 100 - (correctionRate * 2); // Simple heuristic

    // Calculate grade
    const grade = calculateGrade(reliability, stats.avg_confidence || 0, correctionRate);

    // Calculate trend (improving/declining/stable)
    const trend = calculateTrend(recentSessions.map(s => s.ai_confidence));

    return {
      supplierId,
      supplierName: template.supplier_name,
      totalSessions,
      approvedSessions,
      rejectedSessions: stats.rejected_sessions || 0,
      reliability: Math.round(reliability * 10) / 10,
      avgConfidence: Math.round((stats.avg_confidence || 0) * 100) / 100,
      correctionRate: Math.round(correctionRate * 10) / 10,
      consistency: Math.round(consistency * 10) / 10,
      grade,
      trend,
      lastDelivery: stats.last_delivery,
      firstDelivery: stats.first_delivery,
      recentConfidences: recentSessions.map(s => s.ai_confidence),
      autoApproveEnabled: template.auto_approve_enabled === 1,
      totalRowsProcessed: totalRows,
      totalCorrections,
      useCount: template.use_count || 0,
    };
  } catch (e) {
    console.error('[SupplierAnalytics] Error getting stats:', e.message);
    return null;
  }
}

/**
 * Get all suppliers ranked by reliability
 * @returns {Array} - Ranked list of suppliers
 */
function getAllSupplierRankings() {
  try {
    const templates = query(`
      SELECT id, supplier_name, reliability_score, use_count, 
             auto_approve_enabled, last_assessment
      FROM supplier_templates 
      ORDER BY reliability_score DESC, use_count DESC
    `);

    return templates.map((t, index) => {
      const stats = getSupplierStats(t.id);
      return {
        rank: index + 1,
        ...stats,
        reliabilityScore: t.reliability_score,
      };
    }).filter(Boolean);
  } catch (e) {
    console.error('[SupplierAnalytics] Error getting rankings:', e.message);
    return [];
  }
}

/**
 * Check if supplier should be auto-approved
 * @param {string} supplierId - Supplier template ID
 * @returns {boolean} - True if supplier qualifies for auto-approve
 */
function suggestAutoApprove(supplierId) {
  const stats = getSupplierStats(supplierId);
  if (!stats) return false;

  // Requirements for auto-approve:
  // 1. Reliability > 95%
  // 2. Correction rate < 2%
  // 3. At least 5 successful sessions
  // 4. Average confidence > 90%
  return (
    stats.reliability > 95 &&
    stats.correctionRate < 2 &&
    stats.approvedSessions >= 5 &&
    stats.avgConfidence > 0.9
  );
}

/**
 * Detect quality anomalies (sudden drops)
 * @param {string} supplierId - Supplier template ID
 * @returns {string|null} - Warning message or null
 */
function detectAnomaly(supplierId) {
  const stats = getSupplierStats(supplierId);
  if (!stats || stats.recentConfidences.length < 3) return null;

  const recent = stats.recentConfidences.slice(0, 3);
  const older = stats.recentConfidences.slice(3, 6);

  if (older.length < 2) return null;

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

  // Alert if recent confidence dropped by more than 15%
  if (olderAvg > 0 && (olderAvg - recentAvg) / olderAvg > 0.15) {
    return `Quality drop detected: Recent imports are ${Math.round((olderAvg - recentAvg) * 100)}% less accurate than previous ones.`;
  }

  // Alert if recent session was rejected
  if (stats.rejectedSessions > 0) {
    const rejectRate = stats.rejectedSessions / stats.totalSessions;
    if (rejectRate > 0.1) {
      return `High rejection rate: ${Math.round(rejectRate * 100)}% of imports from this supplier were rejected.`;
    }
  }

  return null;
}

/**
 * Update supplier reliability score
 * @param {string} supplierId - Supplier template ID
 */
function updateReliabilityScore(supplierId) {
  const stats = getSupplierStats(supplierId);
  if (!stats) return;

  // Calculate weighted score (0-100)
  const score = (
    (stats.reliability * 0.4) +
    (stats.avgConfidence * 100 * 0.3) +
    (stats.consistency * 0.2) +
    ((100 - stats.correctionRate) * 0.1)
  );

  const now = new Date().toISOString();

  run(`
    UPDATE supplier_templates 
    SET reliability_score = ?, last_assessment = ?
    WHERE id = ?
  `, [Math.round(score * 10) / 10, now, supplierId]);

  console.log(`[SupplierAnalytics] Updated score for ${stats.supplierName}: ${score.toFixed(1)}`);
}

/**
 * Update all supplier scores (batch operation)
 */
function updateAllReliabilityScores() {
  const templates = query('SELECT id FROM supplier_templates');
  for (const t of templates) {
    updateReliabilityScore(t.id);
  }
  console.log(`[SupplierAnalytics] Updated ${templates.length} supplier scores`);
}

/**
 * Record session completion (updates metrics)
 * @param {string} supplierId - Supplier template ID
 * @param {number} rowCount - Number of rows processed
 * @param {boolean} approved - Whether session was approved
 */
function recordSessionCompletion(supplierId, rowCount, approved) {
  try {
    const template = get('SELECT total_rows_processed FROM supplier_templates WHERE id = ?', [supplierId]);
    if (!template) return;

    const newTotal = (template.total_rows_processed || 0) + rowCount;
    run(
      'UPDATE supplier_templates SET total_rows_processed = ? WHERE id = ?',
      [newTotal, supplierId]
    );

    // Update reliability score after each session
    updateReliabilityScore(supplierId);
  } catch (e) {
    console.error('[SupplierAnalytics] Error recording completion:', e.message);
  }
}

/**
 * Record correction (updates metrics)
 * @param {string} supplierId - Supplier template ID
 * @param {number} correctionCount - Number of corrections
 */
function recordCorrections(supplierId, correctionCount) {
  try {
    const template = get('SELECT total_corrections FROM supplier_templates WHERE id = ?', [supplierId]);
    if (!template) return;

    const newTotal = (template.total_corrections || 0) + correctionCount;
    run(
      'UPDATE supplier_templates SET total_corrections = ? WHERE id = ?',
      [newTotal, supplierId]
    );
  } catch (e) {
    console.error('[SupplierAnalytics] Error recording corrections:', e.message);
  }
}

/**
 * Toggle auto-approve for a supplier
 * @param {string} supplierId - Supplier template ID
 * @param {boolean} enabled - Enable or disable
 */
function setAutoApprove(supplierId, enabled) {
  run(
    'UPDATE supplier_templates SET auto_approve_enabled = ? WHERE id = ?',
    [enabled ? 1 : 0, supplierId]
  );
}

// ============================================
// Helper Functions
// ============================================

function calculateGrade(reliability, avgConfidence, correctionRate) {
  // Weighted score
  const score = (reliability * 0.5) + (avgConfidence * 100 * 0.3) + ((100 - correctionRate) * 0.2);
  
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  return 'D';
}

function calculateTrend(confidences) {
  if (confidences.length < 3) return 'stable';

  const recent = confidences.slice(0, 3);
  const older = confidences.slice(3);

  if (older.length < 2) return 'stable';

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

  const diff = recentAvg - olderAvg;

  if (diff > 0.05) return 'improving';
  if (diff < -0.05) return 'declining';
  return 'stable';
}

// ============================================
// Exports
// ============================================

module.exports = {
  getSupplierStats,
  getAllSupplierRankings,
  suggestAutoApprove,
  detectAnomaly,
  updateReliabilityScore,
  updateAllReliabilityScores,
  recordSessionCompletion,
  recordCorrections,
  setAutoApprove,
  ensureSchema,
};
