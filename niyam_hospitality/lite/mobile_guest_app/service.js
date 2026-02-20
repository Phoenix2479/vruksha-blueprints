/**
 * Mobile Guest App Backend Service - Niyam Hospitality (Max Lite)
 * API for guest-facing mobile app
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8969;
const SERVICE_NAME = 'mobile_guest_app';
const JWT_SECRET = process.env.JWT_SECRET || 'niyam_lite_secret_change_in_production';

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
// ADDITIONAL TABLES
// ============================================

async function ensureTables() {
  const db = await initDb();
  
  // Room service menu
  db.run(`
    CREATE TABLE IF NOT EXISTS room_service_menu (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'food',
      description TEXT,
      price REAL DEFAULT 0,
      preparation_time INTEGER DEFAULT 30,
      available_from TEXT,
      available_until TEXT,
      is_available INTEGER DEFAULT 1,
      image_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Room service orders
  db.run(`
    CREATE TABLE IF NOT EXISTS room_service_orders (
      id TEXT PRIMARY KEY,
      reservation_id TEXT NOT NULL,
      guest_id TEXT NOT NULL,
      room_id TEXT NOT NULL,
      order_number TEXT NOT NULL,
      items TEXT NOT NULL,
      special_instructions TEXT,
      requested_delivery_time TEXT,
      total_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      assigned_to TEXT,
      delivered_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Guest chat messages
  db.run(`
    CREATE TABLE IF NOT EXISTS guest_chat (
      id TEXT PRIMARY KEY,
      reservation_id TEXT NOT NULL,
      guest_id TEXT,
      sender_type TEXT DEFAULT 'guest',
      message TEXT NOT NULL,
      read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Guest device tokens (for push notifications)
  db.run(`
    CREATE TABLE IF NOT EXISTS guest_devices (
      id TEXT PRIMARY KEY,
      guest_id TEXT NOT NULL,
      device_token TEXT NOT NULL,
      platform TEXT DEFAULT 'ios',
      device_name TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(guest_id, device_token)
    )
  `);
  
  // Service bookings (spa, restaurant, etc.)
  db.run(`
    CREATE TABLE IF NOT EXISTS service_bookings (
      id TEXT PRIMARY KEY,
      reservation_id TEXT NOT NULL,
      guest_id TEXT NOT NULL,
      service_type TEXT NOT NULL,
      service_name TEXT,
      scheduled_date TEXT,
      scheduled_time TEXT,
      guest_count INTEGER DEFAULT 1,
      notes TEXT,
      status TEXT DEFAULT 'confirmed',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Hotel services catalog
  db.run(`
    CREATE TABLE IF NOT EXISTS hotel_services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      description TEXT,
      price REAL DEFAULT 0,
      duration_minutes INTEGER,
      location TEXT,
      is_bookable INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Loyalty transactions
  db.run(`
    CREATE TABLE IF NOT EXISTS loyalty_transactions (
      id TEXT PRIMARY KEY,
      guest_id TEXT NOT NULL,
      type TEXT DEFAULT 'earn',
      points INTEGER DEFAULT 0,
      description TEXT,
      reservation_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  return db;
}

// ============================================
// SIMPLE JWT HELPERS
// ============================================

function signToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  try {
    const [header, body, signature] = token.split('.');
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (signature !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// Auth middleware
function guestAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
  
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  
  req.guest = payload;
  next();
}

// ============================================
// GUEST AUTH
// ============================================

app.post('/auth/login', async (req, res) => {
  try {
    await ensureTables();
    const { email, confirmation_number, last_name } = req.body;
    
    if (!email || (!confirmation_number && !last_name)) {
      return res.status(400).json({ success: false, error: 'Email and confirmation number or last name required' });
    }
    
    let sql = `
      SELECT r.*, g.first_name, g.last_name, g.email, g.phone, g.id as guest_id,
             rm.room_number
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      LEFT JOIN rooms rm ON r.room_id = rm.id
      WHERE g.email = ? AND r.status IN ('confirmed', 'checked_in')
    `;
    const params = [email];
    
    if (confirmation_number) {
      sql += ` AND r.confirmation_number = ?`;
      params.push(confirmation_number);
    }
    if (last_name) {
      sql += ` AND g.last_name LIKE ?`;
      params.push(`%${last_name}%`);
    }
    
    sql += ` ORDER BY r.check_in_date DESC LIMIT 1`;
    
    const reservation = get(sql, params);
    
    if (!reservation) {
      return res.status(401).json({ success: false, error: 'Reservation not found' });
    }
    
    const token = signToken({
      guest_id: reservation.guest_id,
      reservation_id: reservation.id,
      type: 'guest'
    });
    
    res.json({
      success: true,
      token,
      guest: {
        id: reservation.guest_id,
        name: `${reservation.first_name || ''} ${reservation.last_name || ''}`.trim(),
        email: reservation.email,
        reservation_id: reservation.id,
        confirmation_number: reservation.confirmation_number,
        room_number: reservation.room_number,
        check_in: reservation.check_in_date,
        check_out: reservation.check_out_date,
        status: reservation.status
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// RESERVATION DETAILS
// ============================================

app.get('/reservation', guestAuth, async (req, res) => {
  try {
    await ensureTables();
    const { reservation_id } = req.guest;
    
    const reservation = get(`
      SELECT r.*, g.first_name, g.last_name, g.email, g.phone, g.preferences, g.loyalty_points, g.loyalty_tier,
             rm.room_number, rm.floor, rm.features,
             rt.name as room_type_name, rt.description as room_description, rt.amenities
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      LEFT JOIN rooms rm ON r.room_id = rm.id
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      WHERE r.id = ?
    `, [reservation_id]);
    
    if (!reservation) {
      return res.status(404).json({ success: false, error: 'Reservation not found' });
    }
    
    res.json({ success: true, reservation });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// DIGITAL KEY
// ============================================

app.get('/key', guestAuth, async (req, res) => {
  try {
    await ensureTables();
    const { reservation_id } = req.guest;
    
    const key = get(`
      SELECT dk.*, rm.room_number
      FROM digital_keys dk
      JOIN rooms rm ON dk.room_id = rm.id
      WHERE dk.reservation_id = ? AND dk.is_active = 1
      ORDER BY dk.created_at DESC LIMIT 1
    `, [reservation_id]);
    
    if (!key) {
      return res.status(404).json({ success: false, error: 'No active key found. Please complete check-in.' });
    }
    
    res.json({
      success: true,
      key: {
        code: key.key_code,
        room_number: key.room_number,
        valid_from: key.valid_from,
        valid_until: key.valid_until,
        qr_data: JSON.stringify({ type: 'room_key', code: key.key_code, room: key.room_number })
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// ROOM SERVICE MENU & ORDERS
// ============================================

app.get('/menu', guestAuth, async (req, res) => {
  try {
    await ensureTables();
    const { category } = req.query;
    
    let sql = `SELECT * FROM room_service_menu WHERE is_available = 1`;
    const params = [];
    
    if (category) {
      sql += ` AND category = ?`;
      params.push(category);
    }
    
    sql += ` ORDER BY category, name`;
    
    const items = query(sql, params);
    
    // Group by category
    const menu = {};
    items.forEach(item => {
      if (!menu[item.category]) menu[item.category] = [];
      menu[item.category].push(item);
    });
    
    res.json({ success: true, menu });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/orders', guestAuth, async (req, res) => {
  try {
    await ensureTables();
    const { guest_id, reservation_id } = req.guest;
    const { items, special_instructions, delivery_time } = req.body;
    
    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Items required' });
    }
    
    // Get room info
    const reservation = get(`SELECT room_id FROM reservations WHERE id = ?`, [reservation_id]);
    if (!reservation) {
      return res.status(404).json({ success: false, error: 'Reservation not found' });
    }
    
    // Calculate total
    let totalAmount = 0;
    const orderItems = [];
    
    for (const item of items) {
      const menuItem = get(`SELECT * FROM room_service_menu WHERE id = ?`, [item.menu_item_id]);
      if (menuItem) {
        const qty = item.quantity || 1;
        const subtotal = menuItem.price * qty;
        totalAmount += subtotal;
        orderItems.push({
          id: menuItem.id,
          name: menuItem.name,
          quantity: qty,
          unit_price: menuItem.price,
          subtotal
        });
      }
    }
    
    const orderId = generateId();
    const orderNumber = `RS${Date.now().toString(36).toUpperCase()}`;
    
    run(`
      INSERT INTO room_service_orders (id, reservation_id, guest_id, room_id, order_number, items, special_instructions, requested_delivery_time, total_amount, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `, [orderId, reservation_id, guest_id, reservation.room_id, orderNumber, JSON.stringify(orderItems), special_instructions, delivery_time, totalAmount, timestamp()]);
    
    // Add to folio
    run(`
      INSERT INTO guest_folios (id, reservation_id, guest_id, item_type, description, total_amount, department, posted_at)
      VALUES (?, ?, ?, 'room_service', 'Room Service Order #${orderNumber}', ?, 'F&B', ?)
    `, [generateId(), reservation_id, guest_id, totalAmount, timestamp()]);
    
    res.json({
      success: true,
      order: { id: orderId, order_number: orderNumber, total: totalAmount, status: 'pending' }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/orders', guestAuth, async (req, res) => {
  try {
    await ensureTables();
    const { reservation_id } = req.guest;
    
    const orders = query(`
      SELECT * FROM room_service_orders
      WHERE reservation_id = ?
      ORDER BY created_at DESC
    `, [reservation_id]);
    
    const formatted = orders.map(o => ({
      ...o,
      items: JSON.parse(o.items || '[]')
    }));
    
    res.json({ success: true, orders: formatted });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// SERVICE REQUESTS
// ============================================

app.get('/requests', guestAuth, async (req, res) => {
  try {
    await ensureTables();
    const { reservation_id } = req.guest;
    
    const requests = query(`
      SELECT * FROM guest_requests
      WHERE reservation_id = ?
      ORDER BY created_at DESC
    `, [reservation_id]);
    
    res.json({ success: true, requests });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/requests', guestAuth, async (req, res) => {
  try {
    await ensureTables();
    const { guest_id, reservation_id } = req.guest;
    const { request_type, category, description, priority } = req.body;
    
    const reservation = get(`SELECT room_id FROM reservations WHERE id = ?`, [reservation_id]);
    
    const id = generateId();
    run(`
      INSERT INTO guest_requests (id, reservation_id, guest_id, room_id, request_type, category, description, priority, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `, [id, reservation_id, guest_id, reservation?.room_id, request_type, category || 'general', description, priority || 'normal', timestamp()]);
    
    res.json({ success: true, request: { id, request_type, status: 'pending' } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// HOTEL SERVICES & BOOKINGS
// ============================================

app.get('/services', guestAuth, async (req, res) => {
  try {
    await ensureTables();
    
    const services = query(`SELECT * FROM hotel_services WHERE is_active = 1 ORDER BY category, name`);
    res.json({ success: true, services });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/services/:serviceId/book', guestAuth, async (req, res) => {
  try {
    await ensureTables();
    const { guest_id, reservation_id } = req.guest;
    const { serviceId } = req.params;
    const { date, time, guests, notes } = req.body;
    
    const service = get(`SELECT * FROM hotel_services WHERE id = ?`, [serviceId]);
    if (!service) {
      return res.status(404).json({ success: false, error: 'Service not found' });
    }
    
    const id = generateId();
    run(`
      INSERT INTO service_bookings (id, reservation_id, guest_id, service_type, service_name, scheduled_date, scheduled_time, guest_count, notes, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)
    `, [id, reservation_id, guest_id, service.category, service.name, date, time, guests || 1, notes, timestamp()]);
    
    res.json({ success: true, booking: { id, service_name: service.name, date, time, status: 'confirmed' } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/bookings', guestAuth, async (req, res) => {
  try {
    await ensureTables();
    const { reservation_id } = req.guest;
    
    const bookings = query(`SELECT * FROM service_bookings WHERE reservation_id = ? ORDER BY scheduled_date, scheduled_time`, [reservation_id]);
    res.json({ success: true, bookings });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// FOLIO / BILL
// ============================================

app.get('/folio', guestAuth, async (req, res) => {
  try {
    await ensureTables();
    const { reservation_id } = req.guest;
    
    const reservation = get(`
      SELECT r.*, rm.room_number
      FROM reservations r
      LEFT JOIN rooms rm ON r.room_id = rm.id
      WHERE r.id = ?
    `, [reservation_id]);
    
    if (!reservation) {
      return res.status(404).json({ success: false, error: 'Reservation not found' });
    }
    
    const charges = query(`SELECT * FROM guest_folios WHERE reservation_id = ? ORDER BY posted_at DESC`, [reservation_id]);
    const payments = query(`SELECT * FROM payments WHERE reservation_id = ? ORDER BY created_at DESC`, [reservation_id]);
    
    const totalCharges = (reservation.total_amount || 0) + charges.reduce((sum, c) => sum + (c.total_amount || 0), 0);
    const totalPayments = (reservation.deposit_amount || 0) + payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    
    res.json({
      success: true,
      folio: {
        reservation_id,
        room_number: reservation.room_number,
        check_in: reservation.check_in_date,
        check_out: reservation.check_out_date,
        room_charges: reservation.total_amount || 0,
        additional_charges: charges,
        payments,
        total_charges: totalCharges,
        total_payments: totalPayments,
        balance: totalCharges - totalPayments
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// FEEDBACK
// ============================================

app.post('/feedback', guestAuth, async (req, res) => {
  try {
    await ensureTables();
    const { guest_id, reservation_id } = req.guest;
    const { overall_rating, room_rating, service_rating, food_rating, cleanliness_rating, comments, would_recommend } = req.body;
    
    const id = generateId();
    run(`
      INSERT INTO guest_feedback (id, reservation_id, guest_id, category, rating, comment, created_at)
      VALUES (?, ?, ?, 'overall', ?, ?, ?)
    `, [id, reservation_id, guest_id, overall_rating, JSON.stringify({ room_rating, service_rating, food_rating, cleanliness_rating, comments, would_recommend }), timestamp()]);
    
    res.json({ success: true, feedback: { id } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// LOYALTY
// ============================================

app.get('/loyalty', guestAuth, async (req, res) => {
  try {
    await ensureTables();
    const { guest_id } = req.guest;
    
    const guest = get(`
      SELECT loyalty_points, loyalty_tier,
             (SELECT COUNT(*) FROM reservations WHERE guest_id = ? AND status = 'checked_out') as total_stays
      FROM guests WHERE id = ?
    `, [guest_id, guest_id]);
    
    const transactions = query(`
      SELECT * FROM loyalty_transactions WHERE guest_id = ? ORDER BY created_at DESC LIMIT 20
    `, [guest_id]);
    
    res.json({
      success: true,
      loyalty: {
        points: guest?.loyalty_points || 0,
        tier: guest?.loyalty_tier || 'standard',
        total_stays: guest?.total_stays || 0,
        transactions
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// CHAT
// ============================================

app.get('/chat/messages', guestAuth, async (req, res) => {
  try {
    await ensureTables();
    const { reservation_id } = req.guest;
    
    const messages = query(`SELECT * FROM guest_chat WHERE reservation_id = ? ORDER BY created_at ASC`, [reservation_id]);
    res.json({ success: true, messages });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/chat/messages', guestAuth, async (req, res) => {
  try {
    await ensureTables();
    const { guest_id, reservation_id } = req.guest;
    const { message } = req.body;
    
    const id = generateId();
    run(`INSERT INTO guest_chat (id, reservation_id, guest_id, sender_type, message, created_at) VALUES (?, ?, ?, 'guest', ?, ?)`,
      [id, reservation_id, guest_id, message, timestamp()]);
    
    res.json({ success: true, message: { id, message, sender_type: 'guest', created_at: timestamp() } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// PUSH NOTIFICATIONS (device registration)
// ============================================

app.post('/devices', guestAuth, async (req, res) => {
  try {
    await ensureTables();
    const { guest_id } = req.guest;
    const { device_token, platform, device_name } = req.body;
    
    run(`
      INSERT OR REPLACE INTO guest_devices (id, guest_id, device_token, platform, device_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [generateId(), guest_id, device_token, platform || 'ios', device_name, timestamp()]);
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// STARTUP
// ============================================

async function start() {
  await ensureTables();
  
  app.get('*', (req, res) => {
    if (fs.existsSync(path.join(uiPath, 'index.html'))) {
      res.sendFile(path.join(uiPath, 'index.html'));
    } else {
      res.json({ service: SERVICE_NAME, mode: 'lite', status: 'running' });
    }
  });
  
  app.listen(PORT, () => {
    console.log(`✅ ${SERVICE_NAME} (Lite) running on port ${PORT}`);
  });
}

start();
