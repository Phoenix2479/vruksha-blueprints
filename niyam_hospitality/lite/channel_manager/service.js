/**
 * Channel Manager Service - Niyam Hospitality (Max Lite)
 * OTA integration hub - sync rates, availability, bookings with channels
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8941;
const SERVICE_NAME = 'channel_manager';

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) { app.use(express.static(uiPath)); }

app.get('/health', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME, mode: 'lite' }));

async function ensureTables() {
  const db = await initDb();
  
  db.run(`CREATE TABLE IF NOT EXISTS channel_connections (
    id TEXT PRIMARY KEY, channel_code TEXT NOT NULL, channel_name TEXT NOT NULL,
    api_key TEXT, api_secret TEXT, property_id TEXT, webhook_secret TEXT,
    webhook_url TEXT, settings TEXT, status TEXT DEFAULT 'pending',
    last_sync_at TEXT, last_error TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS channel_inventory (
    id TEXT PRIMARY KEY, channel_id TEXT, room_type TEXT NOT NULL, inventory_date TEXT NOT NULL,
    available_rooms INTEGER DEFAULT 0, rate REAL, min_stay INTEGER DEFAULT 1,
    max_stay INTEGER, is_closed INTEGER DEFAULT 0, stop_sell INTEGER DEFAULT 0,
    cta INTEGER DEFAULT 0, ctd INTEGER DEFAULT 0, synced_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(channel_id, room_type, inventory_date)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS channel_bookings (
    id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, channel_booking_id TEXT,
    guest_name TEXT, guest_email TEXT, guest_phone TEXT, room_type TEXT,
    check_in TEXT, check_out TEXT, adults INTEGER DEFAULT 1, children INTEGER DEFAULT 0,
    total_amount REAL, commission REAL DEFAULT 0, currency TEXT DEFAULT 'INR',
    status TEXT DEFAULT 'pending', hotel_booking_id TEXT, raw_data TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS channel_sync_logs (
    id TEXT PRIMARY KEY, channel_id TEXT, sync_type TEXT NOT NULL, direction TEXT,
    records_count INTEGER DEFAULT 0, status TEXT DEFAULT 'pending', started_at TEXT,
    completed_at TEXT, error TEXT, details TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS channel_rate_parity (
    id TEXT PRIMARY KEY, room_type TEXT NOT NULL, check_date TEXT NOT NULL,
    our_rate REAL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS channel_parity_checks (
    id TEXT PRIMARY KEY, parity_id TEXT NOT NULL, channel_id TEXT NOT NULL,
    channel_rate REAL, variance REAL, status TEXT, checked_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  return db;
}

// SUPPORTED CHANNELS
const SUPPORTED_CHANNELS = [
  { code: 'booking_com', name: 'Booking.com', type: 'ota', logo: 'booking.png' },
  { code: 'expedia', name: 'Expedia', type: 'ota', logo: 'expedia.png' },
  { code: 'airbnb', name: 'Airbnb', type: 'ota', logo: 'airbnb.png' },
  { code: 'agoda', name: 'Agoda', type: 'ota', logo: 'agoda.png' },
  { code: 'goibibo', name: 'Goibibo', type: 'ota', logo: 'goibibo.png' },
  { code: 'makemytrip', name: 'MakeMyTrip', type: 'ota', logo: 'makemytrip.png' },
  { code: 'tripadvisor', name: 'TripAdvisor', type: 'metasearch', logo: 'tripadvisor.png' },
  { code: 'google_hotels', name: 'Google Hotels', type: 'metasearch', logo: 'google.png' },
  { code: 'trivago', name: 'Trivago', type: 'metasearch', logo: 'trivago.png' }
];

app.get('/channels/available', (req, res) => {
  res.json({ success: true, channels: SUPPORTED_CHANNELS });
});

// CONNECTIONS
app.get('/connections', async (req, res) => {
  try {
    await ensureTables();
    const connections = query(`SELECT * FROM channel_connections ORDER BY channel_name`);
    
    // Get stats for each connection
    for (const conn of connections) {
      const bookings = get(`SELECT COUNT(*) as count, SUM(total_amount) as revenue FROM channel_bookings WHERE channel_id = ? AND created_at > datetime('now', '-30 days')`, [conn.id]);
      conn.bookings_30d = bookings?.count || 0;
      conn.revenue_30d = bookings?.revenue || 0;
    }
    
    res.json({ success: true, connections });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/connections/:id', async (req, res) => {
  try {
    await ensureTables();
    const conn = get(`SELECT * FROM channel_connections WHERE id = ?`, [req.params.id]);
    if (!conn) return res.status(404).json({ success: false, error: 'Connection not found' });
    
    const recentBookings = query(`SELECT * FROM channel_bookings WHERE channel_id = ? ORDER BY created_at DESC LIMIT 10`, [req.params.id]);
    const recentSyncs = query(`SELECT * FROM channel_sync_logs WHERE channel_id = ? ORDER BY created_at DESC LIMIT 10`, [req.params.id]);
    
    res.json({ success: true, connection: { ...conn, settings: JSON.parse(conn.settings || '{}'), recent_bookings: recentBookings, recent_syncs: recentSyncs } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/connections', async (req, res) => {
  try {
    await ensureTables();
    const { channel_code, channel_name, api_key, api_secret, property_id, settings } = req.body;
    
    const channelInfo = SUPPORTED_CHANNELS.find(c => c.code === channel_code);
    if (!channelInfo) return res.status(400).json({ success: false, error: 'Unsupported channel' });
    
    const id = generateId();
    const webhookSecret = crypto.randomBytes(32).toString('hex');
    
    run(`INSERT INTO channel_connections (id, channel_code, channel_name, api_key, api_secret, property_id, webhook_secret, settings, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [id, channel_code, channel_name || channelInfo.name, api_key, api_secret, property_id, webhookSecret, JSON.stringify(settings || {}), timestamp()]);
    
    res.json({ success: true, connection: { id, channel_code, webhook_secret: webhookSecret } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/connections/:id', async (req, res) => {
  try {
    await ensureTables();
    const { status, api_key, api_secret, property_id, settings } = req.body;
    run(`UPDATE channel_connections SET status = COALESCE(?, status), api_key = COALESCE(?, api_key), api_secret = COALESCE(?, api_secret), property_id = COALESCE(?, property_id), settings = COALESCE(?, settings) WHERE id = ?`,
      [status, api_key, api_secret, property_id, settings ? JSON.stringify(settings) : null, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete('/connections/:id', async (req, res) => {
  try {
    await ensureTables();
    run(`DELETE FROM channel_connections WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// INVENTORY
app.get('/inventory', async (req, res) => {
  try {
    await ensureTables();
    const { channel_id, room_type, from_date, to_date } = req.query;
    let sql = `SELECT ci.*, cc.channel_name FROM channel_inventory ci LEFT JOIN channel_connections cc ON ci.channel_id = cc.id WHERE 1=1`;
    const params = [];
    if (channel_id) { sql += ` AND ci.channel_id = ?`; params.push(channel_id); }
    if (room_type) { sql += ` AND ci.room_type = ?`; params.push(room_type); }
    if (from_date) { sql += ` AND ci.inventory_date >= ?`; params.push(from_date); }
    if (to_date) { sql += ` AND ci.inventory_date <= ?`; params.push(to_date); }
    sql += ` ORDER BY ci.inventory_date, ci.room_type`;
    res.json({ success: true, inventory: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/inventory/update', async (req, res) => {
  try {
    await ensureTables();
    const { channel_id, updates } = req.body; // Array of { date, room_type, available, rate, min_stay, closed, stop_sell }
    
    let count = 0;
    for (const u of updates || []) {
      const id = generateId();
      run(`INSERT INTO channel_inventory (id, channel_id, room_type, inventory_date, available_rooms, rate, min_stay, is_closed, stop_sell, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(channel_id, room_type, inventory_date) DO UPDATE SET available_rooms = ?, rate = ?, min_stay = ?, is_closed = ?, stop_sell = ?, synced_at = NULL`,
        [id, channel_id, u.room_type, u.date, u.available, u.rate, u.min_stay || 1, u.closed ? 1 : 0, u.stop_sell ? 1 : 0, timestamp(), u.available, u.rate, u.min_stay || 1, u.closed ? 1 : 0, u.stop_sell ? 1 : 0]);
      count++;
    }
    
    // Log sync job
    run(`INSERT INTO channel_sync_logs (id, channel_id, sync_type, direction, records_count, status, started_at, created_at) VALUES (?, ?, 'inventory', 'outbound', ?, 'pending', ?, ?)`,
      [generateId(), channel_id, count, timestamp(), timestamp()]);
    
    res.json({ success: true, updated: count });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/inventory/bulk', async (req, res) => {
  try {
    await ensureTables();
    const { room_type, from_date, to_date, available, rate, min_stay, closed, stop_sell, channel_ids } = req.body;
    
    const start = new Date(from_date);
    const end = new Date(to_date);
    let count = 0;
    
    const channels = channel_ids?.length > 0 ? channel_ids : query(`SELECT id FROM channel_connections WHERE status = 'active'`).map(c => c.id);
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      for (const channelId of channels) {
        const id = generateId();
        run(`INSERT INTO channel_inventory (id, channel_id, room_type, inventory_date, available_rooms, rate, min_stay, is_closed, stop_sell, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(channel_id, room_type, inventory_date) DO UPDATE SET available_rooms = COALESCE(?, available_rooms), rate = COALESCE(?, rate), min_stay = COALESCE(?, min_stay), is_closed = COALESCE(?, is_closed), stop_sell = COALESCE(?, stop_sell), synced_at = NULL`,
          [id, channelId, room_type, dateStr, available, rate, min_stay, closed ? 1 : 0, stop_sell ? 1 : 0, timestamp(), available, rate, min_stay, closed ? 1 : null, stop_sell ? 1 : null]);
        count++;
      }
    }
    
    res.json({ success: true, updated: count });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// SYNC
app.post('/sync/push', async (req, res) => {
  try {
    await ensureTables();
    const { channel_ids, from_date, to_date } = req.body;
    
    const syncId = generateId();
    const channels = channel_ids?.length > 0 ? channel_ids : query(`SELECT id FROM channel_connections WHERE status = 'active'`).map(c => c.id);
    
    run(`INSERT INTO channel_sync_logs (id, sync_type, direction, records_count, status, started_at, details, created_at) VALUES (?, 'rates_availability', 'outbound', 0, 'pending', ?, ?, ?)`,
      [syncId, timestamp(), JSON.stringify({ channels, from_date, to_date }), timestamp()]);
    
    // In production, this would queue the actual API calls
    // For lite, we mark inventory as synced
    for (const channelId of channels) {
      run(`UPDATE channel_inventory SET synced_at = ? WHERE channel_id = ? AND inventory_date BETWEEN ? AND ?`,
        [timestamp(), channelId, from_date, to_date]);
    }
    
    run(`UPDATE channel_sync_logs SET status = 'completed', completed_at = ? WHERE id = ?`, [timestamp(), syncId]);
    
    res.json({ success: true, sync_id: syncId, channels_synced: channels.length });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/sync/pull', async (req, res) => {
  try {
    await ensureTables();
    const { channel_ids } = req.body;
    
    const syncId = generateId();
    run(`INSERT INTO channel_sync_logs (id, sync_type, direction, records_count, status, started_at, created_at) VALUES (?, 'bookings', 'inbound', 0, 'pending', ?, ?)`,
      [syncId, timestamp(), timestamp()]);
    
    // In production, this would fetch bookings from OTA APIs
    // For lite, we just log the request
    run(`UPDATE channel_sync_logs SET status = 'completed', completed_at = ? WHERE id = ?`, [timestamp(), syncId]);
    
    res.json({ success: true, sync_id: syncId });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// CHANNEL BOOKINGS
app.get('/bookings', async (req, res) => {
  try {
    await ensureTables();
    const { channel_id, status, from_date, to_date, limit = 50 } = req.query;
    let sql = `SELECT cb.*, cc.channel_name FROM channel_bookings cb JOIN channel_connections cc ON cb.channel_id = cc.id WHERE 1=1`;
    const params = [];
    if (channel_id) { sql += ` AND cb.channel_id = ?`; params.push(channel_id); }
    if (status) { sql += ` AND cb.status = ?`; params.push(status); }
    if (from_date) { sql += ` AND cb.check_in >= ?`; params.push(from_date); }
    if (to_date) { sql += ` AND cb.check_in <= ?`; params.push(to_date); }
    sql += ` ORDER BY cb.created_at DESC LIMIT ?`;
    params.push(parseInt(limit));
    res.json({ success: true, bookings: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Webhook endpoint for OTA callbacks
app.post('/webhook/:channel_id', async (req, res) => {
  try {
    await ensureTables();
    const { channel_id } = req.params;
    const booking = req.body;
    
    const conn = get(`SELECT * FROM channel_connections WHERE id = ?`, [channel_id]);
    if (!conn) return res.status(404).json({ success: false, error: 'Channel not found' });
    
    // Optional: verify webhook signature
    // const signature = req.headers['x-webhook-signature'];
    // if (!verifySignature(booking, signature, conn.webhook_secret)) return res.status(401).json({ error: 'Invalid signature' });
    
    const id = generateId();
    run(`INSERT INTO channel_bookings (id, channel_id, channel_booking_id, guest_name, guest_email, guest_phone, room_type, check_in, check_out, adults, children, total_amount, commission, currency, status, raw_data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [id, channel_id, booking.channel_booking_id, booking.guest_name, booking.guest_email, booking.guest_phone, booking.room_type, booking.check_in, booking.check_out, booking.adults || 1, booking.children || 0, booking.total_amount, booking.commission || 0, booking.currency || 'INR', JSON.stringify(booking), timestamp()]);
    
    res.json({ success: true, booking_id: id });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/bookings/import', async (req, res) => {
  try {
    await ensureTables();
    const { channel_id, booking } = req.body;
    
    const id = generateId();
    run(`INSERT INTO channel_bookings (id, channel_id, channel_booking_id, guest_name, guest_email, guest_phone, room_type, check_in, check_out, adults, children, total_amount, commission, status, raw_data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [id, channel_id, booking.channel_booking_id, booking.guest_name, booking.guest_email, booking.guest_phone, booking.room_type, booking.check_in, booking.check_out, booking.adults || 1, booking.children || 0, booking.total_amount, booking.commission || 0, JSON.stringify(booking), timestamp()]);
    
    res.json({ success: true, booking_id: id });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/bookings/:id/convert', async (req, res) => {
  try {
    await ensureTables();
    const { room_id } = req.body;
    
    const cb = get(`SELECT * FROM channel_bookings WHERE id = ? AND status = 'pending'`, [req.params.id]);
    if (!cb) return res.status(404).json({ success: false, error: 'Pending booking not found' });
    
    // Create guest
    let guest = get(`SELECT id FROM guests WHERE email = ?`, [cb.guest_email]);
    let guestId;
    if (guest) {
      guestId = guest.id;
    } else {
      guestId = generateId();
      run(`INSERT INTO guests (id, name, email, phone, source, created_at) VALUES (?, ?, ?, ?, 'ota', ?)`,
        [guestId, cb.guest_name, cb.guest_email, cb.guest_phone, timestamp()]);
    }
    
    // Create reservation
    const reservationId = generateId();
    const confirmationNumber = `CH${Date.now().toString(36).toUpperCase()}`;
    
    run(`INSERT INTO reservations (id, confirmation_number, guest_id, room_id, check_in_date, check_out_date, adults, children, total_amount, source, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ota', 'confirmed', ?)`,
      [reservationId, confirmationNumber, guestId, room_id, cb.check_in, cb.check_out, cb.adults, cb.children, cb.total_amount, timestamp()]);
    
    // Update channel booking
    run(`UPDATE channel_bookings SET status = 'converted', hotel_booking_id = ? WHERE id = ?`, [reservationId, req.params.id]);
    
    res.json({ success: true, hotel_booking: { id: reservationId, confirmation_number: confirmationNumber } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// RATE PARITY
app.get('/parity', async (req, res) => {
  try {
    await ensureTables();
    const { date, room_type } = req.query;
    const checkDate = date || new Date().toISOString().split('T')[0];
    
    const parity = query(`
      SELECT crp.*, GROUP_CONCAT(cc.channel_name || ':' || cpc.channel_rate) as channel_rates
      FROM channel_rate_parity crp
      LEFT JOIN channel_parity_checks cpc ON crp.id = cpc.parity_id
      LEFT JOIN channel_connections cc ON cpc.channel_id = cc.id
      WHERE crp.check_date = ?
      ${room_type ? 'AND crp.room_type = ?' : ''}
      GROUP BY crp.id
    `, room_type ? [checkDate, room_type] : [checkDate]);
    
    res.json({ success: true, parity });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// SYNC LOGS
app.get('/sync-logs', async (req, res) => {
  try {
    await ensureTables();
    const { channel_id, limit = 50 } = req.query;
    let sql = `SELECT sl.*, cc.channel_name FROM channel_sync_logs sl LEFT JOIN channel_connections cc ON sl.channel_id = cc.id WHERE 1=1`;
    const params = [];
    if (channel_id) { sql += ` AND sl.channel_id = ?`; params.push(channel_id); }
    sql += ` ORDER BY sl.created_at DESC LIMIT ?`;
    params.push(parseInt(limit));
    res.json({ success: true, logs: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// STATS
app.get('/stats', async (req, res) => {
  try {
    await ensureTables();
    const connections = get(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'active') as active FROM channel_connections`);
    const bookings = get(`SELECT COUNT(*) as count, SUM(total_amount) as revenue, SUM(commission) as commission FROM channel_bookings WHERE created_at > datetime('now', '-30 days')`);
    const pending = get(`SELECT COUNT(*) as count FROM channel_bookings WHERE status = 'pending'`);
    
    res.json({
      success: true,
      stats: {
        total_channels: connections?.total || 0,
        active_channels: connections?.active || 0,
        bookings_30d: bookings?.count || 0,
        revenue_30d: bookings?.revenue || 0,
        commission_30d: bookings?.commission || 0,
        pending_bookings: pending?.count || 0
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
