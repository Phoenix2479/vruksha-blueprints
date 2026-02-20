/**
 * Booking Engine Service - Niyam Hospitality (Max Lite)
 * Direct booking widget for websites - availability, rates, promo codes, payments
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8940;
const SERVICE_NAME = 'booking_engine';

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) { app.use(express.static(uiPath)); }

app.get('/health', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME, mode: 'lite' }));

async function ensureTables() {
  const db = await initDb();
  
  db.run(`CREATE TABLE IF NOT EXISTS booking_widget_config (
    id TEXT PRIMARY KEY, property_name TEXT, logo_url TEXT, primary_color TEXT DEFAULT '#4F46E5',
    currency TEXT DEFAULT 'INR', timezone TEXT DEFAULT 'Asia/Kolkata', check_in_time TEXT DEFAULT '14:00',
    check_out_time TEXT DEFAULT '11:00', min_advance_days INTEGER DEFAULT 0, max_advance_days INTEGER DEFAULT 365,
    payment_methods TEXT, terms_url TEXT, privacy_url TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS promo_codes (
    id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT, description TEXT,
    discount_type TEXT DEFAULT 'percentage', discount_value REAL NOT NULL,
    max_discount REAL, min_booking_amount REAL DEFAULT 0, min_nights INTEGER DEFAULT 1,
    applicable_room_types TEXT, valid_from TEXT, valid_to TEXT,
    max_uses INTEGER, current_uses INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS booking_sessions (
    id TEXT PRIMARY KEY, session_token TEXT UNIQUE, guest_email TEXT, guest_name TEXT,
    check_in TEXT, check_out TEXT, room_type TEXT, room_id TEXT, adults INTEGER DEFAULT 1,
    children INTEGER DEFAULT 0, promo_code TEXT, subtotal REAL, discount REAL DEFAULT 0,
    total REAL, status TEXT DEFAULT 'pending', expires_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS booking_analytics (
    id TEXT PRIMARY KEY, event_type TEXT NOT NULL, session_id TEXT, room_type TEXT,
    check_in TEXT, check_out TEXT, revenue REAL, source TEXT, device_type TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  // Seed default config if none exists
  const existing = get(`SELECT COUNT(*) as count FROM booking_widget_config`);
  if (!existing || existing.count === 0) {
    run(`INSERT INTO booking_widget_config (id, property_name, currency, created_at) VALUES (?, 'Hotel', 'INR', ?)`,
      [generateId(), timestamp()]);
  }
  
  return db;
}

// WIDGET CONFIG
app.get('/widget/config', async (req, res) => {
  try {
    await ensureTables();
    const config = get(`SELECT * FROM booking_widget_config LIMIT 1`);
    const roomTypes = query(`SELECT id, name, code, description, base_price, max_occupancy, amenities FROM room_types WHERE is_active = 1 ORDER BY base_price`);
    
    res.json({
      success: true,
      config: {
        property_name: config?.property_name || 'Hotel',
        logo_url: config?.logo_url,
        primary_color: config?.primary_color || '#4F46E5',
        currency: config?.currency || 'INR',
        timezone: config?.timezone || 'Asia/Kolkata',
        check_in_time: config?.check_in_time || '14:00',
        check_out_time: config?.check_out_time || '11:00',
        min_advance_days: config?.min_advance_days || 0,
        max_advance_days: config?.max_advance_days || 365,
        payment_methods: JSON.parse(config?.payment_methods || '["card", "upi", "pay_at_hotel"]'),
        terms_url: config?.terms_url,
        privacy_url: config?.privacy_url
      },
      room_types: roomTypes
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/widget/config', async (req, res) => {
  try {
    await ensureTables();
    const { property_name, logo_url, primary_color, currency, timezone, check_in_time, check_out_time, min_advance_days, max_advance_days, payment_methods, terms_url, privacy_url } = req.body;
    run(`UPDATE booking_widget_config SET property_name = COALESCE(?, property_name), logo_url = COALESCE(?, logo_url), primary_color = COALESCE(?, primary_color), currency = COALESCE(?, currency), timezone = COALESCE(?, timezone), check_in_time = COALESCE(?, check_in_time), check_out_time = COALESCE(?, check_out_time), min_advance_days = COALESCE(?, min_advance_days), max_advance_days = COALESCE(?, max_advance_days), payment_methods = ?, terms_url = COALESCE(?, terms_url), privacy_url = COALESCE(?, privacy_url)`,
      [property_name, logo_url, primary_color, currency, timezone, check_in_time, check_out_time, min_advance_days, max_advance_days, JSON.stringify(payment_methods), terms_url, privacy_url]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// AVAILABILITY CHECK
app.get('/availability', async (req, res) => {
  try {
    await ensureTables();
    const { check_in, check_out, adults, children, room_type } = req.query;
    
    if (!check_in || !check_out) {
      return res.status(400).json({ success: false, error: 'check_in and check_out dates required' });
    }
    
    // Log analytics
    run(`INSERT INTO booking_analytics (id, event_type, check_in, check_out, room_type, created_at) VALUES (?, 'availability_search', ?, ?, ?, ?)`,
      [generateId(), check_in, check_out, room_type, timestamp()]);
    
    // Find available rooms
    let sql = `
      SELECT r.id, r.room_number, r.room_type_id, r.floor, r.amenities,
             rt.name as type_name, rt.code as type_code, rt.description, rt.base_price, rt.max_occupancy
      FROM rooms r
      JOIN room_types rt ON r.room_type_id = rt.id
      WHERE r.status = 'available'
        AND r.id NOT IN (
          SELECT room_id FROM reservations
          WHERE status IN ('confirmed', 'checked_in')
            AND ((check_in_date <= ? AND check_out_date > ?) OR
                 (check_in_date < ? AND check_out_date >= ?) OR
                 (check_in_date >= ? AND check_out_date <= ?))
        )
    `;
    const params = [check_in, check_in, check_out, check_out, check_in, check_out];
    
    if (room_type) {
      sql += ` AND rt.code = ?`;
      params.push(room_type);
    }
    if (adults) {
      const totalGuests = parseInt(adults) + parseInt(children || 0);
      sql += ` AND rt.max_occupancy >= ?`;
      params.push(totalGuests);
    }
    
    sql += ` ORDER BY rt.base_price ASC`;
    
    const rooms = query(sql, params);
    
    const nights = Math.ceil((new Date(check_out) - new Date(check_in)) / (1000 * 60 * 60 * 24));
    
    // Group by room type
    const roomTypeMap = {};
    for (const room of rooms) {
      if (!roomTypeMap[room.type_code]) {
        roomTypeMap[room.type_code] = {
          code: room.type_code,
          name: room.type_name,
          description: room.description,
          base_price: room.base_price,
          max_occupancy: room.max_occupancy,
          price_per_night: room.base_price,
          total_price: room.base_price * nights,
          nights,
          available_rooms: []
        };
      }
      roomTypeMap[room.type_code].available_rooms.push({
        id: room.id,
        room_number: room.room_number,
        floor: room.floor,
        amenities: room.amenities
      });
    }
    
    const availability = Object.values(roomTypeMap).map(rt => ({
      ...rt,
      available_count: rt.available_rooms.length
    }));
    
    res.json({ success: true, check_in, check_out, nights, availability });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// RATES
app.get('/rates', async (req, res) => {
  try {
    await ensureTables();
    const { from_date, to_date, room_type } = req.query;
    const start = from_date || new Date().toISOString().split('T')[0];
    const end = to_date || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    
    // Get room types
    let rtSql = `SELECT * FROM room_types WHERE is_active = 1`;
    const rtParams = [];
    if (room_type) { rtSql += ` AND code = ?`; rtParams.push(room_type); }
    const roomTypes = query(rtSql, rtParams);
    
    // Get rate calendar overrides
    const rateOverrides = query(`SELECT * FROM rate_calendar WHERE rate_date BETWEEN ? AND ?`, [start, end]);
    const overrideMap = {};
    for (const r of rateOverrides) {
      if (!overrideMap[r.room_type]) overrideMap[r.room_type] = {};
      overrideMap[r.room_type][r.rate_date] = { price: r.price, min_stay: r.min_stay, closed: r.is_closed };
    }
    
    const rates = roomTypes.map(rt => ({
      code: rt.code,
      name: rt.name,
      base_price: rt.base_price,
      rate_calendar: overrideMap[rt.code] || {}
    }));
    
    res.json({ success: true, rates, period: { from: start, to: end } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// PROMO CODES
app.get('/promos', async (req, res) => {
  try {
    await ensureTables();
    const promos = query(`SELECT id, code, name, description, discount_type, discount_value, max_discount, min_booking_amount, min_nights, valid_from, valid_to FROM promo_codes WHERE is_active = 1 AND (valid_to IS NULL OR valid_to >= date('now')) ORDER BY code`);
    res.json({ success: true, promos });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/promos', async (req, res) => {
  try {
    await ensureTables();
    const { code, name, description, discount_type, discount_value, max_discount, min_booking_amount, min_nights, applicable_room_types, valid_from, valid_to, max_uses } = req.body;
    const id = generateId();
    run(`INSERT INTO promo_codes (id, code, name, description, discount_type, discount_value, max_discount, min_booking_amount, min_nights, applicable_room_types, valid_from, valid_to, max_uses, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, code.toUpperCase(), name, description, discount_type || 'percentage', discount_value, max_discount, min_booking_amount || 0, min_nights || 1, JSON.stringify(applicable_room_types || []), valid_from, valid_to, max_uses, timestamp()]);
    res.json({ success: true, promo: { id, code: code.toUpperCase() } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/promos/validate', async (req, res) => {
  try {
    await ensureTables();
    const { code, check_in, check_out, room_type, total_amount } = req.body;
    
    const promo = get(`SELECT * FROM promo_codes WHERE code = ? AND is_active = 1 AND (valid_from IS NULL OR valid_from <= ?) AND (valid_to IS NULL OR valid_to >= ?) AND (max_uses IS NULL OR current_uses < max_uses)`,
      [code.toUpperCase(), check_in, check_out]);
    
    if (!promo) return res.status(400).json({ success: false, error: 'Invalid or expired promo code' });
    
    // Check room type restriction
    const applicableTypes = JSON.parse(promo.applicable_room_types || '[]');
    if (applicableTypes.length > 0 && room_type && !applicableTypes.includes(room_type)) {
      return res.status(400).json({ success: false, error: 'Promo code not valid for this room type' });
    }
    
    // Check minimum stay
    const nights = Math.ceil((new Date(check_out) - new Date(check_in)) / (1000 * 60 * 60 * 24));
    if (promo.min_nights && nights < promo.min_nights) {
      return res.status(400).json({ success: false, error: `Minimum ${promo.min_nights} nights required` });
    }
    
    // Check minimum amount
    if (promo.min_booking_amount && total_amount < promo.min_booking_amount) {
      return res.status(400).json({ success: false, error: `Minimum booking amount of ${promo.min_booking_amount} required` });
    }
    
    // Calculate discount
    let discount = 0;
    if (promo.discount_type === 'percentage') {
      discount = total_amount * (promo.discount_value / 100);
      if (promo.max_discount) discount = Math.min(discount, promo.max_discount);
    } else {
      discount = promo.discount_value;
    }
    
    res.json({
      success: true,
      promo: {
        code: promo.code,
        name: promo.name,
        discount_type: promo.discount_type,
        discount_value: promo.discount_value,
        discount_amount: discount,
        final_amount: total_amount - discount
      }
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// BOOKING SESSION (for multi-step booking)
app.post('/sessions', async (req, res) => {
  try {
    await ensureTables();
    const { check_in, check_out, room_type, room_id, adults, children } = req.body;
    
    const id = generateId();
    const sessionToken = `BS${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min expiry
    
    // Get room price
    const room = get(`SELECT r.*, rt.base_price, rt.name as type_name FROM rooms r JOIN room_types rt ON r.room_type_id = rt.id WHERE r.id = ?`, [room_id]);
    const nights = Math.ceil((new Date(check_out) - new Date(check_in)) / (1000 * 60 * 60 * 24));
    const subtotal = room ? room.base_price * nights : 0;
    
    run(`INSERT INTO booking_sessions (id, session_token, check_in, check_out, room_type, room_id, adults, children, subtotal, total, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, sessionToken, check_in, check_out, room_type, room_id, adults || 1, children || 0, subtotal, subtotal, expiresAt, timestamp()]);
    
    run(`INSERT INTO booking_analytics (id, event_type, session_id, room_type, check_in, check_out, created_at) VALUES (?, 'session_started', ?, ?, ?, ?, ?)`,
      [generateId(), id, room_type, check_in, check_out, timestamp()]);
    
    res.json({ success: true, session: { id, token: sessionToken, expires_at: expiresAt, subtotal, total: subtotal } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/sessions/:token', async (req, res) => {
  try {
    await ensureTables();
    const session = get(`SELECT * FROM booking_sessions WHERE session_token = ? AND expires_at > datetime('now')`, [req.params.token]);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found or expired' });
    res.json({ success: true, session });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/sessions/:token/promo', async (req, res) => {
  try {
    await ensureTables();
    const { code } = req.body;
    const session = get(`SELECT * FROM booking_sessions WHERE session_token = ? AND expires_at > datetime('now')`, [req.params.token]);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found or expired' });
    
    // Validate and calculate discount
    const promo = get(`SELECT * FROM promo_codes WHERE code = ? AND is_active = 1`, [code.toUpperCase()]);
    if (!promo) return res.status(400).json({ success: false, error: 'Invalid promo code' });
    
    let discount = 0;
    if (promo.discount_type === 'percentage') {
      discount = session.subtotal * (promo.discount_value / 100);
      if (promo.max_discount) discount = Math.min(discount, promo.max_discount);
    } else {
      discount = promo.discount_value;
    }
    
    const total = session.subtotal - discount;
    run(`UPDATE booking_sessions SET promo_code = ?, discount = ?, total = ? WHERE id = ?`,
      [code.toUpperCase(), discount, total, session.id]);
    
    res.json({ success: true, discount, total });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// COMPLETE BOOKING
app.post('/book', async (req, res) => {
  try {
    await ensureTables();
    const { session_token, guest, payment_method, special_requests } = req.body;
    
    // Get session
    const session = session_token ? get(`SELECT * FROM booking_sessions WHERE session_token = ? AND expires_at > datetime('now')`, [session_token]) : null;
    
    // Direct booking without session
    const { room_id, check_in, check_out, adults, children, promo_code } = session || req.body;
    
    if (!room_id || !check_in || !check_out || !guest?.name || !guest?.email) {
      return res.status(400).json({ success: false, error: 'Missing required booking details' });
    }
    
    // Check availability one more time
    const conflict = get(`SELECT id FROM reservations WHERE room_id = ? AND status IN ('confirmed', 'checked_in') AND ((check_in_date <= ? AND check_out_date > ?) OR (check_in_date < ? AND check_out_date >= ?))`,
      [room_id, check_in, check_in, check_out, check_out]);
    if (conflict) return res.status(409).json({ success: false, error: 'Room is no longer available' });
    
    // Get or create guest
    let guestRecord = get(`SELECT id FROM guests WHERE email = ?`, [guest.email]);
    let guestId;
    if (guestRecord) {
      guestId = guestRecord.id;
      run(`UPDATE guests SET name = ?, phone = ? WHERE id = ?`, [guest.name, guest.phone, guestId]);
    } else {
      guestId = generateId();
      run(`INSERT INTO guests (id, name, email, phone, address, country, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [guestId, guest.name, guest.email, guest.phone, guest.address, guest.country, timestamp()]);
    }
    
    // Calculate total
    const room = get(`SELECT r.*, rt.base_price FROM rooms r JOIN room_types rt ON r.room_type_id = rt.id WHERE r.id = ?`, [room_id]);
    const nights = Math.ceil((new Date(check_out) - new Date(check_in)) / (1000 * 60 * 60 * 24));
    let subtotal = room.base_price * nights;
    let discount = 0;
    
    if (promo_code) {
      const promo = get(`SELECT * FROM promo_codes WHERE code = ? AND is_active = 1`, [promo_code.toUpperCase()]);
      if (promo) {
        if (promo.discount_type === 'percentage') {
          discount = subtotal * (promo.discount_value / 100);
          if (promo.max_discount) discount = Math.min(discount, promo.max_discount);
        } else {
          discount = promo.discount_value;
        }
        // Increment promo usage
        run(`UPDATE promo_codes SET current_uses = current_uses + 1 WHERE id = ?`, [promo.id]);
      }
    }
    
    const total = subtotal - discount;
    
    // Create reservation
    const reservationId = generateId();
    const confirmationNumber = `BK${Date.now().toString(36).toUpperCase()}`;
    
    run(`INSERT INTO reservations (id, confirmation_number, guest_id, room_id, check_in_date, check_out_date, adults, children, room_rate, total_amount, discount_amount, special_requests, source, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'booking_engine', 'confirmed', ?)`,
      [reservationId, confirmationNumber, guestId, room_id, check_in, check_out, adults || 1, children || 0, room.base_price, total, discount, special_requests, timestamp()]);
    
    // Update session if exists
    if (session) {
      run(`UPDATE booking_sessions SET status = 'completed', guest_email = ?, guest_name = ? WHERE id = ?`,
        [guest.email, guest.name, session.id]);
    }
    
    // Analytics
    run(`INSERT INTO booking_analytics (id, event_type, session_id, room_type, check_in, check_out, revenue, source, created_at) VALUES (?, 'booking_completed', ?, ?, ?, ?, ?, 'booking_engine', ?)`,
      [generateId(), session?.id, room.room_type, check_in, check_out, total, timestamp()]);
    
    res.json({
      success: true,
      booking: {
        id: reservationId,
        confirmation_number: confirmationNumber,
        room_number: room.room_number,
        check_in,
        check_out,
        nights,
        guest_name: guest.name,
        guest_email: guest.email,
        subtotal,
        discount,
        total,
        status: 'confirmed'
      }
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// BOOKING LOOKUP
app.get('/booking/:confirmation', async (req, res) => {
  try {
    await ensureTables();
    const booking = get(`
      SELECT r.*, g.name as guest_name, g.email as guest_email, g.phone as guest_phone,
             rm.room_number, rt.name as room_type_name
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      JOIN rooms rm ON r.room_id = rm.id
      JOIN room_types rt ON rm.room_type_id = rt.id
      WHERE r.confirmation_number = ? OR r.id = ?
    `, [req.params.confirmation, req.params.confirmation]);
    
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });
    res.json({ success: true, booking });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ANALYTICS
app.get('/analytics', async (req, res) => {
  try {
    await ensureTables();
    const { days = 30 } = req.query;
    
    const searches = get(`SELECT COUNT(*) as count FROM booking_analytics WHERE event_type = 'availability_search' AND created_at > datetime('now', '-${parseInt(days)} days')`);
    const sessions = get(`SELECT COUNT(*) as count FROM booking_analytics WHERE event_type = 'session_started' AND created_at > datetime('now', '-${parseInt(days)} days')`);
    const bookings = get(`SELECT COUNT(*) as count, SUM(revenue) as revenue FROM booking_analytics WHERE event_type = 'booking_completed' AND created_at > datetime('now', '-${parseInt(days)} days')`);
    
    const conversionRate = searches?.count > 0 ? ((bookings?.count || 0) / searches.count * 100).toFixed(1) : 0;
    
    const byDay = query(`SELECT DATE(created_at) as date, event_type, COUNT(*) as count, SUM(revenue) as revenue FROM booking_analytics WHERE created_at > datetime('now', '-${parseInt(days)} days') GROUP BY DATE(created_at), event_type ORDER BY date`);
    
    res.json({
      success: true,
      stats: {
        searches: searches?.count || 0,
        sessions_started: sessions?.count || 0,
        bookings: bookings?.count || 0,
        revenue: bookings?.revenue || 0,
        conversion_rate: conversionRate
      },
      by_day: byDay
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
