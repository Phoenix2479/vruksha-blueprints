/**
 * Guest DNA & Affinity Engine - Niyam Hospitality (Max Lite)
 * Guest preferences, behavior patterns, affinities, personalization
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8949;
const SERVICE_NAME = 'guest_dna';

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) { app.use(express.static(uiPath)); }

app.get('/health', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME, mode: 'lite' }));

async function ensureTables() {
  const db = await initDb();
  
  db.run(`CREATE TABLE IF NOT EXISTS guest_preferences (
    id TEXT PRIMARY KEY, guest_id TEXT NOT NULL, preference_type TEXT NOT NULL,
    preference_key TEXT NOT NULL, preference_value TEXT, source TEXT DEFAULT 'manual',
    confidence REAL DEFAULT 1.0, last_confirmed TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guest_id, preference_type, preference_key)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS guest_behaviors (
    id TEXT PRIMARY KEY, guest_id TEXT NOT NULL, behavior_type TEXT NOT NULL,
    behavior_data TEXT, occurred_at TEXT, context TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS guest_affinities (
    id TEXT PRIMARY KEY, guest_id TEXT NOT NULL, affinity_type TEXT NOT NULL,
    affinity_value TEXT NOT NULL, score REAL DEFAULT 0.5, interactions INTEGER DEFAULT 0,
    last_interaction TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guest_id, affinity_type, affinity_value)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS guest_segments (
    id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, description TEXT,
    criteria TEXT NOT NULL, auto_assign INTEGER DEFAULT 1, priority INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS guest_segment_members (
    id TEXT PRIMARY KEY, guest_id TEXT NOT NULL, segment_id TEXT NOT NULL,
    assigned_at TEXT, assigned_by TEXT, source TEXT DEFAULT 'auto',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(guest_id, segment_id)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS personalization_rules (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, trigger_type TEXT NOT NULL,
    conditions TEXT NOT NULL, actions TEXT NOT NULL, priority INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS guest_interactions (
    id TEXT PRIMARY KEY, guest_id TEXT NOT NULL, interaction_type TEXT NOT NULL,
    channel TEXT, content TEXT, sentiment TEXT, staff_id TEXT,
    reservation_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  // Seed default segments
  const existing = get(`SELECT COUNT(*) as count FROM guest_segments`);
  if (!existing || existing.count === 0) {
    const segments = [
      { name: 'VIP', description: 'High-value guests', criteria: '{"total_spend": {"$gte": 100000}}' },
      { name: 'Frequent Guest', description: '5+ stays', criteria: '{"total_stays": {"$gte": 5}}' },
      { name: 'Business Traveler', description: 'Corporate bookings', criteria: '{"booking_source": "corporate"}' },
      { name: 'Leisure Guest', description: 'Weekend/holiday stays', criteria: '{"stay_pattern": "leisure"}' },
      { name: 'New Guest', description: 'First-time visitors', criteria: '{"total_stays": 1}' }
    ];
    for (const s of segments) {
      run(`INSERT INTO guest_segments (id, name, description, criteria, created_at) VALUES (?, ?, ?, ?, ?)`,
        [generateId(), s.name, s.description, s.criteria, timestamp()]);
    }
  }
  
  return db;
}

// GUEST DNA PROFILE
app.get('/profile/:guestId', async (req, res) => {
  try {
    await ensureTables();
    const { guestId } = req.params;
    
    // Get guest basic info
    const guest = get(`SELECT * FROM guests WHERE id = ?`, [guestId]);
    if (!guest) return res.status(404).json({ success: false, error: 'Guest not found' });
    
    // Get preferences
    const preferences = query(`SELECT * FROM guest_preferences WHERE guest_id = ?`, [guestId]);
    const prefsByType = {};
    for (const p of preferences) {
      if (!prefsByType[p.preference_type]) prefsByType[p.preference_type] = {};
      prefsByType[p.preference_type][p.preference_key] = { value: p.preference_value, confidence: p.confidence, source: p.source };
    }
    
    // Get affinities
    const affinities = query(`SELECT * FROM guest_affinities WHERE guest_id = ? ORDER BY score DESC`, [guestId]);
    
    // Get segments
    const segments = query(`SELECT gs.* FROM guest_segments gs JOIN guest_segment_members gsm ON gs.id = gsm.segment_id WHERE gsm.guest_id = ?`, [guestId]);
    
    // Get stay history stats
    const stayStats = get(`SELECT COUNT(*) as total_stays, SUM(total_amount) as total_spend, AVG(total_amount) as avg_spend FROM reservations WHERE guest_id = ? AND status = 'checked_out'`, [guestId]);
    
    // Get recent interactions
    const recentInteractions = query(`SELECT * FROM guest_interactions WHERE guest_id = ? ORDER BY created_at DESC LIMIT 10`, [guestId]);
    
    res.json({
      success: true,
      profile: {
        guest: { id: guest.id, name: guest.name, email: guest.email, phone: guest.phone, vip_level: guest.vip_level },
        preferences: prefsByType,
        affinities,
        segments: segments.map(s => s.name),
        stats: {
          total_stays: stayStats?.total_stays || 0,
          total_spend: stayStats?.total_spend || 0,
          avg_spend: Math.round(stayStats?.avg_spend || 0)
        },
        recent_interactions: recentInteractions
      }
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// PREFERENCES
app.get('/preferences/:guestId', async (req, res) => {
  try {
    await ensureTables();
    const { type } = req.query;
    let sql = `SELECT * FROM guest_preferences WHERE guest_id = ?`;
    const params = [req.params.guestId];
    if (type) { sql += ` AND preference_type = ?`; params.push(type); }
    sql += ` ORDER BY preference_type, preference_key`;
    res.json({ success: true, preferences: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/preferences/:guestId', async (req, res) => {
  try {
    await ensureTables();
    const { preferences } = req.body; // Array of { type, key, value, source }
    
    for (const p of preferences || []) {
      const id = generateId();
      run(`INSERT INTO guest_preferences (id, guest_id, preference_type, preference_key, preference_value, source, last_confirmed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(guest_id, preference_type, preference_key) DO UPDATE SET preference_value = ?, source = ?, last_confirmed = ?, confidence = MIN(1.0, confidence + 0.1)`,
        [id, req.params.guestId, p.type, p.key, p.value, p.source || 'manual', timestamp(), timestamp(), p.value, p.source || 'manual', timestamp()]);
    }
    
    res.json({ success: true, updated: preferences?.length || 0 });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete('/preferences/:guestId/:preferenceId', async (req, res) => {
  try {
    await ensureTables();
    run(`DELETE FROM guest_preferences WHERE id = ? AND guest_id = ?`, [req.params.preferenceId, req.params.guestId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// BEHAVIORS
app.post('/behaviors/:guestId', async (req, res) => {
  try {
    await ensureTables();
    const { behavior_type, behavior_data, context } = req.body;
    const id = generateId();
    run(`INSERT INTO guest_behaviors (id, guest_id, behavior_type, behavior_data, occurred_at, context, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, req.params.guestId, behavior_type, JSON.stringify(behavior_data), timestamp(), context, timestamp()]);
    
    // Update affinities based on behavior
    if (behavior_data?.category) {
      run(`INSERT INTO guest_affinities (id, guest_id, affinity_type, affinity_value, score, interactions, last_interaction, created_at) VALUES (?, ?, 'category', ?, 0.5, 1, ?, ?) ON CONFLICT(guest_id, affinity_type, affinity_value) DO UPDATE SET interactions = interactions + 1, score = MIN(1.0, score + 0.05), last_interaction = ?`,
        [generateId(), req.params.guestId, behavior_data.category, timestamp(), timestamp(), timestamp()]);
    }
    
    res.json({ success: true, behavior: { id } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/behaviors/:guestId', async (req, res) => {
  try {
    await ensureTables();
    const { type, limit = 50 } = req.query;
    let sql = `SELECT * FROM guest_behaviors WHERE guest_id = ?`;
    const params = [req.params.guestId];
    if (type) { sql += ` AND behavior_type = ?`; params.push(type); }
    sql += ` ORDER BY occurred_at DESC LIMIT ?`;
    params.push(parseInt(limit));
    res.json({ success: true, behaviors: query(sql, params).map(b => ({ ...b, behavior_data: JSON.parse(b.behavior_data || '{}') })) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// AFFINITIES
app.get('/affinities/:guestId', async (req, res) => {
  try {
    await ensureTables();
    const { type } = req.query;
    let sql = `SELECT * FROM guest_affinities WHERE guest_id = ?`;
    const params = [req.params.guestId];
    if (type) { sql += ` AND affinity_type = ?`; params.push(type); }
    sql += ` ORDER BY score DESC`;
    res.json({ success: true, affinities: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/affinities/:guestId', async (req, res) => {
  try {
    await ensureTables();
    const { affinity_type, affinity_value, score } = req.body;
    const id = generateId();
    run(`INSERT INTO guest_affinities (id, guest_id, affinity_type, affinity_value, score, interactions, last_interaction, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?) ON CONFLICT(guest_id, affinity_type, affinity_value) DO UPDATE SET score = ?, interactions = interactions + 1, last_interaction = ?`,
      [id, req.params.guestId, affinity_type, affinity_value, score || 0.5, timestamp(), timestamp(), score || 0.5, timestamp()]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// SEGMENTS
app.get('/segments', async (req, res) => {
  try {
    await ensureTables();
    const { active_only } = req.query;
    let sql = `SELECT gs.*, (SELECT COUNT(*) FROM guest_segment_members WHERE segment_id = gs.id) as member_count FROM guest_segments gs WHERE 1=1`;
    if (active_only === 'true') sql += ` AND gs.is_active = 1`;
    sql += ` ORDER BY gs.priority DESC, gs.name`;
    res.json({ success: true, segments: query(sql).map(s => ({ ...s, criteria: JSON.parse(s.criteria) })) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/segments', async (req, res) => {
  try {
    await ensureTables();
    const { name, description, criteria, auto_assign, priority } = req.body;
    const id = generateId();
    run(`INSERT INTO guest_segments (id, name, description, criteria, auto_assign, priority, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, name, description, JSON.stringify(criteria), auto_assign ? 1 : 0, priority || 0, timestamp()]);
    res.json({ success: true, segment: { id, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/segments/:guestId/membership', async (req, res) => {
  try {
    await ensureTables();
    const segments = query(`SELECT gs.*, gsm.assigned_at, gsm.source FROM guest_segments gs JOIN guest_segment_members gsm ON gs.id = gsm.segment_id WHERE gsm.guest_id = ?`, [req.params.guestId]);
    res.json({ success: true, segments });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/segments/:segmentId/assign', async (req, res) => {
  try {
    await ensureTables();
    const { guest_ids, assigned_by } = req.body;
    let count = 0;
    for (const guestId of guest_ids || []) {
      try {
        run(`INSERT INTO guest_segment_members (id, guest_id, segment_id, assigned_at, assigned_by, source, created_at) VALUES (?, ?, ?, ?, ?, 'manual', ?)`,
          [generateId(), guestId, req.params.segmentId, timestamp(), assigned_by, timestamp()]);
        count++;
      } catch (e) { /* duplicate */ }
    }
    res.json({ success: true, assigned: count });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// PERSONALIZATION RULES
app.get('/rules', async (req, res) => {
  try {
    await ensureTables();
    const rules = query(`SELECT * FROM personalization_rules WHERE is_active = 1 ORDER BY priority DESC`);
    res.json({ success: true, rules: rules.map(r => ({ ...r, conditions: JSON.parse(r.conditions), actions: JSON.parse(r.actions) })) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/rules', async (req, res) => {
  try {
    await ensureTables();
    const { name, trigger_type, conditions, actions, priority } = req.body;
    const id = generateId();
    run(`INSERT INTO personalization_rules (id, name, trigger_type, conditions, actions, priority, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, name, trigger_type, JSON.stringify(conditions), JSON.stringify(actions), priority || 0, timestamp()]);
    res.json({ success: true, rule: { id, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET RECOMMENDATIONS
app.get('/recommendations/:guestId', async (req, res) => {
  try {
    await ensureTables();
    const { context } = req.query; // e.g., 'check_in', 'dining', 'upsell'
    
    // Get guest profile
    const preferences = query(`SELECT * FROM guest_preferences WHERE guest_id = ?`, [req.params.guestId]);
    const affinities = query(`SELECT * FROM guest_affinities WHERE guest_id = ? ORDER BY score DESC LIMIT 10`, [req.params.guestId]);
    const segments = query(`SELECT gs.name FROM guest_segments gs JOIN guest_segment_members gsm ON gs.id = gsm.segment_id WHERE gsm.guest_id = ?`, [req.params.guestId]);
    
    const recommendations = [];
    
    // Room preferences
    const roomPrefs = preferences.filter(p => p.preference_type === 'room');
    if (roomPrefs.length > 0) {
      recommendations.push({
        type: 'room_setup',
        title: 'Room Preferences',
        items: roomPrefs.map(p => ({ key: p.preference_key, value: p.preference_value }))
      });
    }
    
    // F&B affinities
    const foodAffinities = affinities.filter(a => a.affinity_type === 'cuisine' || a.affinity_type === 'food');
    if (foodAffinities.length > 0) {
      recommendations.push({
        type: 'dining',
        title: 'Dining Suggestions',
        items: foodAffinities.map(a => ({ name: a.affinity_value, score: a.score }))
      });
    }
    
    // VIP treatment
    if (segments.some(s => s.name === 'VIP')) {
      recommendations.push({
        type: 'vip_amenities',
        title: 'VIP Amenities',
        items: [
          { name: 'Welcome amenity', action: 'prepare' },
          { name: 'Room upgrade if available', action: 'check' },
          { name: 'GM welcome note', action: 'prepare' }
        ]
      });
    }
    
    res.json({ success: true, guest_id: req.params.guestId, context, recommendations });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// INTERACTIONS
app.post('/interactions/:guestId', async (req, res) => {
  try {
    await ensureTables();
    const { interaction_type, channel, content, sentiment, staff_id, reservation_id } = req.body;
    const id = generateId();
    run(`INSERT INTO guest_interactions (id, guest_id, interaction_type, channel, content, sentiment, staff_id, reservation_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.params.guestId, interaction_type, channel, content, sentiment, staff_id, reservation_id, timestamp()]);
    res.json({ success: true, interaction: { id } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// STATS
app.get('/stats', async (req, res) => {
  try {
    await ensureTables();
    const guests = get(`SELECT COUNT(*) as count FROM guests`);
    const withPrefs = get(`SELECT COUNT(DISTINCT guest_id) as count FROM guest_preferences`);
    const segments = get(`SELECT COUNT(*) as count FROM guest_segments WHERE is_active = 1`);
    const rules = get(`SELECT COUNT(*) as count FROM personalization_rules WHERE is_active = 1`);
    
    res.json({
      success: true,
      stats: {
        total_guests: guests?.count || 0,
        guests_with_preferences: withPrefs?.count || 0,
        active_segments: segments?.count || 0,
        personalization_rules: rules?.count || 0
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
