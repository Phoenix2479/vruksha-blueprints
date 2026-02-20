// Front Office Service - Niyam Hospitality
// Handles reservations, check-in/out, arrivals, departures

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const promClient = require('prom-client');
const { z } = require('zod');

let db, sdk, kvStore;
try {
  db = require('../../../../db/postgres');
  sdk = require('../../../../platform/sdk/node');
  kvStore = require('../../../../platform/nats/kv_store');
} catch (_) {
  db = require('@vruksha/platform/db/postgres');
  sdk = require('@vruksha/platform/sdk/node');
  kvStore = require('@vruksha/platform/nats/kv_store');
}

const { query, getClient } = db;
const { publishEnvelope } = sdk;

const app = express();
const SERVICE_NAME = 'front_office';
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Observability
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

// Auth
const SKIP_AUTH = (process.env.SKIP_AUTH || 'true').toLowerCase() === 'true';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

app.use((req, res, next) => {
  if (SKIP_AUTH) return next();
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try { req.user = jwt.verify(token, JWT_SECRET); } catch (e) {}
  }
  next();
});

function getTenantId(req) {
  return req.headers['x-tenant-id'] || req.user?.tenant_id || DEFAULT_TENANT_ID;
}

// NATS KV
let dbReady = false;
(async () => {
  try {
    await kvStore.connect();
    console.log(`✅ ${SERVICE_NAME}: NATS KV Connected`);
    dbReady = true;
  } catch (e) {
    console.error(`❌ ${SERVICE_NAME}: NATS KV Failed`, e);
  }
})();

// ============================================
// ARRIVALS & DEPARTURES
// ============================================

// Get today's arrivals
app.get('/arrivals', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const today = new Date().toISOString().split('T')[0];
    
    const result = await query(`
      SELECT 
        b.id, b.status, b.check_in_date, b.check_out_date, b.adults_count, b.children_count, b.notes, b.source,
        g.full_name as guest_name, g.email, g.phone, g.preferences,
        r.room_number, r.room_type, r.floor_number
      FROM hotel_bookings b
      JOIN hotel_guests g ON b.guest_id = g.id
      JOIN hotel_rooms r ON b.room_id = r.id
      WHERE b.tenant_id = $1 
        AND DATE(b.check_in_date) = $2
        AND b.status IN ('confirmed', 'checked_in')
      ORDER BY b.check_in_date ASC
    `, [tenantId, today]);
    
    const arrivals = result.rows.map(row => ({
      id: row.id,
      guest_name: row.guest_name,
      email: row.email,
      phone: row.phone,
      room_number: row.room_number,
      room_type: row.room_type,
      reservation_id: `RES-${row.id.slice(0, 8).toUpperCase()}`,
      arrival_time: new Date(row.check_in_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      nights: Math.ceil((new Date(row.check_out_date) - new Date(row.check_in_date)) / (1000 * 60 * 60 * 24)),
      status: row.status === 'checked_in' ? 'checked_in' : 'expected',
      special_requests: row.notes,
      adults: row.adults_count,
      children: row.children_count,
      source: row.source
    }));
    
    res.json({ success: true, arrivals });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get today's departures
app.get('/departures', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const today = new Date().toISOString().split('T')[0];
    
    const result = await query(`
      SELECT 
        b.id, b.status, b.check_out_date, b.total_amount, b.paid_amount, b.payment_status,
        g.full_name as guest_name, g.email, g.phone,
        r.room_number, r.room_type
      FROM hotel_bookings b
      JOIN hotel_guests g ON b.guest_id = g.id
      JOIN hotel_rooms r ON b.room_id = r.id
      WHERE b.tenant_id = $1 
        AND DATE(b.check_out_date) = $2
        AND b.status = 'checked_in'
      ORDER BY b.check_out_date ASC
    `, [tenantId, today]);
    
    const departures = result.rows.map(row => ({
      id: row.id,
      guest_name: row.guest_name,
      room_number: row.room_number,
      checkout_time: new Date(row.check_out_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      balance: parseFloat(row.total_amount) - parseFloat(row.paid_amount),
      payment_status: row.payment_status
    }));
    
    res.json({ success: true, departures });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get in-house guests
app.get('/inhouse', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    
    const result = await query(`
      SELECT 
        b.id, b.check_in_date, b.check_out_date, b.total_amount, b.paid_amount,
        g.full_name as guest_name, g.phone,
        r.room_number, r.room_type, r.floor_number
      FROM hotel_bookings b
      JOIN hotel_guests g ON b.guest_id = g.id
      JOIN hotel_rooms r ON b.room_id = r.id
      WHERE b.tenant_id = $1 AND b.status = 'checked_in'
      ORDER BY r.room_number ASC
    `, [tenantId]);
    
    res.json({ success: true, guests: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// CHECK-IN / CHECK-OUT
// ============================================

const CheckInSchema = z.object({
  booking_id: z.string().uuid(),
  id_proof_type: z.string().optional(),
  id_proof_number: z.string().optional(),
  payment_method: z.string().optional()
});

app.post('/checkin', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const parsed = CheckInSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const { booking_id, id_proof_type, id_proof_number } = parsed.data;
    
    await client.query('BEGIN');
    
    // Update booking status
    const bookingRes = await client.query(`
      UPDATE hotel_bookings 
      SET status = 'checked_in', checked_in_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
      RETURNING *, (SELECT room_id FROM hotel_bookings WHERE id = $1) as room_id
    `, [booking_id, tenantId]);
    
    if (bookingRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    const booking = bookingRes.rows[0];
    
    // Update room status
    await client.query(`
      UPDATE hotel_rooms SET status = 'occupied', updated_at = NOW()
      WHERE id = $1
    `, [booking.room_id]);
    
    // Update guest ID proof if provided
    if (id_proof_type && id_proof_number) {
      await client.query(`
        UPDATE hotel_guests SET id_proof_type = $1, id_proof_number = $2, updated_at = NOW()
        WHERE id = $3
      `, [id_proof_type, id_proof_number, booking.guest_id]);
    }
    
    await client.query('COMMIT');
    
    await publishEnvelope('hospitality.front_office.checked_in.v1', 1, { 
      booking_id, 
      room_id: booking.room_id,
      timestamp: new Date().toISOString()
    });
    
    res.json({ success: true, message: 'Guest checked in successfully', booking });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

app.post('/checkout', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { booking_id, payment_method } = req.body;
    
    await client.query('BEGIN');
    
    // Get booking details
    const bookingRes = await client.query(`
      SELECT b.*, r.id as room_id 
      FROM hotel_bookings b
      JOIN hotel_rooms r ON b.room_id = r.id
      WHERE b.id = $1 AND b.tenant_id = $2 AND b.status = 'checked_in'
    `, [booking_id, tenantId]);
    
    if (bookingRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Active booking not found' });
    }
    
    const booking = bookingRes.rows[0];
    const balance = parseFloat(booking.total_amount) - parseFloat(booking.paid_amount);
    
    // Update booking
    await client.query(`
      UPDATE hotel_bookings 
      SET status = 'checked_out', checked_out_at = NOW(), payment_status = 'paid', 
          paid_amount = total_amount, payment_method = $1, updated_at = NOW()
      WHERE id = $2
    `, [payment_method || 'cash', booking_id]);
    
    // Update room status to dirty (needs cleaning)
    await client.query(`
      UPDATE hotel_rooms SET status = 'dirty', updated_at = NOW()
      WHERE id = $1
    `, [booking.room_id]);
    
    // Create housekeeping task
    await client.query(`
      INSERT INTO hotel_housekeeping_tasks (tenant_id, room_id, task_type, priority, status)
      VALUES ($1, $2, 'cleaning', 'medium', 'pending')
    `, [tenantId, booking.room_id]);
    
    await client.query('COMMIT');
    
    await publishEnvelope('hospitality.front_office.checked_out.v1', 1, { 
      booking_id, 
      room_id: booking.room_id,
      checkout_date: new Date().toISOString(),
      total_amount: parseFloat(booking.total_amount),
      paid_amount: parseFloat(booking.total_amount), // Now fully paid
      outstanding_balance: 0, // Settled at checkout
      balance_settled: balance,
      payment_method: payment_method || 'cash'
    });
    
    res.json({ success: true, message: 'Guest checked out successfully', balance_settled: balance });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ============================================
// RESERVATIONS
// ============================================

app.get('/reservations', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { status, from_date, to_date } = req.query;
    
    let sql = `
      SELECT 
        b.*, g.full_name as guest_name, g.email, g.phone,
        r.room_number, r.room_type
      FROM hotel_bookings b
      JOIN hotel_guests g ON b.guest_id = g.id
      JOIN hotel_rooms r ON b.room_id = r.id
      WHERE b.tenant_id = $1
    `;
    const params = [tenantId];
    let paramIdx = 2;
    
    if (status) {
      sql += ` AND b.status = $${paramIdx++}`;
      params.push(status);
    }
    if (from_date) {
      sql += ` AND b.check_in_date >= $${paramIdx++}`;
      params.push(from_date);
    }
    if (to_date) {
      sql += ` AND b.check_in_date <= $${paramIdx++}`;
      params.push(to_date);
    }
    
    sql += ' ORDER BY b.check_in_date DESC LIMIT 100';
    
    const result = await query(sql, params);
    res.json({ success: true, reservations: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const ReservationSchema = z.object({
  guest_id: z.string().uuid().optional(),
  guest_name: z.string().min(1),
  guest_email: z.string().email().optional(),
  guest_phone: z.string().optional(),
  room_id: z.string().uuid(),
  check_in_date: z.string(),
  check_out_date: z.string(),
  adults_count: z.number().min(1).default(1),
  children_count: z.number().min(0).default(0),
  notes: z.string().optional(),
  source: z.string().default('walk_in')
});

app.post('/reservations', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const parsed = ReservationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const data = parsed.data;
    
    await client.query('BEGIN');
    
    // Create or get guest
    let guestId = data.guest_id;
    if (!guestId) {
      const guestRes = await client.query(`
        INSERT INTO hotel_guests (tenant_id, full_name, email, phone)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `, [tenantId, data.guest_name, data.guest_email, data.guest_phone]);
      guestId = guestRes.rows[0].id;
    }
    
    // Get room price
    const roomRes = await client.query('SELECT price_per_night FROM hotel_rooms WHERE id = $1', [data.room_id]);
    if (roomRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Room not found' });
    }
    
    const nights = Math.ceil((new Date(data.check_out_date) - new Date(data.check_in_date)) / (1000 * 60 * 60 * 24));
    const totalAmount = parseFloat(roomRes.rows[0].price_per_night) * nights;
    
    // Create booking
    const bookingRes = await client.query(`
      INSERT INTO hotel_bookings (tenant_id, guest_id, room_id, check_in_date, check_out_date, 
        status, total_amount, adults_count, children_count, notes, source)
      VALUES ($1, $2, $3, $4, $5, 'confirmed', $6, $7, $8, $9, $10)
      RETURNING *
    `, [tenantId, guestId, data.room_id, data.check_in_date, data.check_out_date, 
        totalAmount, data.adults_count, data.children_count, data.notes, data.source]);
    
    // Update room status to reserved
    await client.query(`
      UPDATE hotel_rooms SET status = 'reserved', updated_at = NOW() WHERE id = $1
    `, [data.room_id]);
    
    await client.query('COMMIT');
    
    await publishEnvelope('hospitality.front_office.reservation_created.v1', 1, { 
      booking_id: bookingRes.rows[0].id,
      guest_id: guestId
    });
    
    res.json({ success: true, reservation: bookingRes.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ============================================
// STATS
// ============================================

app.get('/stats', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const today = new Date().toISOString().split('T')[0];
    
    const [arrivalsRes, departuresRes, inhouseRes, roomsRes] = await Promise.all([
      query(`SELECT COUNT(*) FROM hotel_bookings WHERE tenant_id = $1 AND DATE(check_in_date) = $2 AND status = 'confirmed'`, [tenantId, today]),
      query(`SELECT COUNT(*) FROM hotel_bookings WHERE tenant_id = $1 AND DATE(check_out_date) = $2 AND status = 'checked_in'`, [tenantId, today]),
      query(`SELECT COUNT(*) FROM hotel_bookings WHERE tenant_id = $1 AND status = 'checked_in'`, [tenantId]),
      query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'available') as available FROM hotel_rooms WHERE tenant_id = $1`, [tenantId])
    ]);
    
    res.json({
      success: true,
      stats: {
        expected_arrivals: parseInt(arrivalsRes.rows[0].count),
        departures_today: parseInt(departuresRes.rows[0].count),
        inhouse_guests: parseInt(inhouseRes.rows[0].count),
        total_rooms: parseInt(roomsRes.rows[0].total),
        available_rooms: parseInt(roomsRes.rows[0].available),
        occupancy_rate: roomsRes.rows[0].total > 0 
          ? Math.round((1 - roomsRes.rows[0].available / roomsRes.rows[0].total) * 100) 
          : 0
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// ROOM AVAILABILITY GRID (for timeline view)
// ============================================

app.get('/rooms/availability', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { from_date, to_date, room_type } = req.query;
    
    if (!from_date || !to_date) {
      return res.status(400).json({ error: 'from_date and to_date required' });
    }
    
    // Get all rooms with their bookings in date range
    let roomSql = `
      SELECT r.id, r.room_number, r.room_type, r.floor_number, r.status, r.amenities, r.max_occupancy
      FROM hotel_rooms r
      WHERE r.tenant_id = $1
    `;
    const roomParams = [tenantId];
    
    if (room_type) {
      roomSql += ` AND r.room_type = $2`;
      roomParams.push(room_type);
    }
    roomSql += ' ORDER BY r.room_number';
    
    const roomsRes = await query(roomSql, roomParams);
    
    // Get bookings for these rooms in date range
    const bookingsRes = await query(`
      SELECT b.id, b.room_id, b.guest_id, b.check_in_date, b.check_out_date, b.status,
             g.full_name as guest_name, g.phone as guest_phone
      FROM hotel_bookings b
      JOIN hotel_guests g ON b.guest_id = g.id
      WHERE b.tenant_id = $1 
        AND b.status IN ('confirmed', 'checked_in')
        AND (
          (b.check_in_date <= $3 AND b.check_out_date > $2) OR
          (b.check_in_date >= $2 AND b.check_in_date < $3)
        )
      ORDER BY b.check_in_date
    `, [tenantId, from_date, to_date]);
    
    // Build room availability map
    const roomMap = new Map();
    roomsRes.rows.forEach(room => {
      roomMap.set(room.id, {
        ...room,
        bookings: []
      });
    });
    
    bookingsRes.rows.forEach(booking => {
      if (roomMap.has(booking.room_id)) {
        roomMap.get(booking.room_id).bookings.push({
          booking_id: booking.id,
          guest_id: booking.guest_id,
          guest_name: booking.guest_name,
          check_in: booking.check_in_date,
          check_out: booking.check_out_date,
          status: booking.status
        });
      }
    });
    
    res.json({
      success: true,
      date_range: { from: from_date, to: to_date },
      rooms: Array.from(roomMap.values())
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// ROOM STATUS MANAGEMENT
// ============================================

app.get('/rooms', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { status, floor, room_type } = req.query;
    
    let sql = `
      SELECT r.*, 
             b.id as current_booking_id, b.guest_id, g.full_name as guest_name,
             b.check_in_date, b.check_out_date
      FROM hotel_rooms r
      LEFT JOIN hotel_bookings b ON r.id = b.room_id AND b.status = 'checked_in'
      LEFT JOIN hotel_guests g ON b.guest_id = g.id
      WHERE r.tenant_id = $1
    `;
    const params = [tenantId];
    let idx = 2;
    
    if (status) { sql += ` AND r.status = $${idx++}`; params.push(status); }
    if (floor) { sql += ` AND r.floor_number = $${idx++}`; params.push(floor); }
    if (room_type) { sql += ` AND r.room_type = $${idx++}`; params.push(room_type); }
    
    sql += ' ORDER BY r.room_number';
    
    const result = await query(sql, params);
    res.json({ success: true, rooms: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/rooms/:roomId/status', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { roomId } = req.params;
    const { status, notes } = req.body;
    
    const validStatuses = ['available', 'occupied', 'reserved', 'dirty', 'clean', 'maintenance', 'out_of_order'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const result = await query(`
      UPDATE hotel_rooms SET status = $1, notes = COALESCE($2, notes), updated_at = NOW()
      WHERE id = $3 AND tenant_id = $4
      RETURNING *
    `, [status, notes, roomId, tenantId]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    res.json({ success: true, room: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// QUICK ACTIONS
// ============================================

// Room swap (move guest to different room)
app.post('/swap-room', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { booking_id, new_room_id, reason } = req.body;
    
    await client.query('BEGIN');
    
    // Get current booking
    const bookingRes = await client.query(`
      SELECT b.*, r.id as old_room_id, r.room_number as old_room_number
      FROM hotel_bookings b
      JOIN hotel_rooms r ON b.room_id = r.id
      WHERE b.id = $1 AND b.tenant_id = $2 AND b.status = 'checked_in'
    `, [booking_id, tenantId]);
    
    if (bookingRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Active booking not found' });
    }
    
    const booking = bookingRes.rows[0];
    
    // Check new room is available
    const newRoomRes = await client.query(`
      SELECT * FROM hotel_rooms WHERE id = $1 AND tenant_id = $2 AND status = 'available'
    `, [new_room_id, tenantId]);
    
    if (newRoomRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'New room not available' });
    }
    
    const newRoom = newRoomRes.rows[0];
    
    // Update booking
    await client.query(`UPDATE hotel_bookings SET room_id = $1, updated_at = NOW() WHERE id = $2`, [new_room_id, booking_id]);
    
    // Update old room status
    await client.query(`UPDATE hotel_rooms SET status = 'dirty', updated_at = NOW() WHERE id = $1`, [booking.old_room_id]);
    
    // Update new room status
    await client.query(`UPDATE hotel_rooms SET status = 'occupied', updated_at = NOW() WHERE id = $1`, [new_room_id]);
    
    // Log the swap
    await client.query(`
      INSERT INTO hotel_room_moves (tenant_id, booking_id, from_room_id, to_room_id, reason, moved_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [tenantId, booking_id, booking.old_room_id, new_room_id, reason]);
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      message: `Guest moved from ${booking.old_room_number} to ${newRoom.room_number}`,
      old_room: booking.old_room_number,
      new_room: newRoom.room_number
    });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// Extend stay
app.post('/extend-stay', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { booking_id, new_checkout_date } = req.body;
    
    await client.query('BEGIN');
    
    // Get booking
    const bookingRes = await client.query(`
      SELECT b.*, r.price_per_night
      FROM hotel_bookings b
      JOIN hotel_rooms r ON b.room_id = r.id
      WHERE b.id = $1 AND b.tenant_id = $2 AND b.status = 'checked_in'
    `, [booking_id, tenantId]);
    
    if (bookingRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Active booking not found' });
    }
    
    const booking = bookingRes.rows[0];
    const oldCheckout = new Date(booking.check_out_date);
    const newCheckout = new Date(new_checkout_date);
    
    if (newCheckout <= oldCheckout) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'New checkout must be after current checkout' });
    }
    
    // Check room availability for extended dates
    const conflictRes = await client.query(`
      SELECT id FROM hotel_bookings 
      WHERE room_id = $1 AND id != $2 AND status IN ('confirmed', 'checked_in')
        AND check_in_date < $3 AND check_out_date > $4
    `, [booking.room_id, booking_id, new_checkout_date, booking.check_out_date]);
    
    if (conflictRes.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Room not available for extended dates' });
    }
    
    // Calculate additional amount
    const additionalNights = Math.ceil((newCheckout - oldCheckout) / (1000 * 60 * 60 * 24));
    const additionalAmount = parseFloat(booking.price_per_night) * additionalNights;
    const newTotal = parseFloat(booking.total_amount) + additionalAmount;
    
    // Update booking
    await client.query(`
      UPDATE hotel_bookings 
      SET check_out_date = $1, total_amount = $2, updated_at = NOW()
      WHERE id = $3
    `, [new_checkout_date, newTotal, booking_id]);
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      additional_nights: additionalNights,
      additional_amount: additionalAmount,
      new_total: newTotal,
      new_checkout: new_checkout_date
    });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// Early checkout
app.post('/early-checkout', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { booking_id, reason } = req.body;
    
    await client.query('BEGIN');
    
    const bookingRes = await client.query(`
      SELECT b.*, r.price_per_night
      FROM hotel_bookings b
      JOIN hotel_rooms r ON b.room_id = r.id
      WHERE b.id = $1 AND b.tenant_id = $2 AND b.status = 'checked_in'
    `, [booking_id, tenantId]);
    
    if (bookingRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Active booking not found' });
    }
    
    const booking = bookingRes.rows[0];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Recalculate amount
    const actualNights = Math.max(1, Math.ceil((today - new Date(booking.check_in_date)) / (1000 * 60 * 60 * 24)));
    const adjustedAmount = parseFloat(booking.price_per_night) * actualNights;
    const refund = parseFloat(booking.paid_amount) - adjustedAmount;
    
    // Update booking
    await client.query(`
      UPDATE hotel_bookings 
      SET check_out_date = $1, total_amount = $2, status = 'checked_out', 
          checked_out_at = NOW(), notes = CONCAT(COALESCE(notes, ''), ' | Early checkout: ', $3)
      WHERE id = $4
    `, [today.toISOString().split('T')[0], adjustedAmount, reason, booking_id]);
    
    // Update room
    await client.query(`UPDATE hotel_rooms SET status = 'dirty' WHERE id = $1`, [booking.room_id]);
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      actual_nights: actualNights,
      adjusted_amount: adjustedAmount,
      potential_refund: refund > 0 ? refund : 0
    });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// No-show processing
app.post('/no-show', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { booking_id, charge_first_night } = req.body;
    
    await client.query('BEGIN');
    
    const bookingRes = await client.query(`
      SELECT b.*, r.price_per_night
      FROM hotel_bookings b
      JOIN hotel_rooms r ON b.room_id = r.id
      WHERE b.id = $1 AND b.tenant_id = $2 AND b.status = 'confirmed'
    `, [booking_id, tenantId]);
    
    if (bookingRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Confirmed booking not found' });
    }
    
    const booking = bookingRes.rows[0];
    const chargeAmount = charge_first_night ? parseFloat(booking.price_per_night) : 0;
    
    await client.query(`
      UPDATE hotel_bookings 
      SET status = 'no_show', total_amount = $1, updated_at = NOW()
      WHERE id = $2
    `, [chargeAmount, booking_id]);
    
    // Release room
    await client.query(`UPDATE hotel_rooms SET status = 'available' WHERE id = $1`, [booking.room_id]);
    
    await client.query('COMMIT');
    
    res.json({ success: true, charged_amount: chargeAmount });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ============================================
// SEARCH
// ============================================

app.get('/search', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search query too short' });
    }
    
    // Search guests, bookings, and rooms
    const [guestsRes, bookingsRes, roomsRes] = await Promise.all([
      query(`
        SELECT id, full_name, email, phone, 'guest' as type
        FROM hotel_guests
        WHERE tenant_id = $1 AND (full_name ILIKE $2 OR email ILIKE $2 OR phone ILIKE $2)
        LIMIT 10
      `, [tenantId, `%${q}%`]),
      
      query(`
        SELECT b.id, b.confirmation_number, g.full_name, r.room_number, b.status, 'booking' as type
        FROM hotel_bookings b
        JOIN hotel_guests g ON b.guest_id = g.id
        JOIN hotel_rooms r ON b.room_id = r.id
        WHERE b.tenant_id = $1 AND (b.confirmation_number ILIKE $2 OR g.full_name ILIKE $2)
        LIMIT 10
      `, [tenantId, `%${q}%`]),
      
      query(`
        SELECT id, room_number, room_type, status, 'room' as type
        FROM hotel_rooms
        WHERE tenant_id = $1 AND room_number ILIKE $2
        LIMIT 10
      `, [tenantId, `%${q}%`])
    ]);
    
    res.json({
      success: true,
      results: {
        guests: guestsRes.rows,
        bookings: bookingsRes.rows,
        rooms: roomsRes.rows
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME }));
app.get('/readyz', (req, res) => res.json({ status: dbReady ? 'ready' : 'not_ready' }));

// ============================================
// SERVE EMBEDDED UI
// ============================================

const UI_DIST = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(UI_DIST)) {
  console.log('📦 Serving embedded UI from ui/dist');
  app.use(express.static(UI_DIST));
  
  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res, next) => {
    // Skip API and health routes
    if (req.path.startsWith('/api') || 
        req.path.startsWith('/arrivals') || 
        req.path.startsWith('/departures') || 
        req.path.startsWith('/inhouse') ||
        req.path.startsWith('/checkin') ||
        req.path.startsWith('/checkout') ||
        req.path.startsWith('/reservations') ||
        req.path.startsWith('/rooms') ||
        req.path.startsWith('/stats') ||
        req.path.startsWith('/search') ||
        req.path.startsWith('/swap-room') ||
        req.path.startsWith('/extend-stay') ||
        req.path.startsWith('/early-checkout') ||
        req.path.startsWith('/no-show') ||
        req.path.startsWith('/health') ||
        req.path.startsWith('/metrics')) {
      return next();
    }
    res.sendFile(path.join(UI_DIST, 'index.html'));
  });
} else {
  // Fallback: serve a simple HTML page
  app.get('/', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Front Office - Niyam Hospitality</title></head>
        <body style="font-family: system-ui; padding: 2rem; text-align: center;">
          <h1>🏨 Front Office Service</h1>
          <p>Service is running on port ${process.env.PORT || 8911}</p>
          <p><a href="/healthz">Health Check</a> | <a href="/stats">Stats</a></p>
          <p style="color: #666; font-size: 0.875rem;">UI not found at ${UI_DIST}</p>
        </body>
      </html>
    `);
  });
}

const PORT = process.env.PORT || 8911;
app.listen(PORT, () => {
  console.log(`\n✅ Front Office Service listening on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
  if (fs.existsSync(UI_DIST)) {
    console.log(`🖥️  UI: http://localhost:${PORT} (embedded)`);
  }
  console.log(`\n📦 Features:`);
  console.log(`   • Arrivals:        GET  /arrivals`);
  console.log(`   • Departures:      GET  /departures`);
  console.log(`   • In-House:        GET  /inhouse`);
  console.log(`   • Check-In:        POST /checkin`);
  console.log(`   • Check-Out:       POST /checkout`);
  console.log(`   • Reservations:    GET  /reservations, POST /reservations`);
  console.log(`   • Rooms:           GET  /rooms, PATCH /rooms/:id/status`);
  console.log(`   • Room Swap:       POST /swap-room`);
  console.log(`   • Extend Stay:     POST /extend-stay`);
  console.log(`   • Early Checkout:  POST /early-checkout`);
  console.log(`   • No-Show:         POST /no-show`);
  console.log(`   • Search:          GET  /search?q=...`);
  console.log(`   • Stats:           GET  /stats`);
  console.log(`\n`);
});
