/**
 * Event & Banquet Service - Niyam Hospitality (Max Lite)
 * Event booking, venue management, catering, BEOs
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8934;
const SERVICE_NAME = 'event_banquet';

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) { app.use(express.static(uiPath)); }

app.get('/health', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME, mode: 'lite' }));

async function ensureTables() {
  const db = await initDb();
  
  db.run(`CREATE TABLE IF NOT EXISTS venues (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, capacity_theater INTEGER,
    capacity_classroom INTEGER, capacity_banquet INTEGER, capacity_cocktail INTEGER,
    area_sqft REAL, hourly_rate REAL, half_day_rate REAL, full_day_rate REAL,
    amenities TEXT, setup_time_minutes INTEGER DEFAULT 60, teardown_time_minutes INTEGER DEFAULT 30,
    is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY, event_number TEXT UNIQUE, name TEXT NOT NULL, event_type TEXT,
    venue_id TEXT, client_name TEXT, client_email TEXT, client_phone TEXT, company TEXT,
    event_date TEXT NOT NULL, start_time TEXT, end_time TEXT, setup_style TEXT,
    expected_guests INTEGER, guaranteed_guests INTEGER, actual_guests INTEGER,
    package_id TEXT, room_rental REAL DEFAULT 0, fnb_minimum REAL DEFAULT 0, deposit_required REAL DEFAULT 0,
    deposit_paid REAL DEFAULT 0, total_estimate REAL DEFAULT 0, final_amount REAL,
    special_requests TEXT, internal_notes TEXT, status TEXT DEFAULT 'inquiry',
    sales_person TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS event_items (
    id TEXT PRIMARY KEY, event_id TEXT NOT NULL, item_type TEXT NOT NULL,
    description TEXT, quantity INTEGER DEFAULT 1, unit_price REAL DEFAULT 0,
    total_amount REAL DEFAULT 0, notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS event_packages (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, package_type TEXT,
    includes TEXT, per_person_price REAL, minimum_guests INTEGER, is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS beo_documents (
    id TEXT PRIMARY KEY, event_id TEXT NOT NULL, version INTEGER DEFAULT 1,
    content TEXT, approved_by TEXT, approved_at TEXT, status TEXT DEFAULT 'draft',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS venue_blocks (
    id TEXT PRIMARY KEY, venue_id TEXT NOT NULL, event_id TEXT, block_date TEXT NOT NULL,
    start_time TEXT, end_time TEXT, block_type TEXT DEFAULT 'event',
    notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  return db;
}

// VENUES
app.get('/venues', async (req, res) => {
  try {
    await ensureTables();
    const { available_date, min_capacity, setup_style } = req.query;
    let sql = `SELECT * FROM venues WHERE is_active = 1`;
    const params = [];
    
    if (min_capacity) {
      sql += ` AND (capacity_theater >= ? OR capacity_banquet >= ? OR capacity_classroom >= ?)`;
      params.push(min_capacity, min_capacity, min_capacity);
    }
    
    let venues = query(sql, params);
    
    // Check availability if date provided
    if (available_date) {
      const blocked = query(`SELECT venue_id FROM venue_blocks WHERE block_date = ?`, [available_date]).map(b => b.venue_id);
      venues = venues.filter(v => !blocked.includes(v.id));
    }
    
    res.json({ success: true, venues });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/venues', async (req, res) => {
  try {
    await ensureTables();
    const { name, description, capacity_theater, capacity_classroom, capacity_banquet, capacity_cocktail, area_sqft, hourly_rate, half_day_rate, full_day_rate, amenities } = req.body;
    const id = generateId();
    run(`INSERT INTO venues (id, name, description, capacity_theater, capacity_classroom, capacity_banquet, capacity_cocktail, area_sqft, hourly_rate, half_day_rate, full_day_rate, amenities, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, description, capacity_theater, capacity_classroom, capacity_banquet, capacity_cocktail, area_sqft, hourly_rate, half_day_rate, full_day_rate, JSON.stringify(amenities || []), timestamp()]);
    res.json({ success: true, venue: { id, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/venues/:id/availability', async (req, res) => {
  try {
    await ensureTables();
    const { from_date, to_date } = req.query;
    const blocks = query(`SELECT * FROM venue_blocks WHERE venue_id = ? AND block_date BETWEEN ? AND ?`,
      [req.params.id, from_date, to_date]);
    res.json({ success: true, blocks });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// EVENTS
app.get('/events', async (req, res) => {
  try {
    await ensureTables();
    const { status, venue_id, from_date, to_date, search, limit = 50 } = req.query;
    let sql = `SELECT e.*, v.name as venue_name FROM events e LEFT JOIN venues v ON e.venue_id = v.id WHERE 1=1`;
    const params = [];
    if (status) { sql += ` AND e.status = ?`; params.push(status); }
    if (venue_id) { sql += ` AND e.venue_id = ?`; params.push(venue_id); }
    if (from_date) { sql += ` AND e.event_date >= ?`; params.push(from_date); }
    if (to_date) { sql += ` AND e.event_date <= ?`; params.push(to_date); }
    if (search) { sql += ` AND (e.name LIKE ? OR e.client_name LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
    sql += ` ORDER BY e.event_date DESC LIMIT ?`;
    params.push(parseInt(limit));
    res.json({ success: true, events: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/events/:id', async (req, res) => {
  try {
    await ensureTables();
    const event = get(`SELECT e.*, v.name as venue_name FROM events e LEFT JOIN venues v ON e.venue_id = v.id WHERE e.id = ?`, [req.params.id]);
    if (!event) return res.status(404).json({ success: false, error: 'Event not found' });
    const items = query(`SELECT * FROM event_items WHERE event_id = ? ORDER BY item_type`, [req.params.id]);
    const beos = query(`SELECT id, version, status, created_at FROM beo_documents WHERE event_id = ? ORDER BY version DESC`, [req.params.id]);
    res.json({ success: true, event: { ...event, items, beos } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/events', async (req, res) => {
  try {
    await ensureTables();
    const { name, event_type, venue_id, client_name, client_email, client_phone, company, event_date, start_time, end_time, setup_style, expected_guests, package_id, room_rental, fnb_minimum, deposit_required, special_requests, sales_person } = req.body;
    
    const id = generateId();
    const eventNumber = `EVT${Date.now().toString(36).toUpperCase()}`;
    
    run(`INSERT INTO events (id, event_number, name, event_type, venue_id, client_name, client_email, client_phone, company, event_date, start_time, end_time, setup_style, expected_guests, package_id, room_rental, fnb_minimum, deposit_required, special_requests, sales_person, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'inquiry', ?)`,
      [id, eventNumber, name, event_type, venue_id, client_name, client_email, client_phone, company, event_date, start_time, end_time, setup_style, expected_guests, package_id, room_rental || 0, fnb_minimum || 0, deposit_required || 0, special_requests, sales_person, timestamp()]);
    
    // Block venue
    if (venue_id && event_date) {
      run(`INSERT INTO venue_blocks (id, venue_id, event_id, block_date, start_time, end_time, block_type, created_at) VALUES (?, ?, ?, ?, ?, ?, 'tentative', ?)`,
        [generateId(), venue_id, id, event_date, start_time, end_time, timestamp()]);
    }
    
    res.json({ success: true, event: { id, event_number: eventNumber, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/events/:id', async (req, res) => {
  try {
    await ensureTables();
    const { name, event_type, venue_id, client_name, client_email, client_phone, company, event_date, start_time, end_time, setup_style, expected_guests, guaranteed_guests, package_id, room_rental, fnb_minimum, deposit_required, deposit_paid, total_estimate, special_requests, internal_notes, status, sales_person } = req.body;
    
    run(`UPDATE events SET name = COALESCE(?, name), event_type = COALESCE(?, event_type), venue_id = COALESCE(?, venue_id), client_name = COALESCE(?, client_name), client_email = COALESCE(?, client_email), client_phone = COALESCE(?, client_phone), company = COALESCE(?, company), event_date = COALESCE(?, event_date), start_time = COALESCE(?, start_time), end_time = COALESCE(?, end_time), setup_style = COALESCE(?, setup_style), expected_guests = COALESCE(?, expected_guests), guaranteed_guests = COALESCE(?, guaranteed_guests), package_id = COALESCE(?, package_id), room_rental = COALESCE(?, room_rental), fnb_minimum = COALESCE(?, fnb_minimum), deposit_required = COALESCE(?, deposit_required), deposit_paid = COALESCE(?, deposit_paid), total_estimate = COALESCE(?, total_estimate), special_requests = COALESCE(?, special_requests), internal_notes = COALESCE(?, internal_notes), status = COALESCE(?, status), sales_person = COALESCE(?, sales_person), updated_at = ? WHERE id = ?`,
      [name, event_type, venue_id, client_name, client_email, client_phone, company, event_date, start_time, end_time, setup_style, expected_guests, guaranteed_guests, package_id, room_rental, fnb_minimum, deposit_required, deposit_paid, total_estimate, special_requests, internal_notes, status, sales_person, timestamp(), req.params.id]);
    
    res.json({ success: true, message: 'Event updated' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// EVENT ITEMS
app.post('/events/:eventId/items', async (req, res) => {
  try {
    await ensureTables();
    const { item_type, description, quantity, unit_price, notes } = req.body;
    const id = generateId();
    const total = (quantity || 1) * (unit_price || 0);
    run(`INSERT INTO event_items (id, event_id, item_type, description, quantity, unit_price, total_amount, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.params.eventId, item_type, description, quantity || 1, unit_price || 0, total, notes, timestamp()]);
    
    // Update event total estimate
    const totalItems = get(`SELECT SUM(total_amount) as total FROM event_items WHERE event_id = ?`, [req.params.eventId]);
    const event = get(`SELECT room_rental FROM events WHERE id = ?`, [req.params.eventId]);
    run(`UPDATE events SET total_estimate = ? WHERE id = ?`, [(totalItems?.total || 0) + (event?.room_rental || 0), req.params.eventId]);
    
    res.json({ success: true, item: { id, total_amount: total } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// PACKAGES
app.get('/packages', async (req, res) => {
  try {
    await ensureTables();
    const packages = query(`SELECT * FROM event_packages WHERE is_active = 1 ORDER BY name`);
    res.json({ success: true, packages: packages.map(p => ({ ...p, includes: JSON.parse(p.includes || '[]') })) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/packages', async (req, res) => {
  try {
    await ensureTables();
    const { name, description, package_type, includes, per_person_price, minimum_guests } = req.body;
    const id = generateId();
    run(`INSERT INTO event_packages (id, name, description, package_type, includes, per_person_price, minimum_guests, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, description, package_type, JSON.stringify(includes || []), per_person_price, minimum_guests, timestamp()]);
    res.json({ success: true, package: { id, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// BEO (Banquet Event Order)
app.post('/events/:eventId/beo', async (req, res) => {
  try {
    await ensureTables();
    const { content } = req.body;
    const lastBeo = get(`SELECT MAX(version) as v FROM beo_documents WHERE event_id = ?`, [req.params.eventId]);
    const version = (lastBeo?.v || 0) + 1;
    const id = generateId();
    run(`INSERT INTO beo_documents (id, event_id, version, content, status, created_at) VALUES (?, ?, ?, ?, 'draft', ?)`,
      [id, req.params.eventId, version, JSON.stringify(content), timestamp()]);
    res.json({ success: true, beo: { id, version } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/events/:eventId/beo/:beoId', async (req, res) => {
  try {
    await ensureTables();
    const beo = get(`SELECT * FROM beo_documents WHERE id = ? AND event_id = ?`, [req.params.beoId, req.params.eventId]);
    if (!beo) return res.status(404).json({ success: false, error: 'BEO not found' });
    res.json({ success: true, beo: { ...beo, content: JSON.parse(beo.content || '{}') } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/events/:eventId/beo/:beoId/approve', async (req, res) => {
  try {
    await ensureTables();
    const { approved_by } = req.body;
    run(`UPDATE beo_documents SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?`,
      [approved_by, timestamp(), req.params.beoId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// CALENDAR
app.get('/calendar', async (req, res) => {
  try {
    await ensureTables();
    const { from_date, to_date, venue_id } = req.query;
    let sql = `SELECT e.id, e.event_number, e.name, e.event_date, e.start_time, e.end_time, e.status, v.name as venue_name FROM events e LEFT JOIN venues v ON e.venue_id = v.id WHERE e.event_date BETWEEN ? AND ?`;
    const params = [from_date, to_date];
    if (venue_id) { sql += ` AND e.venue_id = ?`; params.push(venue_id); }
    sql += ` ORDER BY e.event_date, e.start_time`;
    res.json({ success: true, events: query(sql, params) });
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
