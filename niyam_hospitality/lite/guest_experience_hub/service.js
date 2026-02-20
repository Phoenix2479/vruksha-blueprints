/**
 * Guest Experience Hub Service - Niyam Hospitality (Max Lite)
 * Central guest journey management, touchpoints, experience tracking
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8923;
const SERVICE_NAME = 'guest_experience_hub';

app.use(cors());
app.use(express.json());

// Serve UI
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) {
  app.use(express.static(uiPath));
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: SERVICE_NAME, mode: 'lite' });
});

// ============================================
// ADDITIONAL TABLES
// ============================================

async function ensureTables() {
  const db = await initDb();
  
  // Guest journey stages
  db.run(`
    CREATE TABLE IF NOT EXISTS journey_stages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      stage_order INTEGER DEFAULT 0,
      icon TEXT,
      color TEXT DEFAULT '#3b82f6',
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Touchpoints (interaction points)
  db.run(`
    CREATE TABLE IF NOT EXISTS touchpoints (
      id TEXT PRIMARY KEY,
      stage_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      touchpoint_type TEXT DEFAULT 'physical',
      location TEXT,
      department TEXT,
      is_critical INTEGER DEFAULT 0,
      target_satisfaction REAL DEFAULT 4.0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Guest touchpoint interactions
  db.run(`
    CREATE TABLE IF NOT EXISTS touchpoint_interactions (
      id TEXT PRIMARY KEY,
      guest_id TEXT NOT NULL,
      reservation_id TEXT,
      touchpoint_id TEXT NOT NULL,
      interaction_time TEXT DEFAULT CURRENT_TIMESTAMP,
      satisfaction_score INTEGER,
      feedback TEXT,
      staff_id TEXT,
      duration_minutes INTEGER,
      issues TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Experience scores
  db.run(`
    CREATE TABLE IF NOT EXISTS experience_scores (
      id TEXT PRIMARY KEY,
      guest_id TEXT NOT NULL,
      reservation_id TEXT,
      overall_score REAL,
      nps_score INTEGER,
      category_scores TEXT,
      survey_responses TEXT,
      collected_at TEXT DEFAULT CURRENT_TIMESTAMP,
      source TEXT DEFAULT 'survey'
    )
  `);
  
  // Guest preferences
  db.run(`
    CREATE TABLE IF NOT EXISTS guest_preferences (
      id TEXT PRIMARY KEY,
      guest_id TEXT NOT NULL,
      preference_category TEXT NOT NULL,
      preference_key TEXT NOT NULL,
      preference_value TEXT,
      source TEXT DEFAULT 'direct',
      confidence REAL DEFAULT 1.0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(guest_id, preference_category, preference_key)
    )
  `);
  
  // Service recovery cases
  db.run(`
    CREATE TABLE IF NOT EXISTS service_recovery (
      id TEXT PRIMARY KEY,
      guest_id TEXT NOT NULL,
      reservation_id TEXT,
      issue_type TEXT NOT NULL,
      issue_description TEXT,
      severity TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'open',
      assigned_to TEXT,
      resolution TEXT,
      compensation_offered TEXT,
      compensation_value REAL DEFAULT 0,
      guest_satisfied INTEGER,
      opened_at TEXT DEFAULT CURRENT_TIMESTAMP,
      resolved_at TEXT
    )
  `);
  
  // Seed default journey stages
  const existingStages = get(`SELECT COUNT(*) as count FROM journey_stages`);
  if (!existingStages || existingStages.count === 0) {
    const defaultStages = [
      { name: 'Pre-Arrival', order: 1, icon: '📋', color: '#8b5cf6' },
      { name: 'Arrival', order: 2, icon: '🚗', color: '#3b82f6' },
      { name: 'Check-In', order: 3, icon: '🔑', color: '#10b981' },
      { name: 'Stay', order: 4, icon: '🏨', color: '#f59e0b' },
      { name: 'Check-Out', order: 5, icon: '👋', color: '#ef4444' },
      { name: 'Post-Stay', order: 6, icon: '📧', color: '#6366f1' }
    ];
    
    for (const stage of defaultStages) {
      run(`INSERT INTO journey_stages (id, name, stage_order, icon, color, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [generateId(), stage.name, stage.order, stage.icon, stage.color, timestamp()]);
    }
  }
  
  return db;
}

// ============================================
// JOURNEY STAGES
// ============================================

app.get('/stages', async (req, res) => {
  try {
    await ensureTables();
    const stages = query(`SELECT * FROM journey_stages WHERE active = 1 ORDER BY stage_order`);
    res.json({ success: true, stages });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/stages', async (req, res) => {
  try {
    await ensureTables();
    const { name, description, stage_order, icon, color } = req.body;
    
    const id = generateId();
    run(`INSERT INTO journey_stages (id, name, description, stage_order, icon, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, name, description, stage_order || 0, icon, color || '#3b82f6', timestamp()]);
    
    res.json({ success: true, stage: { id, name } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// TOUCHPOINTS
// ============================================

app.get('/touchpoints', async (req, res) => {
  try {
    await ensureTables();
    const { stage_id, department } = req.query;
    
    let sql = `SELECT t.*, s.name as stage_name FROM touchpoints t LEFT JOIN journey_stages s ON t.stage_id = s.id WHERE t.active = 1`;
    const params = [];
    
    if (stage_id) {
      sql += ` AND t.stage_id = ?`;
      params.push(stage_id);
    }
    if (department) {
      sql += ` AND t.department = ?`;
      params.push(department);
    }
    
    sql += ` ORDER BY s.stage_order, t.name`;
    
    const touchpoints = query(sql, params);
    res.json({ success: true, touchpoints });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/touchpoints', async (req, res) => {
  try {
    await ensureTables();
    const { stage_id, name, description, touchpoint_type, location, department, is_critical, target_satisfaction } = req.body;
    
    const id = generateId();
    run(`
      INSERT INTO touchpoints (id, stage_id, name, description, touchpoint_type, location, department, is_critical, target_satisfaction, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, stage_id, name, description, touchpoint_type || 'physical', location, department, is_critical ? 1 : 0, target_satisfaction || 4.0, timestamp()]);
    
    res.json({ success: true, touchpoint: { id, name } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// TOUCHPOINT INTERACTIONS
// ============================================

app.post('/interactions', async (req, res) => {
  try {
    await ensureTables();
    const { guest_id, reservation_id, touchpoint_id, satisfaction_score, feedback, staff_id, duration_minutes, issues } = req.body;
    
    const id = generateId();
    run(`
      INSERT INTO touchpoint_interactions (id, guest_id, reservation_id, touchpoint_id, satisfaction_score, feedback, staff_id, duration_minutes, issues, interaction_time, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, guest_id, reservation_id, touchpoint_id, satisfaction_score, feedback, staff_id, duration_minutes, issues, timestamp(), timestamp()]);
    
    // If low satisfaction, create service recovery case
    if (satisfaction_score && satisfaction_score <= 2) {
      run(`
        INSERT INTO service_recovery (id, guest_id, reservation_id, issue_type, issue_description, severity, status, opened_at)
        VALUES (?, ?, ?, 'low_satisfaction', ?, 'high', 'open', ?)
      `, [generateId(), guest_id, reservation_id, feedback || 'Low satisfaction score at touchpoint', timestamp()]);
    }
    
    res.json({ success: true, interaction: { id } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/interactions', async (req, res) => {
  try {
    await ensureTables();
    const { guest_id, reservation_id, touchpoint_id, limit = 50 } = req.query;
    
    let sql = `
      SELECT i.*, t.name as touchpoint_name, t.department
      FROM touchpoint_interactions i
      JOIN touchpoints t ON i.touchpoint_id = t.id
      WHERE 1=1
    `;
    const params = [];
    
    if (guest_id) { sql += ` AND i.guest_id = ?`; params.push(guest_id); }
    if (reservation_id) { sql += ` AND i.reservation_id = ?`; params.push(reservation_id); }
    if (touchpoint_id) { sql += ` AND i.touchpoint_id = ?`; params.push(touchpoint_id); }
    
    sql += ` ORDER BY i.interaction_time DESC LIMIT ?`;
    params.push(parseInt(limit));
    
    const interactions = query(sql, params);
    res.json({ success: true, interactions });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// GUEST JOURNEY VIEW
// ============================================

app.get('/guests/:guestId/journey', async (req, res) => {
  try {
    await ensureTables();
    const { guestId } = req.params;
    const { reservation_id } = req.query;
    
    let interactionSql = `
      SELECT i.*, t.name as touchpoint_name, t.stage_id, s.name as stage_name, s.stage_order
      FROM touchpoint_interactions i
      JOIN touchpoints t ON i.touchpoint_id = t.id
      LEFT JOIN journey_stages s ON t.stage_id = s.id
      WHERE i.guest_id = ?
    `;
    const params = [guestId];
    
    if (reservation_id) {
      interactionSql += ` AND i.reservation_id = ?`;
      params.push(reservation_id);
    }
    
    interactionSql += ` ORDER BY s.stage_order, i.interaction_time`;
    
    const interactions = query(interactionSql, params);
    
    // Group by stage
    const stages = query(`SELECT * FROM journey_stages WHERE active = 1 ORDER BY stage_order`);
    const journey = stages.map(stage => ({
      ...stage,
      interactions: interactions.filter(i => i.stage_id === stage.id),
      avg_satisfaction: interactions.filter(i => i.stage_id === stage.id && i.satisfaction_score)
        .reduce((sum, i, _, arr) => sum + i.satisfaction_score / arr.length, 0) || null
    }));
    
    // Overall stats
    const avgScore = interactions.filter(i => i.satisfaction_score)
      .reduce((sum, i, _, arr) => sum + i.satisfaction_score / arr.length, 0) || null;
    
    res.json({
      success: true,
      journey,
      summary: {
        total_touchpoints: interactions.length,
        avg_satisfaction: avgScore ? Math.round(avgScore * 10) / 10 : null,
        issues_count: interactions.filter(i => i.issues).length
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// EXPERIENCE SCORES / NPS
// ============================================

app.post('/scores', async (req, res) => {
  try {
    await ensureTables();
    const { guest_id, reservation_id, overall_score, nps_score, category_scores, survey_responses, source } = req.body;
    
    const id = generateId();
    run(`
      INSERT INTO experience_scores (id, guest_id, reservation_id, overall_score, nps_score, category_scores, survey_responses, source, collected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, guest_id, reservation_id, overall_score, nps_score, JSON.stringify(category_scores || {}), JSON.stringify(survey_responses || {}), source || 'survey', timestamp()]);
    
    res.json({ success: true, score: { id } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/scores/nps', async (req, res) => {
  try {
    await ensureTables();
    const { days = 30 } = req.query;
    
    const scores = query(`
      SELECT nps_score FROM experience_scores
      WHERE nps_score IS NOT NULL AND collected_at > datetime('now', '-${parseInt(days)} days')
    `);
    
    const promoters = scores.filter(s => s.nps_score >= 9).length;
    const detractors = scores.filter(s => s.nps_score <= 6).length;
    const total = scores.length;
    
    const nps = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : null;
    
    res.json({
      success: true,
      nps: {
        score: nps,
        promoters,
        passives: total - promoters - detractors,
        detractors,
        total_responses: total
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// GUEST PREFERENCES
// ============================================

app.get('/guests/:guestId/preferences', async (req, res) => {
  try {
    await ensureTables();
    const preferences = query(`SELECT * FROM guest_preferences WHERE guest_id = ? ORDER BY preference_category`, [req.params.guestId]);
    
    // Group by category
    const grouped = {};
    preferences.forEach(p => {
      if (!grouped[p.preference_category]) grouped[p.preference_category] = {};
      grouped[p.preference_category][p.preference_key] = p.preference_value;
    });
    
    res.json({ success: true, preferences: grouped, raw: preferences });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/guests/:guestId/preferences', async (req, res) => {
  try {
    await ensureTables();
    const { guestId } = req.params;
    const { category, key, value, source } = req.body;
    
    run(`
      INSERT OR REPLACE INTO guest_preferences (id, guest_id, preference_category, preference_key, preference_value, source, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [generateId(), guestId, category, key, value, source || 'direct', timestamp()]);
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// SERVICE RECOVERY
// ============================================

app.get('/recovery', async (req, res) => {
  try {
    await ensureTables();
    const { status, severity } = req.query;
    
    let sql = `SELECT sr.*, g.first_name, g.last_name, g.email FROM service_recovery sr LEFT JOIN guests g ON sr.guest_id = g.id WHERE 1=1`;
    const params = [];
    
    if (status) { sql += ` AND sr.status = ?`; params.push(status); }
    if (severity) { sql += ` AND sr.severity = ?`; params.push(severity); }
    
    sql += ` ORDER BY CASE sr.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, sr.opened_at DESC`;
    
    const cases = query(sql, params);
    res.json({ success: true, cases });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/recovery', async (req, res) => {
  try {
    await ensureTables();
    const { guest_id, reservation_id, issue_type, issue_description, severity, assigned_to } = req.body;
    
    const id = generateId();
    run(`
      INSERT INTO service_recovery (id, guest_id, reservation_id, issue_type, issue_description, severity, assigned_to, status, opened_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)
    `, [id, guest_id, reservation_id, issue_type, issue_description, severity || 'medium', assigned_to, timestamp()]);
    
    res.json({ success: true, case: { id } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/recovery/:id/resolve', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { resolution, compensation_offered, compensation_value, guest_satisfied } = req.body;
    
    run(`
      UPDATE service_recovery SET
        status = 'resolved',
        resolution = ?,
        compensation_offered = ?,
        compensation_value = ?,
        guest_satisfied = ?,
        resolved_at = ?
      WHERE id = ?
    `, [resolution, compensation_offered, compensation_value || 0, guest_satisfied, timestamp(), id]);
    
    res.json({ success: true, message: 'Case resolved' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// DASHBOARD
// ============================================

app.get('/dashboard', async (req, res) => {
  try {
    await ensureTables();
    
    const today = new Date().toISOString().split('T')[0];
    
    // Today's interactions
    const todayInteractions = get(`SELECT COUNT(*) as count, AVG(satisfaction_score) as avg FROM touchpoint_interactions WHERE DATE(interaction_time) = ?`, [today]);
    
    // Open recovery cases
    const openCases = get(`SELECT COUNT(*) as count FROM service_recovery WHERE status = 'open'`);
    
    // NPS (last 30 days)
    const npsScores = query(`SELECT nps_score FROM experience_scores WHERE nps_score IS NOT NULL AND collected_at > datetime('now', '-30 days')`);
    const promoters = npsScores.filter(s => s.nps_score >= 9).length;
    const detractors = npsScores.filter(s => s.nps_score <= 6).length;
    const nps = npsScores.length > 0 ? Math.round(((promoters - detractors) / npsScores.length) * 100) : null;
    
    // Touchpoint performance
    const touchpointPerf = query(`
      SELECT t.name, t.department, AVG(i.satisfaction_score) as avg_score, COUNT(i.id) as interaction_count
      FROM touchpoints t
      LEFT JOIN touchpoint_interactions i ON t.id = i.touchpoint_id AND i.interaction_time > datetime('now', '-7 days')
      WHERE t.active = 1
      GROUP BY t.id
      ORDER BY avg_score ASC
      LIMIT 10
    `);
    
    res.json({
      success: true,
      dashboard: {
        today: {
          interactions: todayInteractions?.count || 0,
          avg_satisfaction: todayInteractions?.avg ? Math.round(todayInteractions.avg * 10) / 10 : null
        },
        open_recovery_cases: openCases?.count || 0,
        nps: { score: nps, responses: npsScores.length },
        touchpoint_performance: touchpointPerf
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// STARTUP
// ============================================

async function start() {
  await ensureTables();
  
  app.get('*', (req, res) => {
    if (fs.existsSync(path.join(uiPath, 'index.html'))) {
      res.sendFile(path.join(uiPath, 'index.html'));
    } else {
      res.json({ service: SERVICE_NAME, mode: 'lite', status: 'running' });
    }
  });
  
  app.listen(PORT, () => {
    console.log(`✅ ${SERVICE_NAME} (Lite) running on port ${PORT}`);
  });
}

start();
