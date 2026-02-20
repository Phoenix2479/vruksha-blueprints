/**
 * Compliance & Audit Service - Niyam Hospitality (Max Lite)
 * Audit trails, compliance checks, regulatory reporting
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8935;
const SERVICE_NAME = 'compliance_audit';

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) { app.use(express.static(uiPath)); }

app.get('/health', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME, mode: 'lite' }));

async function ensureTables() {
  const db = await initDb();
  
  db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT, action TEXT NOT NULL,
    old_values TEXT, new_values TEXT, changed_fields TEXT, user_id TEXT, user_name TEXT,
    ip_address TEXT, user_agent TEXT, module TEXT, notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS compliance_checks (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, category TEXT,
    check_type TEXT DEFAULT 'manual', frequency TEXT, last_checked TEXT,
    last_result TEXT, last_checked_by TEXT, is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS compliance_results (
    id TEXT PRIMARY KEY, check_id TEXT NOT NULL, check_date TEXT NOT NULL,
    result TEXT NOT NULL, score REAL, findings TEXT, evidence TEXT,
    checked_by TEXT, notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS compliance_issues (
    id TEXT PRIMARY KEY, check_id TEXT, title TEXT NOT NULL, description TEXT,
    severity TEXT DEFAULT 'medium', category TEXT, due_date TEXT, assigned_to TEXT,
    status TEXT DEFAULT 'open', resolution TEXT, resolved_by TEXT, resolved_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS regulatory_reports (
    id TEXT PRIMARY KEY, report_type TEXT NOT NULL, period_start TEXT, period_end TEXT,
    data TEXT, status TEXT DEFAULT 'draft', submitted_at TEXT, submitted_by TEXT,
    acknowledgment_number TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS data_retention_policies (
    id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, retention_days INTEGER NOT NULL,
    action TEXT DEFAULT 'archive', is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  return db;
}

// AUDIT LOGS
app.post('/audit', async (req, res) => {
  try {
    await ensureTables();
    const { entity_type, entity_id, action, old_values, new_values, changed_fields, user_id, user_name, ip_address, user_agent, module, notes } = req.body;
    const id = generateId();
    run(`INSERT INTO audit_logs (id, entity_type, entity_id, action, old_values, new_values, changed_fields, user_id, user_name, ip_address, user_agent, module, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, entity_type, entity_id, action, JSON.stringify(old_values), JSON.stringify(new_values), JSON.stringify(changed_fields), user_id, user_name, ip_address, user_agent, module, notes, timestamp()]);
    res.json({ success: true, audit_id: id });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/audit', async (req, res) => {
  try {
    await ensureTables();
    const { entity_type, entity_id, action, user_id, module, from_date, to_date, limit = 100 } = req.query;
    let sql = `SELECT * FROM audit_logs WHERE 1=1`;
    const params = [];
    if (entity_type) { sql += ` AND entity_type = ?`; params.push(entity_type); }
    if (entity_id) { sql += ` AND entity_id = ?`; params.push(entity_id); }
    if (action) { sql += ` AND action = ?`; params.push(action); }
    if (user_id) { sql += ` AND user_id = ?`; params.push(user_id); }
    if (module) { sql += ` AND module = ?`; params.push(module); }
    if (from_date) { sql += ` AND DATE(created_at) >= ?`; params.push(from_date); }
    if (to_date) { sql += ` AND DATE(created_at) <= ?`; params.push(to_date); }
    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(parseInt(limit));
    res.json({ success: true, logs: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/audit/entity/:entityType/:entityId', async (req, res) => {
  try {
    await ensureTables();
    const logs = query(`SELECT * FROM audit_logs WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC`,
      [req.params.entityType, req.params.entityId]);
    res.json({ success: true, logs });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// COMPLIANCE CHECKS
app.get('/checks', async (req, res) => {
  try {
    await ensureTables();
    const { category, active_only } = req.query;
    let sql = `SELECT * FROM compliance_checks WHERE 1=1`;
    const params = [];
    if (category) { sql += ` AND category = ?`; params.push(category); }
    if (active_only === 'true') { sql += ` AND is_active = 1`; }
    sql += ` ORDER BY category, name`;
    res.json({ success: true, checks: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/checks', async (req, res) => {
  try {
    await ensureTables();
    const { name, description, category, check_type, frequency } = req.body;
    const id = generateId();
    run(`INSERT INTO compliance_checks (id, name, description, category, check_type, frequency, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, name, description, category, check_type || 'manual', frequency, timestamp()]);
    res.json({ success: true, check: { id, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/checks/:id/result', async (req, res) => {
  try {
    await ensureTables();
    const { result, score, findings, evidence, checked_by, notes } = req.body;
    const resultId = generateId();
    run(`INSERT INTO compliance_results (id, check_id, check_date, result, score, findings, evidence, checked_by, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [resultId, req.params.id, timestamp(), result, score, JSON.stringify(findings || []), evidence, checked_by, notes, timestamp()]);
    
    run(`UPDATE compliance_checks SET last_checked = ?, last_result = ?, last_checked_by = ? WHERE id = ?`,
      [timestamp(), result, checked_by, req.params.id]);
    
    // Create issue if failed
    if (result === 'fail' || result === 'partial') {
      const check = get(`SELECT name, category FROM compliance_checks WHERE id = ?`, [req.params.id]);
      run(`INSERT INTO compliance_issues (id, check_id, title, description, severity, category, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
        [generateId(), req.params.id, `Compliance issue: ${check?.name}`, notes || 'Compliance check failed', result === 'fail' ? 'high' : 'medium', check?.category, timestamp()]);
    }
    
    res.json({ success: true, result_id: resultId });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/checks/:id/history', async (req, res) => {
  try {
    await ensureTables();
    const results = query(`SELECT * FROM compliance_results WHERE check_id = ? ORDER BY check_date DESC LIMIT 50`, [req.params.id]);
    res.json({ success: true, results });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// COMPLIANCE ISSUES
app.get('/issues', async (req, res) => {
  try {
    await ensureTables();
    const { status, severity, category } = req.query;
    let sql = `SELECT ci.*, cc.name as check_name FROM compliance_issues ci LEFT JOIN compliance_checks cc ON ci.check_id = cc.id WHERE 1=1`;
    const params = [];
    if (status) { sql += ` AND ci.status = ?`; params.push(status); }
    if (severity) { sql += ` AND ci.severity = ?`; params.push(severity); }
    if (category) { sql += ` AND ci.category = ?`; params.push(category); }
    sql += ` ORDER BY CASE ci.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, ci.created_at DESC`;
    res.json({ success: true, issues: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/issues', async (req, res) => {
  try {
    await ensureTables();
    const { check_id, title, description, severity, category, due_date, assigned_to } = req.body;
    const id = generateId();
    run(`INSERT INTO compliance_issues (id, check_id, title, description, severity, category, due_date, assigned_to, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
      [id, check_id, title, description, severity || 'medium', category, due_date, assigned_to, timestamp()]);
    res.json({ success: true, issue: { id, title } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/issues/:id/resolve', async (req, res) => {
  try {
    await ensureTables();
    const { resolution, resolved_by } = req.body;
    run(`UPDATE compliance_issues SET status = 'resolved', resolution = ?, resolved_by = ?, resolved_at = ? WHERE id = ?`,
      [resolution, resolved_by, timestamp(), req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// REGULATORY REPORTS
app.get('/reports', async (req, res) => {
  try {
    await ensureTables();
    const { report_type, status } = req.query;
    let sql = `SELECT * FROM regulatory_reports WHERE 1=1`;
    const params = [];
    if (report_type) { sql += ` AND report_type = ?`; params.push(report_type); }
    if (status) { sql += ` AND status = ?`; params.push(status); }
    sql += ` ORDER BY created_at DESC`;
    res.json({ success: true, reports: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/reports', async (req, res) => {
  try {
    await ensureTables();
    const { report_type, period_start, period_end, data } = req.body;
    const id = generateId();
    run(`INSERT INTO regulatory_reports (id, report_type, period_start, period_end, data, status, created_at) VALUES (?, ?, ?, ?, ?, 'draft', ?)`,
      [id, report_type, period_start, period_end, JSON.stringify(data || {}), timestamp()]);
    res.json({ success: true, report: { id, report_type } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/reports/:id/submit', async (req, res) => {
  try {
    await ensureTables();
    const { submitted_by, acknowledgment_number } = req.body;
    run(`UPDATE regulatory_reports SET status = 'submitted', submitted_at = ?, submitted_by = ?, acknowledgment_number = ? WHERE id = ?`,
      [timestamp(), submitted_by, acknowledgment_number, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// DATA RETENTION
app.get('/retention-policies', async (req, res) => {
  try {
    await ensureTables();
    res.json({ success: true, policies: query(`SELECT * FROM data_retention_policies WHERE is_active = 1`) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/retention-policies', async (req, res) => {
  try {
    await ensureTables();
    const { entity_type, retention_days, action } = req.body;
    const id = generateId();
    run(`INSERT INTO data_retention_policies (id, entity_type, retention_days, action, created_at) VALUES (?, ?, ?, ?, ?)`,
      [id, entity_type, retention_days, action || 'archive', timestamp()]);
    res.json({ success: true, policy: { id } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// DASHBOARD
app.get('/dashboard', async (req, res) => {
  try {
    await ensureTables();
    const openIssues = get(`SELECT COUNT(*) as count FROM compliance_issues WHERE status = 'open'`);
    const criticalIssues = get(`SELECT COUNT(*) as count FROM compliance_issues WHERE status = 'open' AND severity IN ('critical', 'high')`);
    const checksOverdue = get(`SELECT COUNT(*) as count FROM compliance_checks WHERE is_active = 1 AND last_checked < datetime('now', '-30 days')`);
    const recentAudits = get(`SELECT COUNT(*) as count FROM audit_logs WHERE created_at > datetime('now', '-24 hours')`);
    const passRate = get(`SELECT AVG(CASE WHEN result = 'pass' THEN 100 ELSE 0 END) as rate FROM compliance_results WHERE created_at > datetime('now', '-30 days')`);
    
    res.json({ success: true, dashboard: {
      open_issues: openIssues?.count || 0, critical_issues: criticalIssues?.count || 0,
      overdue_checks: checksOverdue?.count || 0, recent_audits: recentAudits?.count || 0,
      pass_rate: Math.round(passRate?.rate || 0)
    }});
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

async function start() {
  await ensureTables();
  app.get('*', (req, res) => {
    if (fs.existsSync(path.join(uiPath, 'index.html'))) res.sendFile(path.join(uiPath, 'index.html'));
    else res.json({ service: SERVICE_NAME, mode: 'lite', status: 'running' });
  });
  app.listen(PORT, () => console.log(`✅ ${SERVICE_NAME} (Lite) running on port ${PORT}`));
}

start();
