/**
 * Rate Manager Service - Niyam Hospitality (Max Lite)
 * BAR rates, packages, seasons, rate calendar, competitor tracking
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8942;
const SERVICE_NAME = 'rate_manager';

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) { app.use(express.static(uiPath)); }

app.get('/health', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME, mode: 'lite' }));

async function ensureTables() {
  const db = await initDb();
  
  db.run(`CREATE TABLE IF NOT EXISTS bar_rates (
    id TEXT PRIMARY KEY, room_type TEXT NOT NULL, rate_name TEXT DEFAULT 'BAR',
    single_rate REAL NOT NULL, double_rate REAL NOT NULL, extra_adult REAL DEFAULT 0,
    extra_child REAL DEFAULT 0, effective_from TEXT NOT NULL, effective_to TEXT,
    min_stay INTEGER DEFAULT 1, max_stay INTEGER, closed_to_arrival INTEGER DEFAULT 0,
    closed_to_departure INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS rate_calendar (
    id TEXT PRIMARY KEY, room_type TEXT NOT NULL, rate_date TEXT NOT NULL,
    price REAL NOT NULL, rate_type TEXT DEFAULT 'bar', min_stay INTEGER DEFAULT 1,
    max_stay INTEGER, is_closed INTEGER DEFAULT 0, cta INTEGER DEFAULT 0, ctd INTEGER DEFAULT 0,
    notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(room_type, rate_date)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS rate_packages (
    id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, description TEXT,
    package_type TEXT DEFAULT 'inclusive', base_rate_type TEXT DEFAULT 'bar',
    rate_adjustment REAL DEFAULT 0, rate_adjustment_type TEXT DEFAULT 'percentage',
    inclusions TEXT, applicable_room_types TEXT, valid_from TEXT, valid_to TEXT,
    min_nights INTEGER DEFAULT 1, max_nights INTEGER, booking_window_start INTEGER,
    booking_window_end INTEGER, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS seasons (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, season_type TEXT DEFAULT 'regular',
    start_date TEXT NOT NULL, end_date TEXT NOT NULL, rate_multiplier REAL DEFAULT 1.0,
    min_stay_override INTEGER, color TEXT, priority INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS competitors (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, website TEXT, location TEXT,
    star_rating INTEGER, notes TEXT, is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS competitor_rates (
    id TEXT PRIMARY KEY, competitor_id TEXT NOT NULL, room_type TEXT,
    rate_date TEXT NOT NULL, rate REAL NOT NULL, source TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS rate_change_log (
    id TEXT PRIMARY KEY, room_type TEXT, rate_date TEXT, field_changed TEXT,
    old_value TEXT, new_value TEXT, change_source TEXT, changed_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  return db;
}

// BAR RATES
app.get('/rates/bar', async (req, res) => {
  try {
    await ensureTables();
    const { room_type, from_date, to_date, active_only } = req.query;
    let sql = `SELECT br.*, rt.name as room_type_name FROM bar_rates br LEFT JOIN room_types rt ON br.room_type = rt.code WHERE 1=1`;
    const params = [];
    if (room_type) { sql += ` AND br.room_type = ?`; params.push(room_type); }
    if (from_date) { sql += ` AND (br.effective_to IS NULL OR br.effective_to >= ?)`; params.push(from_date); }
    if (to_date) { sql += ` AND br.effective_from <= ?`; params.push(to_date); }
    if (active_only === 'true') { sql += ` AND br.is_active = 1`; }
    sql += ` ORDER BY br.room_type, br.effective_from`;
    res.json({ success: true, rates: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/rates/bar', async (req, res) => {
  try {
    await ensureTables();
    const { room_type, rate_name, single_rate, double_rate, extra_adult, extra_child, effective_from, effective_to, min_stay, max_stay, closed_to_arrival, closed_to_departure } = req.body;
    
    if (!room_type || !single_rate || !double_rate || !effective_from) {
      return res.status(400).json({ success: false, error: 'room_type, single_rate, double_rate, effective_from required' });
    }
    
    const id = generateId();
    run(`INSERT INTO bar_rates (id, room_type, rate_name, single_rate, double_rate, extra_adult, extra_child, effective_from, effective_to, min_stay, max_stay, closed_to_arrival, closed_to_departure, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, room_type, rate_name || 'BAR', single_rate, double_rate, extra_adult || 0, extra_child || 0, effective_from, effective_to, min_stay || 1, max_stay, closed_to_arrival ? 1 : 0, closed_to_departure ? 1 : 0, timestamp()]);
    
    res.json({ success: true, rate: { id, room_type } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/rates/bar/:id', async (req, res) => {
  try {
    await ensureTables();
    const { single_rate, double_rate, extra_adult, extra_child, effective_from, effective_to, min_stay, max_stay, closed_to_arrival, closed_to_departure, is_active } = req.body;
    
    // Get old values for logging
    const old = get(`SELECT * FROM bar_rates WHERE id = ?`, [req.params.id]);
    
    run(`UPDATE bar_rates SET single_rate = COALESCE(?, single_rate), double_rate = COALESCE(?, double_rate), extra_adult = COALESCE(?, extra_adult), extra_child = COALESCE(?, extra_child), effective_from = COALESCE(?, effective_from), effective_to = COALESCE(?, effective_to), min_stay = COALESCE(?, min_stay), max_stay = COALESCE(?, max_stay), closed_to_arrival = COALESCE(?, closed_to_arrival), closed_to_departure = COALESCE(?, closed_to_departure), is_active = COALESCE(?, is_active) WHERE id = ?`,
      [single_rate, double_rate, extra_adult, extra_child, effective_from, effective_to, min_stay, max_stay, closed_to_arrival, closed_to_departure, is_active, req.params.id]);
    
    // Log change
    if (old && single_rate && single_rate !== old.single_rate) {
      run(`INSERT INTO rate_change_log (id, room_type, field_changed, old_value, new_value, change_source, created_at) VALUES (?, ?, 'single_rate', ?, ?, 'manual', ?)`,
        [generateId(), old.room_type, old.single_rate, single_rate, timestamp()]);
    }
    
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// RATE CALENDAR
app.get('/rates/calendar', async (req, res) => {
  try {
    await ensureTables();
    const { room_type, from_date, to_date } = req.query;
    
    if (!from_date || !to_date) return res.status(400).json({ success: false, error: 'from_date and to_date required' });
    
    let sql = `SELECT * FROM rate_calendar WHERE rate_date >= ? AND rate_date <= ?`;
    const params = [from_date, to_date];
    if (room_type) { sql += ` AND room_type = ?`; params.push(room_type); }
    sql += ` ORDER BY room_type, rate_date`;
    
    res.json({ success: true, calendar: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/rates/calendar/bulk', async (req, res) => {
  try {
    await ensureTables();
    const { room_type, from_date, to_date, price, rate_type, min_stay, is_closed, cta, ctd, days_of_week } = req.body;
    
    const start = new Date(from_date);
    const end = new Date(to_date);
    let count = 0;
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay();
      
      // Skip if specific days specified and this isn't one
      if (days_of_week && days_of_week.length > 0 && !days_of_week.includes(dayOfWeek)) continue;
      
      const dateStr = d.toISOString().split('T')[0];
      const id = generateId();
      run(`INSERT INTO rate_calendar (id, room_type, rate_date, price, rate_type, min_stay, is_closed, cta, ctd, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(room_type, rate_date) DO UPDATE SET price = COALESCE(?, price), rate_type = COALESCE(?, rate_type), min_stay = COALESCE(?, min_stay), is_closed = COALESCE(?, is_closed), cta = COALESCE(?, cta), ctd = COALESCE(?, ctd)`,
        [id, room_type, dateStr, price, rate_type || 'bar', min_stay || 1, is_closed ? 1 : 0, cta ? 1 : 0, ctd ? 1 : 0, timestamp(), price, rate_type, min_stay, is_closed ? 1 : null, cta ? 1 : null, ctd ? 1 : null]);
      count++;
    }
    
    res.json({ success: true, updated: count });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/rates/calendar/:roomType/:date', async (req, res) => {
  try {
    await ensureTables();
    const { roomType, date } = req.params;
    const { price, rate_type, min_stay, is_closed, cta, ctd, notes } = req.body;
    
    const existing = get(`SELECT * FROM rate_calendar WHERE room_type = ? AND rate_date = ?`, [roomType, date]);
    
    if (existing) {
      run(`UPDATE rate_calendar SET price = COALESCE(?, price), rate_type = COALESCE(?, rate_type), min_stay = COALESCE(?, min_stay), is_closed = COALESCE(?, is_closed), cta = COALESCE(?, cta), ctd = COALESCE(?, ctd), notes = COALESCE(?, notes) WHERE room_type = ? AND rate_date = ?`,
        [price, rate_type, min_stay, is_closed, cta, ctd, notes, roomType, date]);
    } else {
      run(`INSERT INTO rate_calendar (id, room_type, rate_date, price, rate_type, min_stay, is_closed, cta, ctd, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), roomType, date, price, rate_type || 'bar', min_stay || 1, is_closed ? 1 : 0, cta ? 1 : 0, ctd ? 1 : 0, notes, timestamp()]);
    }
    
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// PACKAGES
app.get('/packages', async (req, res) => {
  try {
    await ensureTables();
    const { active_only } = req.query;
    let sql = `SELECT * FROM rate_packages WHERE 1=1`;
    if (active_only === 'true') sql += ` AND is_active = 1 AND (valid_to IS NULL OR valid_to >= date('now'))`;
    sql += ` ORDER BY name`;
    const packages = query(sql);
    res.json({ success: true, packages: packages.map(p => ({ ...p, inclusions: JSON.parse(p.inclusions || '[]'), applicable_room_types: JSON.parse(p.applicable_room_types || '[]') })) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/packages', async (req, res) => {
  try {
    await ensureTables();
    const { code, name, description, package_type, base_rate_type, rate_adjustment, rate_adjustment_type, inclusions, applicable_room_types, valid_from, valid_to, min_nights, max_nights, booking_window_start, booking_window_end } = req.body;
    const id = generateId();
    run(`INSERT INTO rate_packages (id, code, name, description, package_type, base_rate_type, rate_adjustment, rate_adjustment_type, inclusions, applicable_room_types, valid_from, valid_to, min_nights, max_nights, booking_window_start, booking_window_end, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, code, name, description, package_type || 'inclusive', base_rate_type || 'bar', rate_adjustment || 0, rate_adjustment_type || 'percentage', JSON.stringify(inclusions || []), JSON.stringify(applicable_room_types || []), valid_from, valid_to, min_nights || 1, max_nights, booking_window_start, booking_window_end, timestamp()]);
    res.json({ success: true, package: { id, code, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/packages/:id', async (req, res) => {
  try {
    await ensureTables();
    const { name, description, rate_adjustment, rate_adjustment_type, inclusions, applicable_room_types, valid_from, valid_to, min_nights, max_nights, is_active } = req.body;
    run(`UPDATE rate_packages SET name = COALESCE(?, name), description = COALESCE(?, description), rate_adjustment = COALESCE(?, rate_adjustment), rate_adjustment_type = COALESCE(?, rate_adjustment_type), inclusions = COALESCE(?, inclusions), applicable_room_types = COALESCE(?, applicable_room_types), valid_from = COALESCE(?, valid_from), valid_to = COALESCE(?, valid_to), min_nights = COALESCE(?, min_nights), max_nights = COALESCE(?, max_nights), is_active = COALESCE(?, is_active) WHERE id = ?`,
      [name, description, rate_adjustment, rate_adjustment_type, inclusions ? JSON.stringify(inclusions) : null, applicable_room_types ? JSON.stringify(applicable_room_types) : null, valid_from, valid_to, min_nights, max_nights, is_active, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// SEASONS
app.get('/seasons', async (req, res) => {
  try {
    await ensureTables();
    const { year } = req.query;
    let sql = `SELECT * FROM seasons WHERE is_active = 1`;
    const params = [];
    if (year) {
      sql += ` AND strftime('%Y', start_date) = ?`;
      params.push(year);
    }
    sql += ` ORDER BY start_date`;
    res.json({ success: true, seasons: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/seasons', async (req, res) => {
  try {
    await ensureTables();
    const { name, season_type, start_date, end_date, rate_multiplier, min_stay_override, color, priority } = req.body;
    const id = generateId();
    run(`INSERT INTO seasons (id, name, season_type, start_date, end_date, rate_multiplier, min_stay_override, color, priority, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, season_type || 'regular', start_date, end_date, rate_multiplier || 1.0, min_stay_override, color, priority || 0, timestamp()]);
    res.json({ success: true, season: { id, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/seasons/active', async (req, res) => {
  try {
    await ensureTables();
    const { date } = req.query;
    const checkDate = date || new Date().toISOString().split('T')[0];
    const season = get(`SELECT * FROM seasons WHERE is_active = 1 AND start_date <= ? AND end_date >= ? ORDER BY priority DESC LIMIT 1`, [checkDate, checkDate]);
    res.json({ success: true, season: season || { name: 'Regular', season_type: 'regular', rate_multiplier: 1.0 } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// COMPETITORS
app.get('/competitors', async (req, res) => {
  try {
    await ensureTables();
    const competitors = query(`SELECT * FROM competitors WHERE is_active = 1 ORDER BY name`);
    res.json({ success: true, competitors });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/competitors', async (req, res) => {
  try {
    await ensureTables();
    const { name, website, location, star_rating, notes } = req.body;
    const id = generateId();
    run(`INSERT INTO competitors (id, name, website, location, star_rating, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, name, website, location, star_rating, notes, timestamp()]);
    res.json({ success: true, competitor: { id, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/competitors/rates', async (req, res) => {
  try {
    await ensureTables();
    const { competitor_id, from_date, to_date } = req.query;
    let sql = `SELECT cr.*, c.name as competitor_name FROM competitor_rates cr JOIN competitors c ON cr.competitor_id = c.id WHERE 1=1`;
    const params = [];
    if (competitor_id) { sql += ` AND cr.competitor_id = ?`; params.push(competitor_id); }
    if (from_date) { sql += ` AND cr.rate_date >= ?`; params.push(from_date); }
    if (to_date) { sql += ` AND cr.rate_date <= ?`; params.push(to_date); }
    sql += ` ORDER BY cr.rate_date DESC LIMIT 100`;
    res.json({ success: true, rates: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/competitors/rates', async (req, res) => {
  try {
    await ensureTables();
    const { competitor_id, room_type, rate_date, rate, source } = req.body;
    const id = generateId();
    run(`INSERT INTO competitor_rates (id, competitor_id, room_type, rate_date, rate, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, competitor_id, room_type, rate_date, rate, source, timestamp()]);
    res.json({ success: true, rate: { id } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// RATE RECOMMENDATIONS
app.get('/recommendations', async (req, res) => {
  try {
    await ensureTables();
    const { room_type, date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    // Get current rate
    const currentRate = get(`SELECT price FROM rate_calendar WHERE room_type = ? AND rate_date = ?`, [room_type, targetDate]);
    const barRate = get(`SELECT single_rate FROM bar_rates WHERE room_type = ? AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?) AND is_active = 1 ORDER BY effective_from DESC LIMIT 1`, [room_type, targetDate, targetDate]);
    const baseRate = currentRate?.price || barRate?.single_rate || 0;
    
    // Get occupancy for date
    const occupancy = get(`SELECT COUNT(*) as booked FROM reservations WHERE status IN ('confirmed', 'checked_in') AND check_in_date <= ? AND check_out_date > ?`, [targetDate, targetDate]);
    const totalRooms = get(`SELECT COUNT(*) as count FROM rooms WHERE status != 'out_of_order'`);
    const occupancyRate = totalRooms?.count > 0 ? (occupancy?.booked || 0) / totalRooms.count * 100 : 0;
    
    // Get competitor average
    const compAvg = get(`SELECT AVG(rate) as avg FROM competitor_rates WHERE rate_date = ?`, [targetDate]);
    
    // Get active season
    const season = get(`SELECT * FROM seasons WHERE is_active = 1 AND start_date <= ? AND end_date >= ? ORDER BY priority DESC LIMIT 1`, [targetDate, targetDate]);
    
    // Calculate recommendation
    let action = 'maintain';
    let suggestedRate = baseRate;
    let reason = 'Current rate is optimal';
    
    if (occupancyRate > 80) {
      action = 'increase';
      suggestedRate = Math.round(baseRate * 1.15);
      reason = 'High demand - increase rates';
    } else if (occupancyRate < 40) {
      action = 'decrease';
      suggestedRate = Math.round(baseRate * 0.9);
      reason = 'Low demand - reduce to stimulate bookings';
    }
    
    if (compAvg?.avg && baseRate > compAvg.avg * 1.2) {
      action = 'decrease';
      suggestedRate = Math.round(compAvg.avg * 1.1);
      reason = 'Rate above market average';
    }
    
    if (season && season.rate_multiplier > 1) {
      suggestedRate = Math.round(suggestedRate * season.rate_multiplier);
      reason += ` (${season.name} season)`;
    }
    
    res.json({
      success: true,
      recommendation: {
        room_type,
        date: targetDate,
        current_rate: baseRate,
        suggested_rate: suggestedRate,
        action,
        reason,
        metrics: {
          occupancy: Math.round(occupancyRate),
          competitor_avg: compAvg?.avg || 0,
          season: season?.name || 'Regular',
          season_multiplier: season?.rate_multiplier || 1.0
        }
      }
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// RATE CHANGE LOG
app.get('/changelog', async (req, res) => {
  try {
    await ensureTables();
    const { room_type, from_date, to_date, limit = 100 } = req.query;
    let sql = `SELECT * FROM rate_change_log WHERE 1=1`;
    const params = [];
    if (room_type) { sql += ` AND room_type = ?`; params.push(room_type); }
    if (from_date) { sql += ` AND created_at >= ?`; params.push(from_date); }
    if (to_date) { sql += ` AND created_at <= ?`; params.push(to_date); }
    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(parseInt(limit));
    res.json({ success: true, changes: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// STATS
app.get('/stats', async (req, res) => {
  try {
    await ensureTables();
    const barRates = get(`SELECT COUNT(*) as count FROM bar_rates WHERE is_active = 1`);
    const packages = get(`SELECT COUNT(*) as count FROM rate_packages WHERE is_active = 1`);
    const seasons = get(`SELECT COUNT(*) as count FROM seasons WHERE is_active = 1`);
    const calendarDates = get(`SELECT COUNT(DISTINCT rate_date) as count FROM rate_calendar WHERE rate_date >= date('now')`);
    const avgRate = get(`SELECT AVG(price) as avg FROM rate_calendar WHERE rate_date = date('now')`);
    
    res.json({
      success: true,
      stats: {
        active_bar_rates: barRates?.count || 0,
        active_packages: packages?.count || 0,
        seasons_defined: seasons?.count || 0,
        calendar_days_set: calendarDates?.count || 0,
        avg_rate_today: Math.round(avgRate?.avg || 0)
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
