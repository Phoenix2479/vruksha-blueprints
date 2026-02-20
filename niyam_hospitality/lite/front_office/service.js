/**
 * Front Office Service - Niyam Hospitality (Max Lite)
 * Handles reservations, check-in/out, arrivals, departures
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');
const { notifyAccounting } = require('../shared/accounting-hook');

const app = express();
const PORT = process.env.PORT || 8911;
const SERVICE_NAME = 'front_office';

app.use(cors());
app.use(express.json());

// Serve UI
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) {
  app.use(express.static(uiPath));
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: SERVICE_NAME, mode: 'lite' });
});

// ============================================
// ARRIVALS & DEPARTURES
// ============================================

app.get('/arrivals', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const arrivals = query(`
      SELECT 
        r.id, r.confirmation_number, r.check_in_date, r.check_out_date, 
        r.adults, r.children, r.status, r.special_requests, r.source,
        g.first_name, g.last_name, g.email, g.phone,
        rm.room_number, rt.name as room_type
      FROM reservations r
      LEFT JOIN guests g ON r.guest_id = g.id
      LEFT JOIN rooms rm ON r.room_id = rm.id
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      WHERE DATE(r.check_in_date) = ?
        AND r.status IN ('confirmed', 'checked_in')
      ORDER BY r.check_in_date ASC
    `, [today]);
    
    const formatted = arrivals.map(row => ({
      id: row.id,
      guest_name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Guest',
      email: row.email,
      phone: row.phone,
      room_number: row.room_number,
      room_type: row.room_type,
      reservation_id: row.confirmation_number,
      arrival_time: row.check_in_date,
      nights: Math.ceil((new Date(row.check_out_date) - new Date(row.check_in_date)) / (1000 * 60 * 60 * 24)),
      status: row.status,
      special_requests: row.special_requests,
      adults: row.adults,
      children: row.children,
      source: row.source
    }));
    
    res.json({ success: true, arrivals: formatted });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/departures', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const departures = query(`
      SELECT 
        r.id, r.confirmation_number, r.check_out_date, r.total_amount, r.balance_due,
        g.first_name, g.last_name, g.email, g.phone,
        rm.room_number, rt.name as room_type
      FROM reservations r
      LEFT JOIN guests g ON r.guest_id = g.id
      LEFT JOIN rooms rm ON r.room_id = rm.id
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      WHERE DATE(r.check_out_date) = ?
        AND r.status = 'checked_in'
      ORDER BY r.check_out_date ASC
    `, [today]);
    
    const formatted = departures.map(row => ({
      id: row.id,
      guest_name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Guest',
      room_number: row.room_number,
      checkout_time: row.check_out_date,
      balance: row.balance_due || 0
    }));
    
    res.json({ success: true, departures: formatted });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/inhouse', (req, res) => {
  try {
    const guests = query(`
      SELECT 
        r.id, r.check_in_date, r.check_out_date, r.total_amount, r.balance_due,
        g.first_name, g.last_name, g.phone,
        rm.room_number, rt.name as room_type
      FROM reservations r
      LEFT JOIN guests g ON r.guest_id = g.id
      LEFT JOIN rooms rm ON r.room_id = rm.id
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      WHERE r.status = 'checked_in'
      ORDER BY rm.room_number ASC
    `);
    
    res.json({ success: true, guests });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// RESERVATIONS
// ============================================

app.get('/api/reservations', (req, res) => {
  try {
    const { status, from_date, to_date } = req.query;
    let sql = `
      SELECT 
        r.*, 
        g.first_name, g.last_name, g.email, g.phone,
        rm.room_number, rt.name as room_type
      FROM reservations r
      LEFT JOIN guests g ON r.guest_id = g.id
      LEFT JOIN rooms rm ON r.room_id = rm.id
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      WHERE 1=1
    `;
    const params = [];
    
    if (status) {
      sql += ` AND r.status = ?`;
      params.push(status);
    }
    if (from_date) {
      sql += ` AND r.check_in_date >= ?`;
      params.push(from_date);
    }
    if (to_date) {
      sql += ` AND r.check_out_date <= ?`;
      params.push(to_date);
    }
    
    sql += ` ORDER BY r.check_in_date DESC`;
    
    const reservations = query(sql, params);
    res.json({ success: true, reservations });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/reservations/:id', (req, res) => {
  try {
    const reservation = get(`
      SELECT 
        r.*, 
        g.first_name, g.last_name, g.email, g.phone, g.address, g.id_type, g.id_number,
        rm.room_number, rt.name as room_type, rt.base_rate
      FROM reservations r
      LEFT JOIN guests g ON r.guest_id = g.id
      LEFT JOIN rooms rm ON r.room_id = rm.id
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      WHERE r.id = ?
    `, [req.params.id]);
    
    if (!reservation) {
      return res.status(404).json({ success: false, error: 'Reservation not found' });
    }
    
    // Get folio items
    const folio = query(`SELECT * FROM guest_folios WHERE reservation_id = ? ORDER BY posted_at DESC`, [req.params.id]);
    
    res.json({ success: true, reservation, folio });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/reservations', (req, res) => {
  try {
    const { 
      guest_id, room_id, room_type_id, 
      check_in_date, check_out_date, 
      adults, children, 
      rate_plan, room_rate, 
      special_requests, notes, source 
    } = req.body;
    
    const id = generateId();
    const confirmation_number = `RES-${Date.now().toString(36).toUpperCase()}`;
    
    // Calculate nights and total
    const nights = Math.ceil((new Date(check_out_date) - new Date(check_in_date)) / (1000 * 60 * 60 * 24));
    const total_amount = (room_rate || 0) * nights;
    
    run(`
      INSERT INTO reservations (
        id, guest_id, room_id, room_type_id, confirmation_number,
        check_in_date, check_out_date, adults, children,
        status, source, rate_plan, room_rate, total_amount, balance_due,
        special_requests, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, guest_id, room_id, room_type_id, confirmation_number,
      check_in_date, check_out_date, adults || 1, children || 0,
      source || 'direct', rate_plan, room_rate || 0, total_amount, total_amount,
      special_requests, notes, timestamp()
    ]);
    
    res.json({ success: true, reservation: { id, confirmation_number, total_amount } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/api/reservations/:id', (req, res) => {
  try {
    const { 
      room_id, room_type_id, 
      check_in_date, check_out_date, 
      adults, children, 
      rate_plan, room_rate, 
      special_requests, notes, status 
    } = req.body;
    
    run(`
      UPDATE reservations SET
        room_id = COALESCE(?, room_id),
        room_type_id = COALESCE(?, room_type_id),
        check_in_date = COALESCE(?, check_in_date),
        check_out_date = COALESCE(?, check_out_date),
        adults = COALESCE(?, adults),
        children = COALESCE(?, children),
        rate_plan = COALESCE(?, rate_plan),
        room_rate = COALESCE(?, room_rate),
        special_requests = COALESCE(?, special_requests),
        notes = COALESCE(?, notes),
        status = COALESCE(?, status),
        updated_at = ?
      WHERE id = ?
    `, [
      room_id, room_type_id, check_in_date, check_out_date,
      adults, children, rate_plan, room_rate,
      special_requests, notes, status, timestamp(), req.params.id
    ]);
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// CHECK-IN / CHECK-OUT
// ============================================

app.post('/checkin', (req, res) => {
  try {
    const { booking_id, id_proof_type, id_proof_number, room_id } = req.body;
    
    // Update reservation
    run(`
      UPDATE reservations SET 
        status = 'checked_in',
        actual_check_in = ?,
        room_id = COALESCE(?, room_id),
        updated_at = ?
      WHERE id = ?
    `, [timestamp(), room_id, timestamp(), booking_id]);
    
    // Update room status
    const reservation = get(`SELECT room_id FROM reservations WHERE id = ?`, [booking_id]);
    if (reservation?.room_id) {
      run(`UPDATE rooms SET status = 'occupied', updated_at = ? WHERE id = ?`, [timestamp(), reservation.room_id]);
    }
    
    // Update guest ID if provided
    if (id_proof_type || id_proof_number) {
      const res_guest = get(`SELECT guest_id FROM reservations WHERE id = ?`, [booking_id]);
      if (res_guest?.guest_id) {
        run(`UPDATE guests SET id_type = ?, id_number = ?, updated_at = ? WHERE id = ?`, 
          [id_proof_type, id_proof_number, timestamp(), res_guest.guest_id]);
      }
    }
    
    res.json({ success: true, message: 'Check-in completed' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/checkout', (req, res) => {
  try {
    const { booking_id, payment_method, payment_amount } = req.body;
    
    // Get reservation details
    const reservation = get(`SELECT * FROM reservations WHERE id = ?`, [booking_id]);
    if (!reservation) {
      return res.status(404).json({ success: false, error: 'Reservation not found' });
    }
    
    // Record payment if provided
    if (payment_amount && payment_amount > 0) {
      run(`
        INSERT INTO payments (id, reservation_id, guest_id, amount, payment_method, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [generateId(), booking_id, reservation.guest_id, payment_amount, payment_method, timestamp()]);
      
      // Update balance
      run(`
        UPDATE reservations SET balance_due = balance_due - ?, updated_at = ? WHERE id = ?
      `, [payment_amount, timestamp(), booking_id]);
    }
    
    // Update reservation status
    run(`
      UPDATE reservations SET 
        status = 'checked_out',
        actual_check_out = ?,
        updated_at = ?
      WHERE id = ?
    `, [timestamp(), timestamp(), booking_id]);
    
    // Update room status
    if (reservation.room_id) {
      run(`UPDATE rooms SET status = 'dirty', condition = 'dirty', updated_at = ? WHERE id = ?`, [timestamp(), reservation.room_id]);
    }
    
    notifyAccounting('hospitality', 'hospitality.front_office.checked_out', { reservation_id: booking_id, guest_id: reservation.guest_id, room_id: reservation.room_id, total_amount: reservation.total_amount, balance_due: reservation.balance_due, payment_amount: payment_amount || 0, payment_method });
    res.json({ success: true, message: 'Check-out completed' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// ROOMS
// ============================================

app.get('/api/rooms', (req, res) => {
  try {
    const { status, floor, room_type_id } = req.query;
    let sql = `
      SELECT r.*, rt.name as room_type_name, rt.base_rate
      FROM rooms r
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      WHERE 1=1
    `;
    const params = [];
    
    if (status) {
      sql += ` AND r.status = ?`;
      params.push(status);
    }
    if (floor) {
      sql += ` AND r.floor = ?`;
      params.push(floor);
    }
    if (room_type_id) {
      sql += ` AND r.room_type_id = ?`;
      params.push(room_type_id);
    }
    
    sql += ` ORDER BY r.room_number ASC`;
    
    const rooms = query(sql, params);
    res.json({ success: true, rooms });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/rooms/availability', (req, res) => {
  try {
    const { check_in, check_out, room_type_id } = req.query;
    
    // Get rooms not booked for the date range
    let sql = `
      SELECT r.*, rt.name as room_type_name, rt.base_rate
      FROM rooms r
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      WHERE r.status != 'out_of_order'
        AND r.id NOT IN (
          SELECT room_id FROM reservations 
          WHERE room_id IS NOT NULL
            AND status IN ('confirmed', 'checked_in')
            AND check_in_date < ?
            AND check_out_date > ?
        )
    `;
    const params = [check_out, check_in];
    
    if (room_type_id) {
      sql += ` AND r.room_type_id = ?`;
      params.push(room_type_id);
    }
    
    sql += ` ORDER BY r.room_number ASC`;
    
    const available = query(sql, params);
    res.json({ success: true, available_rooms: available });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/rooms', (req, res) => {
  try {
    const { room_number, room_type_id, floor, features, notes } = req.body;
    const id = generateId();
    
    run(`
      INSERT INTO rooms (id, room_type_id, room_number, floor, features, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, room_type_id, room_number, floor, JSON.stringify(features || []), notes, timestamp()]);
    
    res.json({ success: true, room: { id, room_number } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/api/rooms/:id/status', (req, res) => {
  try {
    const { status, condition, notes } = req.body;
    
    run(`
      UPDATE rooms SET 
        status = COALESCE(?, status),
        condition = COALESCE(?, condition),
        notes = COALESCE(?, notes),
        updated_at = ?
      WHERE id = ?
    `, [status, condition, notes, timestamp(), req.params.id]);
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// ROOM TYPES
// ============================================

app.get('/api/room-types', (req, res) => {
  try {
    const roomTypes = query(`SELECT * FROM room_types WHERE active = 1 ORDER BY name ASC`);
    res.json({ success: true, room_types: roomTypes });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/room-types', (req, res) => {
  try {
    const { name, description, base_rate, max_occupancy, amenities } = req.body;
    const id = generateId();
    
    run(`
      INSERT INTO room_types (id, name, description, base_rate, max_occupancy, amenities, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, name, description, base_rate || 0, max_occupancy || 2, JSON.stringify(amenities || []), timestamp()]);
    
    res.json({ success: true, room_type: { id, name } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// GUESTS
// ============================================

app.get('/api/guests', (req, res) => {
  try {
    const { search, limit } = req.query;
    let sql = `SELECT * FROM guests WHERE 1=1`;
    const params = [];
    
    if (search) {
      sql += ` AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }
    
    sql += ` ORDER BY created_at DESC`;
    
    if (limit) {
      sql += ` LIMIT ?`;
      params.push(parseInt(limit));
    }
    
    const guests = query(sql, params);
    res.json({ success: true, guests });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/guests/:id', (req, res) => {
  try {
    const guest = get(`SELECT * FROM guests WHERE id = ?`, [req.params.id]);
    if (!guest) {
      return res.status(404).json({ success: false, error: 'Guest not found' });
    }
    
    // Get stay history
    const stays = query(`
      SELECT r.*, rm.room_number, rt.name as room_type
      FROM reservations r
      LEFT JOIN rooms rm ON r.room_id = rm.id
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      WHERE r.guest_id = ?
      ORDER BY r.check_in_date DESC
    `, [req.params.id]);
    
    res.json({ success: true, guest, stays });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/guests', (req, res) => {
  try {
    const { 
      first_name, last_name, email, phone, 
      address, city, country, 
      id_type, id_number, date_of_birth, nationality,
      preferences, notes 
    } = req.body;
    
    const id = generateId();
    
    run(`
      INSERT INTO guests (
        id, first_name, last_name, email, phone,
        address, city, country, id_type, id_number,
        date_of_birth, nationality, preferences, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, first_name, last_name, email, phone,
      address, city, country, id_type, id_number,
      date_of_birth, nationality, JSON.stringify(preferences || {}), notes, timestamp()
    ]);
    
    res.json({ success: true, guest: { id, first_name, last_name } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/api/guests/:id', (req, res) => {
  try {
    const { 
      first_name, last_name, email, phone, 
      address, city, country, 
      id_type, id_number, preferences, notes 
    } = req.body;
    
    run(`
      UPDATE guests SET
        first_name = COALESCE(?, first_name),
        last_name = COALESCE(?, last_name),
        email = COALESCE(?, email),
        phone = COALESCE(?, phone),
        address = COALESCE(?, address),
        city = COALESCE(?, city),
        country = COALESCE(?, country),
        id_type = COALESCE(?, id_type),
        id_number = COALESCE(?, id_number),
        preferences = COALESCE(?, preferences),
        notes = COALESCE(?, notes),
        updated_at = ?
      WHERE id = ?
    `, [
      first_name, last_name, email, phone,
      address, city, country, id_type, id_number,
      preferences ? JSON.stringify(preferences) : null, notes,
      timestamp(), req.params.id
    ]);
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// FOLIO
// ============================================

app.get('/api/reservations/:id/folio', (req, res) => {
  try {
    const items = query(`
      SELECT * FROM guest_folios 
      WHERE reservation_id = ? 
      ORDER BY posted_at DESC
    `, [req.params.id]);
    
    const totals = get(`
      SELECT 
        SUM(total_amount) as total,
        SUM(tax_amount) as tax
      FROM guest_folios 
      WHERE reservation_id = ?
    `, [req.params.id]);
    
    res.json({ success: true, items, totals });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/reservations/:id/folio', (req, res) => {
  try {
    const { item_type, description, quantity, unit_price, department } = req.body;
    const id = generateId();
    const total_amount = (quantity || 1) * (unit_price || 0);
    const tax_amount = 0; // Can add tax calculation logic
    
    // Get guest_id from reservation
    const reservation = get(`SELECT guest_id FROM reservations WHERE id = ?`, [req.params.id]);
    
    run(`
      INSERT INTO guest_folios (
        id, reservation_id, guest_id, item_type, description,
        quantity, unit_price, total_amount, tax_amount, department, posted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, req.params.id, reservation?.guest_id, item_type, description,
      quantity || 1, unit_price || 0, total_amount, tax_amount, department, timestamp()
    ]);
    
    // Update reservation balance
    run(`
      UPDATE reservations SET balance_due = balance_due + ?, updated_at = ? WHERE id = ?
    `, [total_amount, timestamp(), req.params.id]);
    
    res.json({ success: true, item: { id, total_amount } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// DASHBOARD STATS
// ============================================

app.get('/api/dashboard/stats', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const totalRooms = get(`SELECT COUNT(*) as count FROM rooms WHERE status != 'out_of_order'`);
    const occupiedRooms = get(`SELECT COUNT(*) as count FROM rooms WHERE status = 'occupied'`);
    const arrivalsToday = get(`SELECT COUNT(*) as count FROM reservations WHERE DATE(check_in_date) = ? AND status IN ('confirmed', 'checked_in')`, [today]);
    const departuresToday = get(`SELECT COUNT(*) as count FROM reservations WHERE DATE(check_out_date) = ? AND status = 'checked_in'`, [today]);
    const inHouse = get(`SELECT COUNT(*) as count FROM reservations WHERE status = 'checked_in'`);
    
    const occupancy = totalRooms?.count > 0 
      ? Math.round((occupiedRooms?.count / totalRooms?.count) * 100) 
      : 0;
    
    res.json({
      success: true,
      stats: {
        total_rooms: totalRooms?.count || 0,
        occupied_rooms: occupiedRooms?.count || 0,
        available_rooms: (totalRooms?.count || 0) - (occupiedRooms?.count || 0),
        occupancy_rate: occupancy,
        arrivals_today: arrivalsToday?.count || 0,
        departures_today: departuresToday?.count || 0,
        in_house_guests: inHouse?.count || 0
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({ service: SERVICE_NAME, status: 'running', mode: 'lite' });
  }
});

// Start server
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[${SERVICE_NAME}] Lite service running on http://localhost:${PORT}`);
    });
  })
  .catch(e => {
    console.error(`[${SERVICE_NAME}] Failed to start:`, e);
    process.exit(1);
  });
