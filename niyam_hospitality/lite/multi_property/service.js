/**
 * Multi-Property Service - Niyam Hospitality (Max Lite)
 * Chain/group management, cross-property reporting, central operations
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8946;
const SERVICE_NAME = 'multi_property';

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) { app.use(express.static(uiPath)); }

app.get('/health', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME, mode: 'lite' }));

async function ensureTables() {
  const db = await initDb();
  
  db.run(`CREATE TABLE IF NOT EXISTS hotel_chain (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, legal_name TEXT, logo_url TEXT,
    website TEXT, headquarters_address TEXT, contact_email TEXT, contact_phone TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS properties (
    id TEXT PRIMARY KEY, chain_id TEXT, property_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL, property_type TEXT DEFAULT 'hotel', star_rating INTEGER,
    address TEXT, city TEXT, state TEXT, country TEXT, timezone TEXT,
    total_rooms INTEGER DEFAULT 0, currency TEXT DEFAULT 'INR',
    gm_name TEXT, gm_email TEXT, gm_phone TEXT, status TEXT DEFAULT 'active',
    api_endpoint TEXT, api_key TEXT, last_sync_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS property_groups (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS property_group_members (
    id TEXT PRIMARY KEY, group_id TEXT NOT NULL, property_id TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(group_id, property_id)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS consolidated_stats (
    id TEXT PRIMARY KEY, property_id TEXT NOT NULL, stat_date TEXT NOT NULL,
    rooms_available INTEGER, rooms_sold INTEGER, revenue REAL, adr REAL,
    revpar REAL, occupancy REAL, arrivals INTEGER, departures INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(property_id, stat_date)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS cross_property_bookings (
    id TEXT PRIMARY KEY, original_property_id TEXT NOT NULL, target_property_id TEXT NOT NULL,
    guest_id TEXT, guest_name TEXT, guest_email TEXT, check_in TEXT, check_out TEXT,
    room_type TEXT, status TEXT DEFAULT 'pending', notes TEXT, transferred_at TEXT,
    transferred_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS central_rate_plans (
    id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
    description TEXT, base_rate REAL, applicable_properties TEXT,
    valid_from TEXT, valid_to TEXT, is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS corporate_accounts (
    id TEXT PRIMARY KEY, account_code TEXT UNIQUE NOT NULL, company_name TEXT NOT NULL,
    contact_name TEXT, email TEXT, phone TEXT, address TEXT,
    discount_type TEXT DEFAULT 'percentage', discount_value REAL DEFAULT 0,
    credit_limit REAL DEFAULT 0, payment_terms TEXT, applicable_properties TEXT,
    is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS chain_announcements (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT, priority TEXT DEFAULT 'normal',
    target_properties TEXT, published_at TEXT, expires_at TEXT, published_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  return db;
}

// CHAIN INFO
app.get('/chain', async (req, res) => {
  try {
    await ensureTables();
    let chain = get(`SELECT * FROM hotel_chain LIMIT 1`);
    if (!chain) {
      const id = generateId();
      run(`INSERT INTO hotel_chain (id, name, created_at) VALUES (?, 'My Hotel Group', ?)`, [id, timestamp()]);
      chain = get(`SELECT * FROM hotel_chain WHERE id = ?`, [id]);
    }
    res.json({ success: true, chain });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/chain', async (req, res) => {
  try {
    await ensureTables();
    const { name, legal_name, logo_url, website, headquarters_address, contact_email, contact_phone } = req.body;
    run(`UPDATE hotel_chain SET name = COALESCE(?, name), legal_name = COALESCE(?, legal_name), logo_url = COALESCE(?, logo_url), website = COALESCE(?, website), headquarters_address = COALESCE(?, headquarters_address), contact_email = COALESCE(?, contact_email), contact_phone = COALESCE(?, contact_phone)`,
      [name, legal_name, logo_url, website, headquarters_address, contact_email, contact_phone]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// PROPERTIES
app.get('/properties', async (req, res) => {
  try {
    await ensureTables();
    const { status, country, city } = req.query;
    let sql = `SELECT p.*, (SELECT SUM(revenue) FROM consolidated_stats WHERE property_id = p.id AND stat_date >= date('now', '-30 days')) as revenue_30d FROM properties p WHERE 1=1`;
    const params = [];
    if (status) { sql += ` AND p.status = ?`; params.push(status); }
    if (country) { sql += ` AND p.country = ?`; params.push(country); }
    if (city) { sql += ` AND p.city = ?`; params.push(city); }
    sql += ` ORDER BY p.name`;
    res.json({ success: true, properties: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/properties/:id', async (req, res) => {
  try {
    await ensureTables();
    const property = get(`SELECT * FROM properties WHERE id = ?`, [req.params.id]);
    if (!property) return res.status(404).json({ success: false, error: 'Property not found' });
    
    // Get recent stats
    const stats = query(`SELECT * FROM consolidated_stats WHERE property_id = ? ORDER BY stat_date DESC LIMIT 30`, [req.params.id]);
    
    // Get groups
    const groups = query(`SELECT pg.* FROM property_groups pg JOIN property_group_members pgm ON pg.id = pgm.group_id WHERE pgm.property_id = ?`, [req.params.id]);
    
    res.json({ success: true, property: { ...property, recent_stats: stats, groups } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/properties', async (req, res) => {
  try {
    await ensureTables();
    const chain = get(`SELECT id FROM hotel_chain LIMIT 1`);
    const { property_code, name, property_type, star_rating, address, city, state, country, timezone, total_rooms, currency, gm_name, gm_email, gm_phone, api_endpoint, api_key } = req.body;
    
    const id = generateId();
    run(`INSERT INTO properties (id, chain_id, property_code, name, property_type, star_rating, address, city, state, country, timezone, total_rooms, currency, gm_name, gm_email, gm_phone, api_endpoint, api_key, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      [id, chain?.id, property_code, name, property_type || 'hotel', star_rating, address, city, state, country, timezone, total_rooms || 0, currency || 'INR', gm_name, gm_email, gm_phone, api_endpoint, api_key, timestamp()]);
    
    res.json({ success: true, property: { id, property_code, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/properties/:id', async (req, res) => {
  try {
    await ensureTables();
    const { name, property_type, star_rating, address, city, state, country, timezone, total_rooms, currency, gm_name, gm_email, gm_phone, api_endpoint, api_key, status } = req.body;
    run(`UPDATE properties SET name = COALESCE(?, name), property_type = COALESCE(?, property_type), star_rating = COALESCE(?, star_rating), address = COALESCE(?, address), city = COALESCE(?, city), state = COALESCE(?, state), country = COALESCE(?, country), timezone = COALESCE(?, timezone), total_rooms = COALESCE(?, total_rooms), currency = COALESCE(?, currency), gm_name = COALESCE(?, gm_name), gm_email = COALESCE(?, gm_email), gm_phone = COALESCE(?, gm_phone), api_endpoint = COALESCE(?, api_endpoint), api_key = COALESCE(?, api_key), status = COALESCE(?, status) WHERE id = ?`,
      [name, property_type, star_rating, address, city, state, country, timezone, total_rooms, currency, gm_name, gm_email, gm_phone, api_endpoint, api_key, status, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// PROPERTY GROUPS
app.get('/groups', async (req, res) => {
  try {
    await ensureTables();
    const groups = query(`SELECT pg.*, COUNT(pgm.property_id) as property_count FROM property_groups pg LEFT JOIN property_group_members pgm ON pg.id = pgm.group_id GROUP BY pg.id ORDER BY pg.name`);
    res.json({ success: true, groups });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/groups', async (req, res) => {
  try {
    await ensureTables();
    const { name, description, property_ids } = req.body;
    const id = generateId();
    run(`INSERT INTO property_groups (id, name, description, created_at) VALUES (?, ?, ?, ?)`,
      [id, name, description, timestamp()]);
    
    for (const propId of property_ids || []) {
      run(`INSERT INTO property_group_members (id, group_id, property_id, created_at) VALUES (?, ?, ?, ?)`,
        [generateId(), id, propId, timestamp()]);
    }
    
    res.json({ success: true, group: { id, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/groups/:id/members', async (req, res) => {
  try {
    await ensureTables();
    const { property_ids } = req.body;
    run(`DELETE FROM property_group_members WHERE group_id = ?`, [req.params.id]);
    for (const propId of property_ids || []) {
      run(`INSERT INTO property_group_members (id, group_id, property_id, created_at) VALUES (?, ?, ?, ?)`,
        [generateId(), req.params.id, propId, timestamp()]);
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// CONSOLIDATED STATS
app.post('/stats/sync', async (req, res) => {
  try {
    await ensureTables();
    const { property_id, stats } = req.body; // stats = [{ date, rooms_available, rooms_sold, revenue, adr, revpar, occupancy, arrivals, departures }]
    
    let count = 0;
    for (const s of stats || []) {
      run(`INSERT INTO consolidated_stats (id, property_id, stat_date, rooms_available, rooms_sold, revenue, adr, revpar, occupancy, arrivals, departures, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(property_id, stat_date) DO UPDATE SET rooms_available = ?, rooms_sold = ?, revenue = ?, adr = ?, revpar = ?, occupancy = ?, arrivals = ?, departures = ?`,
        [generateId(), property_id, s.date, s.rooms_available, s.rooms_sold, s.revenue, s.adr, s.revpar, s.occupancy, s.arrivals, s.departures, timestamp(), s.rooms_available, s.rooms_sold, s.revenue, s.adr, s.revpar, s.occupancy, s.arrivals, s.departures]);
      count++;
    }
    
    run(`UPDATE properties SET last_sync_at = ? WHERE id = ?`, [timestamp(), property_id]);
    
    res.json({ success: true, synced: count });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/stats/consolidated', async (req, res) => {
  try {
    await ensureTables();
    const { from_date, to_date, property_ids, group_id } = req.query;
    const start = from_date || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const end = to_date || new Date().toISOString().split('T')[0];
    
    let propertyFilter = '';
    const params = [start, end];
    
    if (group_id) {
      const members = query(`SELECT property_id FROM property_group_members WHERE group_id = ?`, [group_id]);
      if (members.length > 0) {
        propertyFilter = ` AND cs.property_id IN (${members.map(() => '?').join(',')})`;
        params.push(...members.map(m => m.property_id));
      }
    } else if (property_ids) {
      const ids = property_ids.split(',');
      propertyFilter = ` AND cs.property_id IN (${ids.map(() => '?').join(',')})`;
      params.push(...ids);
    }
    
    const daily = query(`
      SELECT cs.stat_date, SUM(cs.rooms_available) as rooms_available, SUM(cs.rooms_sold) as rooms_sold,
             SUM(cs.revenue) as revenue, AVG(cs.adr) as adr, AVG(cs.revpar) as revpar,
             AVG(cs.occupancy) as occupancy, SUM(cs.arrivals) as arrivals, SUM(cs.departures) as departures
      FROM consolidated_stats cs
      WHERE cs.stat_date BETWEEN ? AND ? ${propertyFilter}
      GROUP BY cs.stat_date ORDER BY cs.stat_date
    `, params);
    
    const totals = get(`
      SELECT SUM(rooms_sold) as total_room_nights, SUM(revenue) as total_revenue,
             AVG(adr) as avg_adr, AVG(revpar) as avg_revpar, AVG(occupancy) as avg_occupancy
      FROM consolidated_stats cs
      WHERE stat_date BETWEEN ? AND ? ${propertyFilter}
    `, params);
    
    res.json({ success: true, period: { from: start, to: end }, daily, totals });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/stats/comparison', async (req, res) => {
  try {
    await ensureTables();
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    const comparison = query(`
      SELECT p.id, p.property_code, p.name, p.city, p.total_rooms, cs.rooms_sold, cs.revenue, cs.adr, cs.revpar, cs.occupancy
      FROM properties p
      LEFT JOIN consolidated_stats cs ON p.id = cs.property_id AND cs.stat_date = ?
      WHERE p.status = 'active'
      ORDER BY cs.revenue DESC NULLS LAST
    `, [targetDate]);
    
    res.json({ success: true, date: targetDate, comparison });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// CROSS-PROPERTY BOOKINGS
app.get('/transfers', async (req, res) => {
  try {
    await ensureTables();
    const { status } = req.query;
    let sql = `SELECT cpb.*, op.name as original_property_name, tp.name as target_property_name FROM cross_property_bookings cpb LEFT JOIN properties op ON cpb.original_property_id = op.id LEFT JOIN properties tp ON cpb.target_property_id = tp.id WHERE 1=1`;
    const params = [];
    if (status) { sql += ` AND cpb.status = ?`; params.push(status); }
    sql += ` ORDER BY cpb.created_at DESC`;
    res.json({ success: true, transfers: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/transfers', async (req, res) => {
  try {
    await ensureTables();
    const { original_property_id, target_property_id, guest_id, guest_name, guest_email, check_in, check_out, room_type, notes, transferred_by } = req.body;
    const id = generateId();
    run(`INSERT INTO cross_property_bookings (id, original_property_id, target_property_id, guest_id, guest_name, guest_email, check_in, check_out, room_type, notes, transferred_by, transferred_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [id, original_property_id, target_property_id, guest_id, guest_name, guest_email, check_in, check_out, room_type, notes, transferred_by, timestamp(), timestamp()]);
    res.json({ success: true, transfer: { id } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/transfers/:id/status', async (req, res) => {
  try {
    await ensureTables();
    const { status } = req.body;
    run(`UPDATE cross_property_bookings SET status = ? WHERE id = ?`, [status, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// CENTRAL RATE PLANS
app.get('/rate-plans', async (req, res) => {
  try {
    await ensureTables();
    const { active_only } = req.query;
    let sql = `SELECT * FROM central_rate_plans WHERE 1=1`;
    if (active_only === 'true') sql += ` AND is_active = 1`;
    sql += ` ORDER BY name`;
    res.json({ success: true, rate_plans: query(sql).map(r => ({ ...r, applicable_properties: JSON.parse(r.applicable_properties || '[]') })) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/rate-plans', async (req, res) => {
  try {
    await ensureTables();
    const { code, name, description, base_rate, applicable_properties, valid_from, valid_to } = req.body;
    const id = generateId();
    run(`INSERT INTO central_rate_plans (id, code, name, description, base_rate, applicable_properties, valid_from, valid_to, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, code, name, description, base_rate, JSON.stringify(applicable_properties || []), valid_from, valid_to, timestamp()]);
    res.json({ success: true, rate_plan: { id, code, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// CORPORATE ACCOUNTS
app.get('/corporate-accounts', async (req, res) => {
  try {
    await ensureTables();
    const { active_only } = req.query;
    let sql = `SELECT * FROM corporate_accounts WHERE 1=1`;
    if (active_only === 'true') sql += ` AND is_active = 1`;
    sql += ` ORDER BY company_name`;
    res.json({ success: true, accounts: query(sql).map(a => ({ ...a, applicable_properties: JSON.parse(a.applicable_properties || '[]') })) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/corporate-accounts', async (req, res) => {
  try {
    await ensureTables();
    const { account_code, company_name, contact_name, email, phone, address, discount_type, discount_value, credit_limit, payment_terms, applicable_properties } = req.body;
    const id = generateId();
    run(`INSERT INTO corporate_accounts (id, account_code, company_name, contact_name, email, phone, address, discount_type, discount_value, credit_limit, payment_terms, applicable_properties, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, account_code, company_name, contact_name, email, phone, address, discount_type || 'percentage', discount_value || 0, credit_limit || 0, payment_terms, JSON.stringify(applicable_properties || []), timestamp()]);
    res.json({ success: true, account: { id, account_code, company_name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ANNOUNCEMENTS
app.get('/announcements', async (req, res) => {
  try {
    await ensureTables();
    const { active_only } = req.query;
    let sql = `SELECT * FROM chain_announcements WHERE 1=1`;
    if (active_only === 'true') sql += ` AND (expires_at IS NULL OR expires_at > datetime('now'))`;
    sql += ` ORDER BY priority DESC, published_at DESC`;
    res.json({ success: true, announcements: query(sql).map(a => ({ ...a, target_properties: JSON.parse(a.target_properties || '[]') })) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/announcements', async (req, res) => {
  try {
    await ensureTables();
    const { title, content, priority, target_properties, expires_at, published_by } = req.body;
    const id = generateId();
    run(`INSERT INTO chain_announcements (id, title, content, priority, target_properties, published_at, expires_at, published_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title, content, priority || 'normal', JSON.stringify(target_properties || []), timestamp(), expires_at, published_by, timestamp()]);
    res.json({ success: true, announcement: { id, title } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// STATS
app.get('/dashboard', async (req, res) => {
  try {
    await ensureTables();
    const properties = get(`SELECT COUNT(*) as count FROM properties WHERE status = 'active'`);
    const totalRooms = get(`SELECT SUM(total_rooms) as count FROM properties WHERE status = 'active'`);
    const todayStats = get(`SELECT SUM(rooms_sold) as rooms_sold, SUM(revenue) as revenue, AVG(occupancy) as occupancy FROM consolidated_stats WHERE stat_date = date('now')`);
    const monthStats = get(`SELECT SUM(revenue) as revenue FROM consolidated_stats WHERE stat_date >= date('now', 'start of month')`);
    const pendingTransfers = get(`SELECT COUNT(*) as count FROM cross_property_bookings WHERE status = 'pending'`);
    
    res.json({
      success: true,
      dashboard: {
        total_properties: properties?.count || 0,
        total_rooms: totalRooms?.count || 0,
        today_rooms_sold: todayStats?.rooms_sold || 0,
        today_revenue: todayStats?.revenue || 0,
        today_occupancy: Math.round(todayStats?.occupancy || 0),
        mtd_revenue: monthStats?.revenue || 0,
        pending_transfers: pendingTransfers?.count || 0
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
