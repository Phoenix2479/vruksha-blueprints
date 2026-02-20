/**
 * Property Management Service - Niyam Hospitality (Max Lite)
 * Hotel configuration, room types, floors, amenities, policies
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8944;
const SERVICE_NAME = 'property_management';

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) { app.use(express.static(uiPath)); }

app.get('/health', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME, mode: 'lite' }));

async function ensureTables() {
  const db = await initDb();
  
  db.run(`CREATE TABLE IF NOT EXISTS property_info (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, legal_name TEXT, property_type TEXT DEFAULT 'hotel',
    star_rating INTEGER, description TEXT, address_line1 TEXT, address_line2 TEXT,
    city TEXT, state TEXT, country TEXT, postal_code TEXT, phone TEXT, email TEXT,
    website TEXT, gst_number TEXT, pan_number TEXT, fssai_number TEXT,
    check_in_time TEXT DEFAULT '14:00', check_out_time TEXT DEFAULT '11:00',
    currency TEXT DEFAULT 'INR', timezone TEXT DEFAULT 'Asia/Kolkata',
    logo_url TEXT, cover_image_url TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS floors (
    id TEXT PRIMARY KEY, floor_number INTEGER NOT NULL UNIQUE, name TEXT,
    description TEXT, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS amenities (
    id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
    category TEXT DEFAULT 'room', icon TEXT, description TEXT,
    is_chargeable INTEGER DEFAULT 0, charge_amount REAL DEFAULT 0,
    is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS policies (
    id TEXT PRIMARY KEY, policy_type TEXT NOT NULL, name TEXT NOT NULL,
    description TEXT, content TEXT, is_active INTEGER DEFAULT 1,
    effective_from TEXT, effective_to TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS tax_rates (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT UNIQUE, rate REAL NOT NULL,
    tax_type TEXT DEFAULT 'percentage', applies_to TEXT, min_amount REAL DEFAULT 0,
    is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
    description TEXT, head_of_department TEXT, email TEXT, phone TEXT,
    is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS outlets (
    id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
    outlet_type TEXT DEFAULT 'restaurant', location TEXT, floor_id TEXT,
    opening_time TEXT, closing_time TEXT, capacity INTEGER, phone TEXT,
    description TEXT, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS operating_hours (
    id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
    day_of_week INTEGER NOT NULL, opens_at TEXT, closes_at TEXT,
    is_closed INTEGER DEFAULT 0, notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(entity_type, entity_id, day_of_week)
  )`);
  
  // Seed default data
  const existing = get(`SELECT COUNT(*) as count FROM property_info`);
  if (!existing || existing.count === 0) {
    run(`INSERT INTO property_info (id, name, property_type, currency, timezone, created_at) VALUES (?, 'My Hotel', 'hotel', 'INR', 'Asia/Kolkata', ?)`,
      [generateId(), timestamp()]);
    
    // Default departments
    const depts = [
      { code: 'FO', name: 'Front Office' },
      { code: 'HK', name: 'Housekeeping' },
      { code: 'FB', name: 'Food & Beverage' },
      { code: 'MAINT', name: 'Maintenance' },
      { code: 'FIN', name: 'Finance' },
      { code: 'HR', name: 'Human Resources' }
    ];
    for (const d of depts) {
      run(`INSERT INTO departments (id, code, name, created_at) VALUES (?, ?, ?, ?)`,
        [generateId(), d.code, d.name, timestamp()]);
    }
    
    // Default amenities
    const amenities = [
      { code: 'WIFI', name: 'Free WiFi', category: 'room' },
      { code: 'AC', name: 'Air Conditioning', category: 'room' },
      { code: 'TV', name: 'Television', category: 'room' },
      { code: 'MINIBAR', name: 'Mini Bar', category: 'room', chargeable: true },
      { code: 'SAFE', name: 'In-Room Safe', category: 'room' },
      { code: 'POOL', name: 'Swimming Pool', category: 'property' },
      { code: 'GYM', name: 'Fitness Center', category: 'property' },
      { code: 'SPA', name: 'Spa', category: 'property' },
      { code: 'PARKING', name: 'Parking', category: 'property' },
      { code: 'RESTAURANT', name: 'Restaurant', category: 'property' }
    ];
    for (const a of amenities) {
      run(`INSERT INTO amenities (id, code, name, category, is_chargeable, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [generateId(), a.code, a.name, a.category, a.chargeable ? 1 : 0, timestamp()]);
    }
    
    // Default tax rates
    run(`INSERT INTO tax_rates (id, name, code, rate, applies_to, created_at) VALUES (?, 'GST 12%', 'GST12', 12, 'room', ?)`, [generateId(), timestamp()]);
    run(`INSERT INTO tax_rates (id, name, code, rate, applies_to, created_at) VALUES (?, 'GST 18%', 'GST18', 18, 'room', ?)`, [generateId(), timestamp()]);
    run(`INSERT INTO tax_rates (id, name, code, rate, applies_to, created_at) VALUES (?, 'GST 5%', 'GST5', 5, 'food', ?)`, [generateId(), timestamp()]);
  }
  
  return db;
}

// PROPERTY INFO
app.get('/property', async (req, res) => {
  try {
    await ensureTables();
    const property = get(`SELECT * FROM property_info LIMIT 1`);
    res.json({ success: true, property });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/property', async (req, res) => {
  try {
    await ensureTables();
    const { name, legal_name, property_type, star_rating, description, address_line1, address_line2, city, state, country, postal_code, phone, email, website, gst_number, pan_number, fssai_number, check_in_time, check_out_time, currency, timezone, logo_url, cover_image_url } = req.body;
    
    run(`UPDATE property_info SET name = COALESCE(?, name), legal_name = COALESCE(?, legal_name), property_type = COALESCE(?, property_type), star_rating = COALESCE(?, star_rating), description = COALESCE(?, description), address_line1 = COALESCE(?, address_line1), address_line2 = COALESCE(?, address_line2), city = COALESCE(?, city), state = COALESCE(?, state), country = COALESCE(?, country), postal_code = COALESCE(?, postal_code), phone = COALESCE(?, phone), email = COALESCE(?, email), website = COALESCE(?, website), gst_number = COALESCE(?, gst_number), pan_number = COALESCE(?, pan_number), fssai_number = COALESCE(?, fssai_number), check_in_time = COALESCE(?, check_in_time), check_out_time = COALESCE(?, check_out_time), currency = COALESCE(?, currency), timezone = COALESCE(?, timezone), logo_url = COALESCE(?, logo_url), cover_image_url = COALESCE(?, cover_image_url)`,
      [name, legal_name, property_type, star_rating, description, address_line1, address_line2, city, state, country, postal_code, phone, email, website, gst_number, pan_number, fssai_number, check_in_time, check_out_time, currency, timezone, logo_url, cover_image_url]);
    
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// FLOORS
app.get('/floors', async (req, res) => {
  try {
    await ensureTables();
    const floors = query(`SELECT f.*, (SELECT COUNT(*) FROM rooms WHERE floor = f.floor_number) as room_count FROM floors f WHERE f.is_active = 1 ORDER BY f.floor_number`);
    res.json({ success: true, floors });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/floors', async (req, res) => {
  try {
    await ensureTables();
    const { floor_number, name, description } = req.body;
    const id = generateId();
    run(`INSERT INTO floors (id, floor_number, name, description, created_at) VALUES (?, ?, ?, ?, ?)`,
      [id, floor_number, name || `Floor ${floor_number}`, description, timestamp()]);
    res.json({ success: true, floor: { id, floor_number } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/floors/:id', async (req, res) => {
  try {
    await ensureTables();
    const { name, description, is_active } = req.body;
    run(`UPDATE floors SET name = COALESCE(?, name), description = COALESCE(?, description), is_active = COALESCE(?, is_active) WHERE id = ?`,
      [name, description, is_active, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// AMENITIES
app.get('/amenities', async (req, res) => {
  try {
    await ensureTables();
    const { category, active_only } = req.query;
    let sql = `SELECT * FROM amenities WHERE 1=1`;
    const params = [];
    if (category) { sql += ` AND category = ?`; params.push(category); }
    if (active_only === 'true') { sql += ` AND is_active = 1`; }
    sql += ` ORDER BY category, name`;
    res.json({ success: true, amenities: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/amenities', async (req, res) => {
  try {
    await ensureTables();
    const { code, name, category, icon, description, is_chargeable, charge_amount } = req.body;
    const id = generateId();
    run(`INSERT INTO amenities (id, code, name, category, icon, description, is_chargeable, charge_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, code, name, category || 'room', icon, description, is_chargeable ? 1 : 0, charge_amount || 0, timestamp()]);
    res.json({ success: true, amenity: { id, code, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/amenities/:id', async (req, res) => {
  try {
    await ensureTables();
    const { name, category, icon, description, is_chargeable, charge_amount, is_active } = req.body;
    run(`UPDATE amenities SET name = COALESCE(?, name), category = COALESCE(?, category), icon = COALESCE(?, icon), description = COALESCE(?, description), is_chargeable = COALESCE(?, is_chargeable), charge_amount = COALESCE(?, charge_amount), is_active = COALESCE(?, is_active) WHERE id = ?`,
      [name, category, icon, description, is_chargeable, charge_amount, is_active, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POLICIES
app.get('/policies', async (req, res) => {
  try {
    await ensureTables();
    const { policy_type, active_only } = req.query;
    let sql = `SELECT * FROM policies WHERE 1=1`;
    const params = [];
    if (policy_type) { sql += ` AND policy_type = ?`; params.push(policy_type); }
    if (active_only === 'true') { sql += ` AND is_active = 1`; }
    sql += ` ORDER BY policy_type, name`;
    res.json({ success: true, policies: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/policies', async (req, res) => {
  try {
    await ensureTables();
    const { policy_type, name, description, content, effective_from, effective_to } = req.body;
    const id = generateId();
    run(`INSERT INTO policies (id, policy_type, name, description, content, effective_from, effective_to, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, policy_type, name, description, content, effective_from, effective_to, timestamp()]);
    res.json({ success: true, policy: { id, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/policies/:id', async (req, res) => {
  try {
    await ensureTables();
    const { name, description, content, effective_from, effective_to, is_active } = req.body;
    run(`UPDATE policies SET name = COALESCE(?, name), description = COALESCE(?, description), content = COALESCE(?, content), effective_from = COALESCE(?, effective_from), effective_to = COALESCE(?, effective_to), is_active = COALESCE(?, is_active) WHERE id = ?`,
      [name, description, content, effective_from, effective_to, is_active, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// TAX RATES
app.get('/taxes', async (req, res) => {
  try {
    await ensureTables();
    const { applies_to, active_only } = req.query;
    let sql = `SELECT * FROM tax_rates WHERE 1=1`;
    const params = [];
    if (applies_to) { sql += ` AND applies_to = ?`; params.push(applies_to); }
    if (active_only === 'true') { sql += ` AND is_active = 1`; }
    sql += ` ORDER BY name`;
    res.json({ success: true, taxes: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/taxes', async (req, res) => {
  try {
    await ensureTables();
    const { name, code, rate, tax_type, applies_to, min_amount } = req.body;
    const id = generateId();
    run(`INSERT INTO tax_rates (id, name, code, rate, tax_type, applies_to, min_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, code, rate, tax_type || 'percentage', applies_to, min_amount || 0, timestamp()]);
    res.json({ success: true, tax: { id, name, code } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/taxes/:id', async (req, res) => {
  try {
    await ensureTables();
    const { name, rate, tax_type, applies_to, min_amount, is_active } = req.body;
    run(`UPDATE tax_rates SET name = COALESCE(?, name), rate = COALESCE(?, rate), tax_type = COALESCE(?, tax_type), applies_to = COALESCE(?, applies_to), min_amount = COALESCE(?, min_amount), is_active = COALESCE(?, is_active) WHERE id = ?`,
      [name, rate, tax_type, applies_to, min_amount, is_active, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// DEPARTMENTS
app.get('/departments', async (req, res) => {
  try {
    await ensureTables();
    const departments = query(`SELECT * FROM departments WHERE is_active = 1 ORDER BY name`);
    res.json({ success: true, departments });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/departments', async (req, res) => {
  try {
    await ensureTables();
    const { code, name, description, head_of_department, email, phone } = req.body;
    const id = generateId();
    run(`INSERT INTO departments (id, code, name, description, head_of_department, email, phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, code, name, description, head_of_department, email, phone, timestamp()]);
    res.json({ success: true, department: { id, code, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// OUTLETS
app.get('/outlets', async (req, res) => {
  try {
    await ensureTables();
    const { outlet_type, active_only } = req.query;
    let sql = `SELECT o.*, f.name as floor_name FROM outlets o LEFT JOIN floors f ON o.floor_id = f.id WHERE 1=1`;
    const params = [];
    if (outlet_type) { sql += ` AND o.outlet_type = ?`; params.push(outlet_type); }
    if (active_only === 'true') { sql += ` AND o.is_active = 1`; }
    sql += ` ORDER BY o.name`;
    res.json({ success: true, outlets: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/outlets', async (req, res) => {
  try {
    await ensureTables();
    const { code, name, outlet_type, location, floor_id, opening_time, closing_time, capacity, phone, description } = req.body;
    const id = generateId();
    run(`INSERT INTO outlets (id, code, name, outlet_type, location, floor_id, opening_time, closing_time, capacity, phone, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, code, name, outlet_type || 'restaurant', location, floor_id, opening_time, closing_time, capacity, phone, description, timestamp()]);
    res.json({ success: true, outlet: { id, code, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/outlets/:id', async (req, res) => {
  try {
    await ensureTables();
    const { name, outlet_type, location, floor_id, opening_time, closing_time, capacity, phone, description, is_active } = req.body;
    run(`UPDATE outlets SET name = COALESCE(?, name), outlet_type = COALESCE(?, outlet_type), location = COALESCE(?, location), floor_id = COALESCE(?, floor_id), opening_time = COALESCE(?, opening_time), closing_time = COALESCE(?, closing_time), capacity = COALESCE(?, capacity), phone = COALESCE(?, phone), description = COALESCE(?, description), is_active = COALESCE(?, is_active) WHERE id = ?`,
      [name, outlet_type, location, floor_id, opening_time, closing_time, capacity, phone, description, is_active, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// OPERATING HOURS
app.get('/hours/:entityType/:entityId', async (req, res) => {
  try {
    await ensureTables();
    const hours = query(`SELECT * FROM operating_hours WHERE entity_type = ? AND entity_id = ? ORDER BY day_of_week`, [req.params.entityType, req.params.entityId]);
    res.json({ success: true, hours });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/hours/:entityType/:entityId', async (req, res) => {
  try {
    await ensureTables();
    const { hours } = req.body; // Array of { day_of_week, opens_at, closes_at, is_closed }
    
    for (const h of hours || []) {
      run(`INSERT INTO operating_hours (id, entity_type, entity_id, day_of_week, opens_at, closes_at, is_closed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(entity_type, entity_id, day_of_week) DO UPDATE SET opens_at = ?, closes_at = ?, is_closed = ?`,
        [generateId(), req.params.entityType, req.params.entityId, h.day_of_week, h.opens_at, h.closes_at, h.is_closed ? 1 : 0, timestamp(), h.opens_at, h.closes_at, h.is_closed ? 1 : 0]);
    }
    
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// STATS
app.get('/stats', async (req, res) => {
  try {
    await ensureTables();
    const rooms = get(`SELECT COUNT(*) as count FROM rooms`);
    const roomTypes = get(`SELECT COUNT(*) as count FROM room_types WHERE is_active = 1`);
    const floors = get(`SELECT COUNT(*) as count FROM floors WHERE is_active = 1`);
    const amenities = get(`SELECT COUNT(*) as count FROM amenities WHERE is_active = 1`);
    const outlets = get(`SELECT COUNT(*) as count FROM outlets WHERE is_active = 1`);
    const departments = get(`SELECT COUNT(*) as count FROM departments WHERE is_active = 1`);
    
    res.json({
      success: true,
      stats: {
        total_rooms: rooms?.count || 0,
        room_types: roomTypes?.count || 0,
        floors: floors?.count || 0,
        amenities: amenities?.count || 0,
        outlets: outlets?.count || 0,
        departments: departments?.count || 0
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
