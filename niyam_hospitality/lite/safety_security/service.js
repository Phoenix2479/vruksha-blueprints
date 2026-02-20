/**
 * Safety & Security Service - Niyam Hospitality (Max Lite)
 * Incident reporting, access logs, lost & found, emergency management
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8945;
const SERVICE_NAME = 'safety_security';

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) { app.use(express.static(uiPath)); }

app.get('/health', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME, mode: 'lite' }));

async function ensureTables() {
  const db = await initDb();
  
  db.run(`CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY, incident_number TEXT UNIQUE, incident_type TEXT NOT NULL,
    severity TEXT DEFAULT 'medium', location TEXT, description TEXT,
    reported_by TEXT, reported_at TEXT, guest_id TEXT, room_number TEXT,
    witnesses TEXT, action_taken TEXT, status TEXT DEFAULT 'open',
    assigned_to TEXT, resolved_at TEXT, resolution_notes TEXT,
    police_report_number TEXT, insurance_claim_number TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS incident_updates (
    id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, update_text TEXT NOT NULL,
    updated_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS access_logs (
    id TEXT PRIMARY KEY, access_type TEXT NOT NULL, area TEXT, room_number TEXT,
    person_name TEXT, person_type TEXT, badge_number TEXT, entry_time TEXT,
    exit_time TEXT, purpose TEXT, authorized_by TEXT, notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS lost_found (
    id TEXT PRIMARY KEY, item_number TEXT UNIQUE, item_type TEXT NOT NULL,
    description TEXT NOT NULL, found_location TEXT, found_by TEXT, found_date TEXT,
    storage_location TEXT, owner_name TEXT, owner_contact TEXT, guest_id TEXT,
    claimed INTEGER DEFAULT 0, claimed_by TEXT, claimed_date TEXT,
    disposed INTEGER DEFAULT 0, disposed_date TEXT, disposal_method TEXT,
    status TEXT DEFAULT 'found', notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS key_management (
    id TEXT PRIMARY KEY, key_type TEXT NOT NULL, key_number TEXT NOT NULL,
    room_number TEXT, area TEXT, assigned_to TEXT, assigned_at TEXT,
    returned_at TEXT, status TEXT DEFAULT 'available', notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS emergency_contacts (
    id TEXT PRIMARY KEY, contact_type TEXT NOT NULL, name TEXT NOT NULL,
    phone TEXT NOT NULL, alternate_phone TEXT, email TEXT, address TEXT,
    notes TEXT, priority INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS safety_inspections (
    id TEXT PRIMARY KEY, inspection_type TEXT NOT NULL, area TEXT,
    inspector_name TEXT, inspection_date TEXT NOT NULL, findings TEXT,
    status TEXT DEFAULT 'pending', next_inspection_date TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS inspection_items (
    id TEXT PRIMARY KEY, inspection_id TEXT NOT NULL, item_name TEXT NOT NULL,
    result TEXT, notes TEXT, requires_action INTEGER DEFAULT 0,
    action_deadline TEXT, action_completed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  // Seed emergency contacts
  const existing = get(`SELECT COUNT(*) as count FROM emergency_contacts`);
  if (!existing || existing.count === 0) {
    const contacts = [
      { type: 'police', name: 'Local Police', phone: '100', priority: 1 },
      { type: 'fire', name: 'Fire Department', phone: '101', priority: 1 },
      { type: 'ambulance', name: 'Ambulance', phone: '102', priority: 1 },
      { type: 'hospital', name: 'Nearest Hospital', phone: '', priority: 2 }
    ];
    for (const c of contacts) {
      run(`INSERT INTO emergency_contacts (id, contact_type, name, phone, priority, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [generateId(), c.type, c.name, c.phone, c.priority, timestamp()]);
    }
  }
  
  return db;
}

// INCIDENTS
app.get('/incidents', async (req, res) => {
  try {
    await ensureTables();
    const { status, severity, incident_type, from_date, to_date, limit = 50 } = req.query;
    let sql = `SELECT * FROM incidents WHERE 1=1`;
    const params = [];
    if (status) { sql += ` AND status = ?`; params.push(status); }
    if (severity) { sql += ` AND severity = ?`; params.push(severity); }
    if (incident_type) { sql += ` AND incident_type = ?`; params.push(incident_type); }
    if (from_date) { sql += ` AND DATE(reported_at) >= ?`; params.push(from_date); }
    if (to_date) { sql += ` AND DATE(reported_at) <= ?`; params.push(to_date); }
    sql += ` ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, reported_at DESC LIMIT ?`;
    params.push(parseInt(limit));
    res.json({ success: true, incidents: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/incidents/:id', async (req, res) => {
  try {
    await ensureTables();
    const incident = get(`SELECT * FROM incidents WHERE id = ?`, [req.params.id]);
    if (!incident) return res.status(404).json({ success: false, error: 'Incident not found' });
    const updates = query(`SELECT * FROM incident_updates WHERE incident_id = ? ORDER BY created_at DESC`, [req.params.id]);
    res.json({ success: true, incident: { ...incident, witnesses: JSON.parse(incident.witnesses || '[]'), updates } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/incidents', async (req, res) => {
  try {
    await ensureTables();
    const { incident_type, severity, location, description, reported_by, guest_id, room_number, witnesses, action_taken, assigned_to } = req.body;
    const id = generateId();
    const incidentNumber = `INC${Date.now().toString(36).toUpperCase()}`;
    
    run(`INSERT INTO incidents (id, incident_number, incident_type, severity, location, description, reported_by, reported_at, guest_id, room_number, witnesses, action_taken, assigned_to, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
      [id, incidentNumber, incident_type, severity || 'medium', location, description, reported_by, timestamp(), guest_id, room_number, JSON.stringify(witnesses || []), action_taken, assigned_to, timestamp()]);
    
    res.json({ success: true, incident: { id, incident_number: incidentNumber } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/incidents/:id', async (req, res) => {
  try {
    await ensureTables();
    const { severity, status, action_taken, assigned_to, resolution_notes, police_report_number, insurance_claim_number } = req.body;
    
    const resolved_at = status === 'resolved' ? timestamp() : null;
    run(`UPDATE incidents SET severity = COALESCE(?, severity), status = COALESCE(?, status), action_taken = COALESCE(?, action_taken), assigned_to = COALESCE(?, assigned_to), resolution_notes = COALESCE(?, resolution_notes), police_report_number = COALESCE(?, police_report_number), insurance_claim_number = COALESCE(?, insurance_claim_number), resolved_at = COALESCE(?, resolved_at) WHERE id = ?`,
      [severity, status, action_taken, assigned_to, resolution_notes, police_report_number, insurance_claim_number, resolved_at, req.params.id]);
    
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/incidents/:id/updates', async (req, res) => {
  try {
    await ensureTables();
    const { update_text, updated_by } = req.body;
    const id = generateId();
    run(`INSERT INTO incident_updates (id, incident_id, update_text, updated_by, created_at) VALUES (?, ?, ?, ?, ?)`,
      [id, req.params.id, update_text, updated_by, timestamp()]);
    res.json({ success: true, update: { id } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ACCESS LOGS
app.get('/access-logs', async (req, res) => {
  try {
    await ensureTables();
    const { area, person_type, date, limit = 100 } = req.query;
    let sql = `SELECT * FROM access_logs WHERE 1=1`;
    const params = [];
    if (area) { sql += ` AND area = ?`; params.push(area); }
    if (person_type) { sql += ` AND person_type = ?`; params.push(person_type); }
    if (date) { sql += ` AND DATE(entry_time) = ?`; params.push(date); }
    sql += ` ORDER BY entry_time DESC LIMIT ?`;
    params.push(parseInt(limit));
    res.json({ success: true, logs: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/access-logs', async (req, res) => {
  try {
    await ensureTables();
    const { access_type, area, room_number, person_name, person_type, badge_number, entry_time, purpose, authorized_by, notes } = req.body;
    const id = generateId();
    run(`INSERT INTO access_logs (id, access_type, area, room_number, person_name, person_type, badge_number, entry_time, purpose, authorized_by, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, access_type, area, room_number, person_name, person_type, badge_number, entry_time || timestamp(), purpose, authorized_by, notes, timestamp()]);
    res.json({ success: true, log: { id } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/access-logs/:id/exit', async (req, res) => {
  try {
    await ensureTables();
    const { exit_time, notes } = req.body;
    run(`UPDATE access_logs SET exit_time = ?, notes = COALESCE(?, notes) WHERE id = ?`,
      [exit_time || timestamp(), notes, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// LOST & FOUND
app.get('/lost-found', async (req, res) => {
  try {
    await ensureTables();
    const { status, item_type, limit = 50 } = req.query;
    let sql = `SELECT * FROM lost_found WHERE 1=1`;
    const params = [];
    if (status) { sql += ` AND status = ?`; params.push(status); }
    if (item_type) { sql += ` AND item_type = ?`; params.push(item_type); }
    sql += ` ORDER BY found_date DESC LIMIT ?`;
    params.push(parseInt(limit));
    res.json({ success: true, items: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/lost-found', async (req, res) => {
  try {
    await ensureTables();
    const { item_type, description, found_location, found_by, found_date, storage_location, notes } = req.body;
    const id = generateId();
    const itemNumber = `LF${Date.now().toString(36).toUpperCase()}`;
    
    run(`INSERT INTO lost_found (id, item_number, item_type, description, found_location, found_by, found_date, storage_location, notes, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'found', ?)`,
      [id, itemNumber, item_type, description, found_location, found_by, found_date || timestamp(), storage_location, notes, timestamp()]);
    
    res.json({ success: true, item: { id, item_number: itemNumber } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/lost-found/:id/claim', async (req, res) => {
  try {
    await ensureTables();
    const { claimed_by, owner_name, owner_contact, guest_id } = req.body;
    run(`UPDATE lost_found SET claimed = 1, claimed_by = ?, claimed_date = ?, owner_name = ?, owner_contact = ?, guest_id = ?, status = 'claimed' WHERE id = ?`,
      [claimed_by, timestamp(), owner_name, owner_contact, guest_id, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/lost-found/:id/dispose', async (req, res) => {
  try {
    await ensureTables();
    const { disposal_method, notes } = req.body;
    run(`UPDATE lost_found SET disposed = 1, disposed_date = ?, disposal_method = ?, notes = COALESCE(?, notes), status = 'disposed' WHERE id = ?`,
      [timestamp(), disposal_method, notes, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// KEY MANAGEMENT
app.get('/keys', async (req, res) => {
  try {
    await ensureTables();
    const { status, key_type } = req.query;
    let sql = `SELECT * FROM key_management WHERE 1=1`;
    const params = [];
    if (status) { sql += ` AND status = ?`; params.push(status); }
    if (key_type) { sql += ` AND key_type = ?`; params.push(key_type); }
    sql += ` ORDER BY key_number`;
    res.json({ success: true, keys: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/keys', async (req, res) => {
  try {
    await ensureTables();
    const { key_type, key_number, room_number, area, notes } = req.body;
    const id = generateId();
    run(`INSERT INTO key_management (id, key_type, key_number, room_number, area, status, notes, created_at) VALUES (?, ?, ?, ?, ?, 'available', ?, ?)`,
      [id, key_type, key_number, room_number, area, notes, timestamp()]);
    res.json({ success: true, key: { id, key_number } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/keys/:id/assign', async (req, res) => {
  try {
    await ensureTables();
    const { assigned_to, notes } = req.body;
    run(`UPDATE key_management SET assigned_to = ?, assigned_at = ?, status = 'assigned', notes = COALESCE(?, notes) WHERE id = ?`,
      [assigned_to, timestamp(), notes, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/keys/:id/return', async (req, res) => {
  try {
    await ensureTables();
    const { notes } = req.body;
    run(`UPDATE key_management SET assigned_to = NULL, returned_at = ?, status = 'available', notes = COALESCE(?, notes) WHERE id = ?`,
      [timestamp(), notes, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// EMERGENCY CONTACTS
app.get('/emergency-contacts', async (req, res) => {
  try {
    await ensureTables();
    res.json({ success: true, contacts: query(`SELECT * FROM emergency_contacts WHERE is_active = 1 ORDER BY priority, contact_type`) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/emergency-contacts', async (req, res) => {
  try {
    await ensureTables();
    const { contact_type, name, phone, alternate_phone, email, address, notes, priority } = req.body;
    const id = generateId();
    run(`INSERT INTO emergency_contacts (id, contact_type, name, phone, alternate_phone, email, address, notes, priority, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, contact_type, name, phone, alternate_phone, email, address, notes, priority || 0, timestamp()]);
    res.json({ success: true, contact: { id, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// SAFETY INSPECTIONS
app.get('/inspections', async (req, res) => {
  try {
    await ensureTables();
    const { status, inspection_type } = req.query;
    let sql = `SELECT * FROM safety_inspections WHERE 1=1`;
    const params = [];
    if (status) { sql += ` AND status = ?`; params.push(status); }
    if (inspection_type) { sql += ` AND inspection_type = ?`; params.push(inspection_type); }
    sql += ` ORDER BY inspection_date DESC`;
    res.json({ success: true, inspections: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/inspections', async (req, res) => {
  try {
    await ensureTables();
    const { inspection_type, area, inspector_name, inspection_date, findings, next_inspection_date, items } = req.body;
    const id = generateId();
    
    run(`INSERT INTO safety_inspections (id, inspection_type, area, inspector_name, inspection_date, findings, status, next_inspection_date, created_at) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?)`,
      [id, inspection_type, area, inspector_name, inspection_date || timestamp(), findings, next_inspection_date, timestamp()]);
    
    // Add inspection items
    for (const item of items || []) {
      run(`INSERT INTO inspection_items (id, inspection_id, item_name, result, notes, requires_action, action_deadline, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), id, item.item_name, item.result, item.notes, item.requires_action ? 1 : 0, item.action_deadline, timestamp()]);
    }
    
    res.json({ success: true, inspection: { id } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// STATS
app.get('/stats', async (req, res) => {
  try {
    await ensureTables();
    const openIncidents = get(`SELECT COUNT(*) as count FROM incidents WHERE status = 'open'`);
    const criticalIncidents = get(`SELECT COUNT(*) as count FROM incidents WHERE status = 'open' AND severity IN ('critical', 'high')`);
    const unclaimedItems = get(`SELECT COUNT(*) as count FROM lost_found WHERE status = 'found'`);
    const assignedKeys = get(`SELECT COUNT(*) as count FROM key_management WHERE status = 'assigned'`);
    const todayAccessLogs = get(`SELECT COUNT(*) as count FROM access_logs WHERE DATE(entry_time) = DATE('now')`);
    const pendingInspections = get(`SELECT COUNT(*) as count FROM safety_inspections WHERE next_inspection_date <= DATE('now', '+7 days')`);
    
    res.json({
      success: true,
      stats: {
        open_incidents: openIncidents?.count || 0,
        critical_incidents: criticalIncidents?.count || 0,
        unclaimed_items: unclaimedItems?.count || 0,
        assigned_keys: assignedKeys?.count || 0,
        today_access_logs: todayAccessLogs?.count || 0,
        upcoming_inspections: pendingInspections?.count || 0
      }
    });
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
