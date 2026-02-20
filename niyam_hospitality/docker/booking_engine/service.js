// Booking Engine Service - Niyam Hospitality
// Direct booking widget for hotel websites with availability, rates, and payment

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
  kvStore = { connect: async () => {}, get: async () => null, put: async () => {} };
}

const { query, getClient } = db;
const { publishEnvelope } = sdk;

const app = express();
const SERVICE_NAME = 'booking_engine';
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Observability
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
const bookingCounter = new promClient.Counter({ name: 'booking_engine_bookings_total', help: 'Total bookings created', registers: [registry] });
const availabilityChecks = new promClient.Counter({ name: 'booking_engine_availability_checks_total', help: 'Total availability checks', registers: [registry] });

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

// Auth
const SKIP_AUTH = (process.env.SKIP_AUTH || 'true').toLowerCase() === 'true';
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET && !SKIP_AUTH) {
  console.error('FATAL: JWT_SECRET environment variable must be set when authentication is enabled');
  process.exit(1);
}

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

// NATS connection
let natsReady = false;
(async () => {
  try {
    await kvStore.connect();
    console.log(`✅ ${SERVICE_NAME}: NATS KV Connected`);
    natsReady = true;
  } catch (e) {
    console.warn(`⚠️ ${SERVICE_NAME}: NATS KV connection failed, running in standalone mode`);
  }
})();

// ============================================
// AVAILABILITY CHECK
// ============================================

app.get('/availability', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { check_in, check_out, adults, children, room_type } = req.query;
    
    if (!check_in || !check_out) {
      return res.status(400).json({ error: 'check_in and check_out dates are required' });
    }
    
    availabilityChecks.inc();
    
    // Get available rooms for the date range
    let sql = `
      SELECT r.id, r.room_number, r.room_type, r.floor_number, r.price_per_night, r.amenities, r.max_occupancy,
             rt.name as type_name, rt.description as type_description, rt.base_price
      FROM hotel_rooms r
      LEFT JOIN hotel_room_types rt ON r.room_type = rt.code AND r.tenant_id = rt.tenant_id
      WHERE r.tenant_id = $1 
        AND r.status = 'available'
        AND r.id NOT IN (
          SELECT room_id FROM hotel_bookings 
          WHERE tenant_id = $1 
            AND status IN ('confirmed', 'checked_in')
            AND (
              (check_in_date <= $2 AND check_out_date > $2) OR
              (check_in_date < $3 AND check_out_date >= $3) OR
              (check_in_date >= $2 AND check_out_date <= $3)
            )
        )
    `;
    const params = [tenantId, check_in, check_out];
    let paramIdx = 4;
    
    if (room_type) {
      sql += ` AND r.room_type = $${paramIdx++}`;
      params.push(room_type);
    }
    if (adults) {
      sql += ` AND r.max_occupancy >= $${paramIdx++}`;
      params.push(parseInt(adults) + parseInt(children || 0));
    }
    
    sql += ' ORDER BY r.price_per_night ASC';
    
    const result = await query(sql, params);
    
    const nights = Math.ceil((new Date(check_out) - new Date(check_in)) / (1000 * 60 * 60 * 24));
    
    const rooms = result.rows.map(room => ({
      id: room.id,
      room_number: room.room_number,
      room_type: room.room_type,
      type_name: room.type_name || room.room_type,
      description: room.type_description,
      floor: room.floor_number,
      amenities: room.amenities || [],
      max_occupancy: room.max_occupancy,
      price_per_night: parseFloat(room.price_per_night),
      total_price: parseFloat(room.price_per_night) * nights,
      nights
    }));
    
    await publishEnvelope('hospitality.booking_engine.availability_checked.v1', 1, {
      tenant_id: tenantId,
      check_in,
      check_out,
      rooms_available: rooms.length
    });
    
    res.json({ success: true, check_in, check_out, nights, available_rooms: rooms });
  } catch (e) {
    console.error('Availability check error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// RATES
// ============================================

app.get('/rates', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { from_date, to_date, room_type } = req.query;
    
    // Get room types with their base rates
    let sql = `
      SELECT rt.code, rt.name, rt.description, rt.base_price, rt.amenities,
             COUNT(r.id) as total_rooms,
             COUNT(r.id) FILTER (WHERE r.status = 'available') as available_rooms
      FROM hotel_room_types rt
      LEFT JOIN hotel_rooms r ON rt.code = r.room_type AND rt.tenant_id = r.tenant_id
      WHERE rt.tenant_id = $1
    `;
    const params = [tenantId];
    
    if (room_type) {
      sql += ' AND rt.code = $2';
      params.push(room_type);
    }
    
    sql += ' GROUP BY rt.id ORDER BY rt.base_price ASC';
    
    const result = await query(sql, params);
    
    // Get any rate overrides for the date range
    const ratesRes = await query(`
      SELECT room_type, rate_date, price, rate_type
      FROM hotel_rate_calendar
      WHERE tenant_id = $1 AND rate_date >= $2 AND rate_date <= $3
      ORDER BY rate_date
    `, [tenantId, from_date || new Date().toISOString().split('T')[0], to_date || new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0]]);
    
    const rateOverrides = {};
    ratesRes.rows.forEach(r => {
      if (!rateOverrides[r.room_type]) rateOverrides[r.room_type] = {};
      rateOverrides[r.room_type][r.rate_date] = { price: parseFloat(r.price), type: r.rate_type };
    });
    
    const rates = result.rows.map(rt => ({
      code: rt.code,
      name: rt.name,
      description: rt.description,
      base_price: parseFloat(rt.base_price),
      amenities: rt.amenities || [],
      total_rooms: parseInt(rt.total_rooms),
      available_rooms: parseInt(rt.available_rooms),
      rate_calendar: rateOverrides[rt.code] || {}
    }));
    
    res.json({ success: true, rates });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// PROMO CODES
// ============================================

const PromoValidationSchema = z.object({
  code: z.string().min(1),
  check_in: z.string(),
  check_out: z.string(),
  room_type: z.string().optional(),
  total_amount: z.number().positive()
});

app.post('/promo/validate', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = PromoValidationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const { code, check_in, check_out, room_type, total_amount } = parsed.data;
    
    const result = await query(`
      SELECT * FROM hotel_promo_codes
      WHERE tenant_id = $1 AND code = $2 AND is_active = true
        AND (valid_from IS NULL OR valid_from <= $3)
        AND (valid_to IS NULL OR valid_to >= $4)
        AND (max_uses IS NULL OR current_uses < max_uses)
    `, [tenantId, code.toUpperCase(), check_in, check_out]);
    
    if (result.rowCount === 0) {
      return res.status(400).json({ success: false, error: 'Invalid or expired promo code' });
    }
    
    const promo = result.rows[0];
    
    // Check room type restriction
    if (promo.applicable_room_types && promo.applicable_room_types.length > 0) {
      if (room_type && !promo.applicable_room_types.includes(room_type)) {
        return res.status(400).json({ success: false, error: 'Promo code not valid for this room type' });
      }
    }
    
    // Check minimum stay
    const nights = Math.ceil((new Date(check_out) - new Date(check_in)) / (1000 * 60 * 60 * 24));
    if (promo.min_nights && nights < promo.min_nights) {
      return res.status(400).json({ success: false, error: `Minimum ${promo.min_nights} nights required` });
    }
    
    // Calculate discount
    let discount = 0;
    if (promo.discount_type === 'percentage') {
      discount = total_amount * (parseFloat(promo.discount_value) / 100);
      if (promo.max_discount) {
        discount = Math.min(discount, parseFloat(promo.max_discount));
      }
    } else {
      discount = parseFloat(promo.discount_value);
    }
    
    await publishEnvelope('hospitality.booking_engine.promo_applied.v1', 1, {
      tenant_id: tenantId,
      code,
      discount,
      original_amount: total_amount
    });
    
    res.json({
      success: true,
      promo: {
        code: promo.code,
        name: promo.name,
        discount_type: promo.discount_type,
        discount_value: parseFloat(promo.discount_value),
        discount_amount: discount,
        final_amount: total_amount - discount
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// BOOKING
// ============================================

const BookingSchema = z.object({
  room_id: z.string().uuid(),
  check_in: z.string(),
  check_out: z.string(),
  guest: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
    address: z.string().optional(),
    country: z.string().optional()
  }),
  adults: z.number().min(1).default(1),
  children: z.number().min(0).default(0),
  special_requests: z.string().optional(),
  promo_code: z.string().optional(),
  payment_method: z.string().optional()
});

app.post('/book', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const parsed = BookingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const data = parsed.data;
    
    await client.query('BEGIN');

    // Lock the room row to prevent race conditions (double booking)
    const roomLock = await client.query(`
      SELECT * FROM hotel_rooms
      WHERE id = $1 AND tenant_id = $2
      FOR UPDATE NOWAIT
    `, [data.room_id, tenantId]);

    if (roomLock.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: { code: 'ROOM_NOT_FOUND', message: 'Room not found' } });
    }

    // Now check availability with the lock held
    const availabilityCheck = await client.query(`
      SELECT COUNT(*) as conflicting_bookings
      FROM hotel_bookings
      WHERE room_id = $1 AND status IN ('confirmed', 'checked_in')
        AND (
          (check_in_date <= $2 AND check_out_date > $2) OR
          (check_in_date < $3 AND check_out_date >= $3) OR
          (check_in_date >= $2 AND check_out_date <= $3)
        )
    `, [data.room_id, data.check_in, data.check_out]);

    if (parseInt(availabilityCheck.rows[0].conflicting_bookings) > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: { code: 'ROOM_NOT_AVAILABLE', message: 'Room is no longer available for selected dates' } });
    }

    const room = roomLock.rows[0];
    const nights = Math.ceil((new Date(data.check_out) - new Date(data.check_in)) / (1000 * 60 * 60 * 24));
    let totalAmount = parseFloat(room.price_per_night) * nights;
    let discountAmount = 0;
    
    // Apply promo code if provided
    if (data.promo_code) {
      const promoRes = await client.query(`
        SELECT * FROM hotel_promo_codes
        WHERE tenant_id = $1 AND code = $2 AND is_active = true
      `, [tenantId, data.promo_code.toUpperCase()]);
      
      if (promoRes.rowCount > 0) {
        const promo = promoRes.rows[0];
        if (promo.discount_type === 'percentage') {
          discountAmount = totalAmount * (parseFloat(promo.discount_value) / 100);
          if (promo.max_discount) discountAmount = Math.min(discountAmount, parseFloat(promo.max_discount));
        } else {
          discountAmount = parseFloat(promo.discount_value);
        }
        
        // Increment promo usage
        await client.query(`
          UPDATE hotel_promo_codes SET current_uses = current_uses + 1 WHERE id = $1
        `, [promo.id]);
      }
    }
    
    const finalAmount = totalAmount - discountAmount;
    
    // Create or find guest
    let guestRes = await client.query(`
      SELECT id FROM hotel_guests WHERE tenant_id = $1 AND email = $2
    `, [tenantId, data.guest.email]);
    
    let guestId;
    if (guestRes.rowCount > 0) {
      guestId = guestRes.rows[0].id;
      // Update guest info
      await client.query(`
        UPDATE hotel_guests SET full_name = $1, phone = $2, updated_at = NOW()
        WHERE id = $3
      `, [data.guest.name, data.guest.phone, guestId]);
    } else {
      const newGuest = await client.query(`
        INSERT INTO hotel_guests (tenant_id, full_name, email, phone, address, country)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [tenantId, data.guest.name, data.guest.email, data.guest.phone, data.guest.address, data.guest.country]);
      guestId = newGuest.rows[0].id;
    }
    
    // Create booking
    const bookingId = uuidv4();
    const confirmationNumber = `BK${Date.now().toString(36).toUpperCase()}`;
    
    await client.query(`
      INSERT INTO hotel_bookings (id, tenant_id, guest_id, room_id, check_in_date, check_out_date,
        status, total_amount, discount_amount, adults_count, children_count, notes, source, confirmation_number)
      VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', $7, $8, $9, $10, $11, 'booking_engine', $12)
    `, [bookingId, tenantId, guestId, data.room_id, data.check_in, data.check_out,
        finalAmount, discountAmount, data.adults, data.children, data.special_requests, confirmationNumber]);
    
    await client.query('COMMIT');
    
    bookingCounter.inc();
    
    await publishEnvelope('hospitality.booking_engine.booking_created.v1', 1, {
      booking_id: bookingId,
      confirmation_number: confirmationNumber,
      tenant_id: tenantId,
      guest_id: guestId,
      room_id: data.room_id,
      check_in: data.check_in,
      check_out: data.check_out,
      total_amount: finalAmount
    });
    
    res.json({
      success: true,
      booking: {
        id: bookingId,
        confirmation_number: confirmationNumber,
        room_number: room.room_number,
        room_type: room.room_type,
        check_in: data.check_in,
        check_out: data.check_out,
        nights,
        guest_name: data.guest.name,
        guest_email: data.guest.email,
        subtotal: totalAmount,
        discount: discountAmount,
        total: finalAmount,
        status: 'confirmed'
      }
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Booking error:', e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ============================================
// BOOKING LOOKUP
// ============================================

app.get('/booking/:confirmation', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { confirmation } = req.params;
    
    const result = await query(`
      SELECT b.*, g.full_name as guest_name, g.email as guest_email, g.phone as guest_phone,
             r.room_number, r.room_type
      FROM hotel_bookings b
      JOIN hotel_guests g ON b.guest_id = g.id
      JOIN hotel_rooms r ON b.room_id = r.id
      WHERE b.tenant_id = $1 AND (b.confirmation_number = $2 OR b.id::text = $2)
    `, [tenantId, confirmation]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    res.json({ success: true, booking: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// ROOM TYPES
// ============================================

app.get('/room-types', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    
    const result = await query(`
      SELECT rt.*, 
             COUNT(r.id) as total_rooms,
             COUNT(r.id) FILTER (WHERE r.status = 'available') as available_rooms
      FROM hotel_room_types rt
      LEFT JOIN hotel_rooms r ON rt.code = r.room_type AND rt.tenant_id = r.tenant_id
      WHERE rt.tenant_id = $1
      GROUP BY rt.id
      ORDER BY rt.base_price ASC
    `, [tenantId]);
    
    res.json({ success: true, room_types: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// WIDGET CONFIG
// ============================================

app.get('/widget/config', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    
    // Get hotel info and widget configuration
    const hotelRes = await query(`
      SELECT name, logo_url, primary_color, currency, timezone, check_in_time, check_out_time
      FROM hotel_properties
      WHERE tenant_id = $1
      LIMIT 1
    `, [tenantId]);
    
    const config = hotelRes.rows[0] || {
      name: 'Hotel',
      currency: 'INR',
      check_in_time: '14:00',
      check_out_time: '11:00'
    };
    
    res.json({
      success: true,
      config: {
        hotel_name: config.name,
        logo_url: config.logo_url,
        primary_color: config.primary_color || '#4F46E5',
        currency: config.currency,
        timezone: config.timezone || 'Asia/Kolkata',
        check_in_time: config.check_in_time,
        check_out_time: config.check_out_time,
        min_advance_days: 0,
        max_advance_days: 365,
        payment_methods: ['card', 'upi', 'pay_at_hotel']
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health endpoints
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME }));
app.get('/readyz', (req, res) => res.json({ status: natsReady ? 'ready' : 'degraded', nats: natsReady }));


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

const PORT = process.env.PORT || 8930;
app.listen(PORT, () => {
  console.log(`✅ Booking Engine Service listening on ${PORT}`);
});
