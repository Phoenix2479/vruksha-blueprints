// Mobile Guest App Backend Service - Niyam Hospitality
// API for guest-facing mobile app

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const promClient = require('prom-client');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');

let db, sdk, kvStore;
try {
  db = require('../../../../db/postgres');
  sdk = require('../../../../platform/sdk/node');
  kvStore = require('../../../../platform/nats/kv_store');
} catch (_) {
  db = { query: async () => ({ rows: [] }), getClient: async () => ({ query: async () => ({ rows: [], rowCount: 0 }), release: () => {} }) };
  sdk = { publishEnvelope: async () => {} };
  kvStore = { connect: async () => {} };
}

const { query, getClient } = db;
const { publishEnvelope } = sdk;

const app = express();
const SERVICE_NAME = 'mobile_guest_app';
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
app.get('/metrics', async (req, res) => { res.set('Content-Type', registry.contentType); res.end(await registry.metrics()); });

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

// Guest auth middleware
function guestAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.guest = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function getTenantId(req) { return req.headers['x-tenant-id'] || req.guest?.tenant_id || DEFAULT_TENANT_ID; }

let natsReady = false;
(async () => { try { await kvStore.connect(); natsReady = true; } catch (e) {} })();

// ============================================
// GUEST AUTH
// ============================================

app.post('/auth/login', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || DEFAULT_TENANT_ID;
    const { email, confirmation_number, last_name } = req.body;
    
    // Find guest by email and confirmation number
    const result = await query(`
      SELECT g.*, b.id as booking_id, b.confirmation_number, b.check_in_date, b.check_out_date, b.status as booking_status, r.room_number
      FROM hotel_guests g
      JOIN hotel_bookings b ON g.id = b.guest_id
      JOIN hotel_rooms r ON b.room_id = r.id
      WHERE g.tenant_id = $1 AND g.email = $2 
        AND (b.confirmation_number = $3 OR g.full_name ILIKE $4)
        AND b.status IN ('confirmed', 'checked_in')
      ORDER BY b.check_in_date DESC
      LIMIT 1
    `, [tenantId, email, confirmation_number, `%${last_name}%`]);
    
    if (result.rowCount === 0) return res.status(401).json({ error: 'Reservation not found' });
    
    const guest = result.rows[0];
    const token = jwt.sign({ 
      guest_id: guest.id, 
      booking_id: guest.booking_id, 
      tenant_id: tenantId,
      type: 'guest'
    }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({
      success: true,
      token,
      guest: {
        id: guest.id,
        name: guest.full_name,
        email: guest.email,
        booking_id: guest.booking_id,
        confirmation_number: guest.confirmation_number,
        room_number: guest.room_number,
        check_in: guest.check_in_date,
        check_out: guest.check_out_date,
        status: guest.booking_status
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// RESERVATION DETAILS
// ============================================

app.get('/reservation', guestAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { guest_id, booking_id } = req.guest;
    
    const result = await query(`
      SELECT b.*, g.full_name, g.email, g.phone, g.preferences,
             r.room_number, r.room_type, r.floor_number, r.amenities,
             rt.name as room_type_name, rt.description as room_description
      FROM hotel_bookings b
      JOIN hotel_guests g ON b.guest_id = g.id
      JOIN hotel_rooms r ON b.room_id = r.id
      LEFT JOIN hotel_room_types rt ON r.room_type = rt.code AND r.tenant_id = rt.tenant_id
      WHERE b.id = $1 AND b.tenant_id = $2
    `, [booking_id, tenantId]);
    
    if (result.rowCount === 0) return res.status(404).json({ error: 'Reservation not found' });
    
    res.json({ success: true, reservation: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// DIGITAL KEY
// ============================================

app.get('/key', guestAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { booking_id } = req.guest;
    
    const result = await query(`
      SELECT dk.*, r.room_number
      FROM hotel_digital_keys dk
      JOIN hotel_rooms r ON dk.room_id = r.id
      WHERE dk.booking_id = $1 AND dk.tenant_id = $2 AND dk.is_active = true
      ORDER BY dk.created_at DESC
      LIMIT 1
    `, [booking_id, tenantId]);
    
    if (result.rowCount === 0) return res.status(404).json({ error: 'No active key found. Please complete check-in.' });
    
    const key = result.rows[0];
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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// ROOM SERVICE MENU & ORDERS
// ============================================

app.get('/menu', guestAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { category } = req.query;
    
    let sql = `
      SELECT * FROM hotel_room_service_menu
      WHERE tenant_id = $1 AND is_available = true
    `;
    const params = [tenantId];
    
    if (category) { sql += ` AND category = $2`; params.push(category); }
    sql += ' ORDER BY category, name';
    
    const result = await query(sql, params);
    
    // Group by category
    const menu = {};
    result.rows.forEach(item => {
      if (!menu[item.category]) menu[item.category] = [];
      menu[item.category].push(item);
    });
    
    res.json({ success: true, menu });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/orders', guestAuth, async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { guest_id, booking_id } = req.guest;
    const { items, special_instructions, delivery_time } = req.body;
    
    if (!items || items.length === 0) return res.status(400).json({ error: 'Items required' });
    
    await client.query('BEGIN');
    
    // Get room info
    const bookingRes = await client.query(`SELECT room_id FROM hotel_bookings WHERE id = $1`, [booking_id]);
    if (bookingRes.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Booking not found' }); }
    
    // Calculate total
    let totalAmount = 0;
    const orderItems = [];
    for (const item of items) {
      const menuItem = await client.query(`SELECT * FROM hotel_room_service_menu WHERE id = $1 AND tenant_id = $2`, [item.menu_item_id, tenantId]);
      if (menuItem.rowCount > 0) {
        const mi = menuItem.rows[0];
        totalAmount += parseFloat(mi.price) * item.quantity;
        orderItems.push({ ...mi, quantity: item.quantity, subtotal: parseFloat(mi.price) * item.quantity });
      }
    }
    
    // Create order
    const orderId = uuidv4();
    const orderNumber = `RS${Date.now().toString(36).toUpperCase()}`;
    
    await client.query(`
      INSERT INTO hotel_room_service_orders (id, tenant_id, booking_id, guest_id, room_id, order_number, items, total_amount, special_instructions, requested_delivery_time, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
    `, [orderId, tenantId, booking_id, guest_id, bookingRes.rows[0].room_id, orderNumber, JSON.stringify(orderItems), totalAmount, special_instructions, delivery_time]);
    
    await client.query('COMMIT');
    
    await publishEnvelope('hospitality.mobile_app.order_placed.v1', 1, { order_id: orderId, order_number: orderNumber, total: totalAmount });
    
    res.json({ success: true, order: { id: orderId, order_number: orderNumber, total: totalAmount, status: 'pending' } });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.get('/orders', guestAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { booking_id } = req.guest;
    
    const result = await query(`
      SELECT * FROM hotel_room_service_orders
      WHERE booking_id = $1 AND tenant_id = $2
      ORDER BY created_at DESC
    `, [booking_id, tenantId]);
    
    res.json({ success: true, orders: result.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// SERVICE REQUESTS
// ============================================

app.get('/requests', guestAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { booking_id } = req.guest;
    
    const result = await query(`
      SELECT * FROM hotel_guest_requests
      WHERE booking_id = $1 AND tenant_id = $2
      ORDER BY created_at DESC
    `, [booking_id, tenantId]);
    
    res.json({ success: true, requests: result.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/requests', guestAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { guest_id, booking_id } = req.guest;
    const { request_type, category, description, priority } = req.body;
    
    // Get room info
    const bookingRes = await query(`SELECT room_id FROM hotel_bookings WHERE id = $1`, [booking_id]);
    
    const result = await query(`
      INSERT INTO hotel_guest_requests (tenant_id, booking_id, guest_id, room_id, request_type, category, description, priority, status, source)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', 'mobile_app')
      RETURNING *
    `, [tenantId, booking_id, guest_id, bookingRes.rows[0]?.room_id, request_type, category || 'general', description, priority || 'normal']);
    
    await publishEnvelope('hospitality.mobile_app.request_submitted.v1', 1, { request_id: result.rows[0].id, type: request_type });
    
    res.json({ success: true, request: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// HOTEL SERVICES & AMENITIES
// ============================================

app.get('/services', guestAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    
    const result = await query(`
      SELECT * FROM hotel_services
      WHERE tenant_id = $1 AND is_active = true
      ORDER BY category, name
    `, [tenantId]);
    
    res.json({ success: true, services: result.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/services/:serviceId/book', guestAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { guest_id, booking_id } = req.guest;
    const { serviceId } = req.params;
    const { date, time, guests, notes } = req.body;
    
    const result = await query(`
      INSERT INTO hotel_service_bookings (tenant_id, service_id, booking_id, guest_id, scheduled_date, scheduled_time, guest_count, notes, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'confirmed')
      RETURNING *
    `, [tenantId, serviceId, booking_id, guest_id, date, time, guests || 1, notes]);
    
    res.json({ success: true, service_booking: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// FOLIO / BILL
// ============================================

app.get('/folio', guestAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { booking_id } = req.guest;
    
    // Get booking with charges
    const bookingRes = await query(`
      SELECT b.*, r.room_number, r.price_per_night
      FROM hotel_bookings b
      JOIN hotel_rooms r ON b.room_id = r.id
      WHERE b.id = $1 AND b.tenant_id = $2
    `, [booking_id, tenantId]);
    
    if (bookingRes.rowCount === 0) return res.status(404).json({ error: 'Booking not found' });
    
    const booking = bookingRes.rows[0];
    
    // Get additional charges
    const chargesRes = await query(`
      SELECT * FROM hotel_folio_charges
      WHERE booking_id = $1 AND tenant_id = $2
      ORDER BY charge_date DESC
    `, [booking_id, tenantId]);
    
    // Get payments
    const paymentsRes = await query(`
      SELECT * FROM hotel_payments
      WHERE booking_id = $1 AND tenant_id = $2
      ORDER BY payment_date DESC
    `, [booking_id, tenantId]);
    
    const totalCharges = parseFloat(booking.total_amount) + chargesRes.rows.reduce((sum, c) => sum + parseFloat(c.amount), 0);
    const totalPayments = paymentsRes.rows.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    
    res.json({
      success: true,
      folio: {
        booking_id,
        room_number: booking.room_number,
        check_in: booking.check_in_date,
        check_out: booking.check_out_date,
        room_charges: parseFloat(booking.total_amount),
        additional_charges: chargesRes.rows,
        payments: paymentsRes.rows,
        total_charges: totalCharges,
        total_payments: totalPayments,
        balance: totalCharges - totalPayments
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// FEEDBACK
// ============================================

app.post('/feedback', guestAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { guest_id, booking_id } = req.guest;
    const { overall_rating, room_rating, service_rating, food_rating, cleanliness_rating, comments, would_recommend } = req.body;
    
    const result = await query(`
      INSERT INTO hotel_guest_feedback (tenant_id, booking_id, guest_id, overall_rating, room_rating, service_rating, food_rating, cleanliness_rating, comments, would_recommend, source)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'mobile_app')
      RETURNING *
    `, [tenantId, booking_id, guest_id, overall_rating, room_rating, service_rating, food_rating, cleanliness_rating, comments, would_recommend]);
    
    res.json({ success: true, feedback: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// LOYALTY
// ============================================

app.get('/loyalty', guestAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { guest_id } = req.guest;
    
    const result = await query(`
      SELECT g.loyalty_points, g.loyalty_tier, 
             (SELECT COUNT(*) FROM hotel_bookings WHERE guest_id = g.id AND status = 'checked_out') as total_stays,
             (SELECT SUM(total_amount) FROM hotel_bookings WHERE guest_id = g.id AND status = 'checked_out') as lifetime_spend
      FROM hotel_guests g
      WHERE g.id = $1 AND g.tenant_id = $2
    `, [guest_id, tenantId]);
    
    if (result.rowCount === 0) return res.status(404).json({ error: 'Guest not found' });
    
    // Get recent transactions
    const transactionsRes = await query(`
      SELECT * FROM hotel_loyalty_transactions
      WHERE guest_id = $1 AND tenant_id = $2
      ORDER BY created_at DESC
      LIMIT 20
    `, [guest_id, tenantId]);
    
    res.json({
      success: true,
      loyalty: {
        ...result.rows[0],
        transactions: transactionsRes.rows
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// CHAT (placeholder for real-time)
// ============================================

app.get('/chat/messages', guestAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { booking_id } = req.guest;
    
    const result = await query(`
      SELECT * FROM hotel_chat_messages
      WHERE booking_id = $1 AND tenant_id = $2
      ORDER BY created_at ASC
    `, [booking_id, tenantId]);
    
    res.json({ success: true, messages: result.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/chat/messages', guestAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { guest_id, booking_id } = req.guest;
    const { message } = req.body;
    
    const result = await query(`
      INSERT INTO hotel_chat_messages (tenant_id, booking_id, guest_id, sender_type, message)
      VALUES ($1, $2, $3, 'guest', $4)
      RETURNING *
    `, [tenantId, booking_id, guest_id, message]);
    
    res.json({ success: true, message: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// PUSH NOTIFICATIONS (device registration)
// ============================================

app.post('/devices', guestAuth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { guest_id } = req.guest;
    const { device_token, platform, device_name } = req.body;
    
    await query(`
      INSERT INTO hotel_guest_devices (tenant_id, guest_id, device_token, platform, device_name)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (tenant_id, device_token) DO UPDATE SET guest_id = $2, updated_at = NOW()
    `, [tenantId, guest_id, device_token, platform, device_name]);
    
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/healthz', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME }));
app.get('/readyz', (req, res) => res.json({ status: natsReady ? 'ready' : 'degraded' }));


// ============================================
// SERVE EMBEDDED UI (Auto-generated)
// ============================================

const UI_DIST = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(UI_DIST)) {
  console.log('📦 Serving embedded UI from ui/dist');
  app.use(express.static(UI_DIST));
  
  // SPA fallback - serve index.html for non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || 
        req.path.startsWith('/health') ||
        req.path.startsWith('/metrics') ||
        req.path.startsWith('/readyz')) {
      return next();
    }
    res.sendFile(path.join(UI_DIST, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('<html><body style="font-family:system-ui;text-align:center;padding:2rem;"><h1>Service Running</h1><p><a href="/healthz">Health Check</a></p></body></html>');
  });
}

const PORT = process.env.PORT || 8937;
app.listen(PORT, () => console.log(`✅ Mobile Guest App Backend listening on ${PORT}`));
