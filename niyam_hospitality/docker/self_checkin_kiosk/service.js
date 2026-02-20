// Self Check-in Kiosk Service - Niyam Hospitality
// Mobile and kiosk-based self check-in with ID scanning and digital keys

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
const SERVICE_NAME = 'self_checkin_kiosk';
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' })); // Larger limit for ID images

// Observability
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
const selfCheckins = new promClient.Counter({ name: 'self_checkin_completed_total', help: 'Total self check-ins completed', registers: [registry] });
const keysIssued = new promClient.Counter({ name: 'self_checkin_keys_issued_total', help: 'Total digital keys issued', registers: [registry] });
const idScans = new promClient.Counter({ name: 'self_checkin_id_scans_total', help: 'Total ID scans', labelNames: ['result'], registers: [registry] });

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
// LOOKUP RESERVATION
// ============================================

app.get('/lookup', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { confirmation, last_name, email, phone } = req.query;
    
    let sql = `
      SELECT b.*, g.full_name, g.email, g.phone, r.room_number, r.room_type, r.floor_number
      FROM hotel_bookings b
      JOIN hotel_guests g ON b.guest_id = g.id
      JOIN hotel_rooms r ON b.room_id = r.id
      WHERE b.tenant_id = $1 AND b.status = 'confirmed'
        AND DATE(b.check_in_date) <= CURRENT_DATE
        AND DATE(b.check_out_date) > CURRENT_DATE
    `;
    const params = [tenantId];
    let paramIdx = 2;
    
    if (confirmation) {
      sql += ` AND (b.confirmation_number = $${paramIdx} OR b.id::text = $${paramIdx})`;
      params.push(confirmation);
      paramIdx++;
    }
    if (last_name) {
      sql += ` AND g.full_name ILIKE $${paramIdx}`;
      params.push(`%${last_name}%`);
      paramIdx++;
    }
    if (email) {
      sql += ` AND g.email = $${paramIdx}`;
      params.push(email);
      paramIdx++;
    }
    if (phone) {
      sql += ` AND g.phone = $${paramIdx}`;
      params.push(phone);
      paramIdx++;
    }
    
    sql += ' LIMIT 10';
    
    const result = await query(sql, params);
    
    const reservations = result.rows.map(r => ({
      booking_id: r.id,
      confirmation_number: r.confirmation_number,
      guest_name: r.full_name,
      email: r.email,
      room_number: r.room_number,
      room_type: r.room_type,
      floor: r.floor_number,
      check_in: r.check_in_date,
      check_out: r.check_out_date,
      adults: r.adults_count,
      children: r.children_count,
      status: r.status,
      id_verified: r.id_verified || false
    }));
    
    res.json({ success: true, reservations });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// SCAN ID DOCUMENT
// ============================================

const IdScanSchema = z.object({
  booking_id: z.string().uuid(),
  id_type: z.enum(['passport', 'driving_license', 'national_id', 'aadhaar', 'pan']),
  id_image_base64: z.string().optional(),
  id_number: z.string().min(1),
  id_name: z.string().min(1),
  id_expiry: z.string().optional(),
  id_country: z.string().optional()
});

app.post('/scan-id', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const parsed = IdScanSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const data = parsed.data;
    
    await client.query('BEGIN');
    
    // Verify booking exists
    const bookingRes = await client.query(`
      SELECT b.*, g.id as guest_id, g.full_name
      FROM hotel_bookings b
      JOIN hotel_guests g ON b.guest_id = g.id
      WHERE b.id = $1 AND b.tenant_id = $2
    `, [data.booking_id, tenantId]);
    
    if (bookingRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    const booking = bookingRes.rows[0];
    
    // Basic name matching (in production, use fuzzy matching)
    const nameMatch = data.id_name.toLowerCase().includes(booking.full_name.split(' ')[0].toLowerCase());
    
    // Store ID verification record
    const verificationId = uuidv4();
    await client.query(`
      INSERT INTO hotel_id_verifications (id, tenant_id, booking_id, guest_id, id_type, id_number, id_name, id_expiry, id_country, name_match, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [verificationId, tenantId, data.booking_id, booking.guest_id, data.id_type, data.id_number, data.id_name, data.id_expiry, data.id_country, nameMatch, nameMatch ? 'verified' : 'review_required']);
    
    // Update guest ID info
    await client.query(`
      UPDATE hotel_guests SET id_proof_type = $1, id_proof_number = $2, id_verified = $3, updated_at = NOW()
      WHERE id = $4
    `, [data.id_type, data.id_number, nameMatch, booking.guest_id]);
    
    // Update booking
    await client.query(`
      UPDATE hotel_bookings SET id_verified = $1, updated_at = NOW() WHERE id = $2
    `, [nameMatch, data.booking_id]);
    
    await client.query('COMMIT');
    
    idScans.inc({ result: nameMatch ? 'verified' : 'review_required' });
    
    await publishEnvelope('hospitality.self_checkin.id_scanned.v1', 1, {
      booking_id: data.booking_id,
      guest_id: booking.guest_id,
      id_type: data.id_type,
      verified: nameMatch
    });
    
    res.json({
      success: true,
      verification: {
        id: verificationId,
        status: nameMatch ? 'verified' : 'review_required',
        name_match: nameMatch,
        message: nameMatch ? 'ID verified successfully' : 'ID requires manual review - name mismatch'
      }
    });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ============================================
// COMPLETE CHECK-IN
// ============================================

const CompleteCheckinSchema = z.object({
  booking_id: z.string().uuid(),
  signature_base64: z.string().optional(),
  terms_accepted: z.boolean(),
  marketing_consent: z.boolean().optional(),
  preferences: z.object({
    newspaper: z.boolean().optional(),
    wake_up_call: z.string().optional(),
    room_service: z.boolean().optional(),
    dnd: z.boolean().optional()
  }).optional()
});

app.post('/complete-checkin', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const parsed = CompleteCheckinSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const data = parsed.data;
    
    if (!data.terms_accepted) {
      return res.status(400).json({ error: 'Terms must be accepted to complete check-in' });
    }
    
    await client.query('BEGIN');
    
    // Get booking
    const bookingRes = await client.query(`
      SELECT b.*, r.room_number, r.id as room_id, g.id as guest_id
      FROM hotel_bookings b
      JOIN hotel_rooms r ON b.room_id = r.id
      JOIN hotel_guests g ON b.guest_id = g.id
      WHERE b.id = $1 AND b.tenant_id = $2 AND b.status = 'confirmed'
    `, [data.booking_id, tenantId]);
    
    if (bookingRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Booking not found or already checked in' });
    }
    
    const booking = bookingRes.rows[0];
    
    // Check if ID is verified (configurable requirement)
    const idRequired = process.env.ID_SCAN_REQUIRED !== 'false';
    if (idRequired && !booking.id_verified) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'ID verification required before check-in' });
    }
    
    // Update booking to checked in
    await client.query(`
      UPDATE hotel_bookings 
      SET status = 'checked_in', checked_in_at = NOW(), checkin_method = 'self_service', updated_at = NOW()
      WHERE id = $1
    `, [data.booking_id]);
    
    // Update room status
    await client.query(`
      UPDATE hotel_rooms SET status = 'occupied', updated_at = NOW() WHERE id = $1
    `, [booking.room_id]);
    
    // Store registration card
    await client.query(`
      INSERT INTO hotel_registration_cards (tenant_id, booking_id, guest_id, signature, terms_accepted, marketing_consent, preferences)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [tenantId, data.booking_id, booking.guest_id, data.signature_base64, data.terms_accepted, data.marketing_consent, data.preferences]);
    
    // Generate digital key
    const keyCode = uuidv4().replace(/-/g, '').substring(0, 12).toUpperCase();
    const keyExpiry = new Date(booking.check_out_date);
    keyExpiry.setHours(14, 0, 0, 0); // Check-out time
    
    await client.query(`
      INSERT INTO hotel_digital_keys (tenant_id, booking_id, guest_id, room_id, key_code, valid_from, valid_until, is_active)
      VALUES ($1, $2, $3, $4, $5, NOW(), $6, true)
    `, [tenantId, data.booking_id, booking.guest_id, booking.room_id, keyCode, keyExpiry]);
    
    await client.query('COMMIT');
    
    selfCheckins.inc();
    keysIssued.inc();
    
    await publishEnvelope('hospitality.self_checkin.checkin_started.v1', 1, {
      booking_id: data.booking_id,
      room_id: booking.room_id
    });
    
    await publishEnvelope('hospitality.self_checkin.key_issued.v1', 1, {
      booking_id: data.booking_id,
      room_number: booking.room_number,
      key_code: keyCode
    });
    
    res.json({
      success: true,
      checkin: {
        booking_id: data.booking_id,
        room_number: booking.room_number,
        status: 'checked_in',
        digital_key: {
          code: keyCode,
          valid_until: keyExpiry.toISOString(),
          qr_data: JSON.stringify({ type: 'room_key', code: keyCode, room: booking.room_number })
        },
        message: `Welcome! Your room ${booking.room_number} is ready.`
      }
    });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ============================================
// DIGITAL KEY
// ============================================

app.get('/key/:booking_id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { booking_id } = req.params;
    
    const result = await query(`
      SELECT dk.*, r.room_number, b.check_out_date
      FROM hotel_digital_keys dk
      JOIN hotel_bookings b ON dk.booking_id = b.id
      JOIN hotel_rooms r ON dk.room_id = r.id
      WHERE dk.booking_id = $1 AND dk.tenant_id = $2 AND dk.is_active = true
      ORDER BY dk.created_at DESC
      LIMIT 1
    `, [booking_id, tenantId]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'No active key found' });
    }
    
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
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/key/regenerate', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { booking_id } = req.body;
    
    // Deactivate existing keys
    await query(`
      UPDATE hotel_digital_keys SET is_active = false WHERE booking_id = $1 AND tenant_id = $2
    `, [booking_id, tenantId]);
    
    // Get booking info
    const bookingRes = await query(`
      SELECT b.*, r.id as room_id, r.room_number
      FROM hotel_bookings b
      JOIN hotel_rooms r ON b.room_id = r.id
      WHERE b.id = $1 AND b.tenant_id = $2 AND b.status = 'checked_in'
    `, [booking_id, tenantId]);
    
    if (bookingRes.rowCount === 0) {
      return res.status(404).json({ error: 'Active booking not found' });
    }
    
    const booking = bookingRes.rows[0];
    
    // Generate new key
    const keyCode = uuidv4().replace(/-/g, '').substring(0, 12).toUpperCase();
    const keyExpiry = new Date(booking.check_out_date);
    keyExpiry.setHours(14, 0, 0, 0);
    
    await query(`
      INSERT INTO hotel_digital_keys (tenant_id, booking_id, guest_id, room_id, key_code, valid_from, valid_until, is_active)
      VALUES ($1, $2, $3, $4, $5, NOW(), $6, true)
    `, [tenantId, booking_id, booking.guest_id, booking.room_id, keyCode, keyExpiry]);
    
    keysIssued.inc();
    
    res.json({
      success: true,
      key: {
        code: keyCode,
        room_number: booking.room_number,
        valid_until: keyExpiry.toISOString()
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// SELF CHECKOUT
// ============================================

app.post('/checkout', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { booking_id, rating, feedback } = req.body;
    
    await client.query('BEGIN');
    
    // Get booking with balance
    const bookingRes = await client.query(`
      SELECT b.*, r.id as room_id, r.room_number,
             (b.total_amount - COALESCE(b.paid_amount, 0)) as balance
      FROM hotel_bookings b
      JOIN hotel_rooms r ON b.room_id = r.id
      WHERE b.id = $1 AND b.tenant_id = $2 AND b.status = 'checked_in'
    `, [booking_id, tenantId]);
    
    if (bookingRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Active booking not found' });
    }
    
    const booking = bookingRes.rows[0];
    
    if (parseFloat(booking.balance) > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'Outstanding balance must be settled before checkout',
        balance: parseFloat(booking.balance)
      });
    }
    
    // Complete checkout
    await client.query(`
      UPDATE hotel_bookings 
      SET status = 'checked_out', checked_out_at = NOW(), checkout_method = 'self_service', updated_at = NOW()
      WHERE id = $1
    `, [booking_id]);
    
    // Update room status to dirty
    await client.query(`
      UPDATE hotel_rooms SET status = 'dirty', updated_at = NOW() WHERE id = $1
    `, [booking.room_id]);
    
    // Deactivate digital keys
    await client.query(`
      UPDATE hotel_digital_keys SET is_active = false WHERE booking_id = $1
    `, [booking_id]);
    
    // Create housekeeping task
    await client.query(`
      INSERT INTO hotel_housekeeping_tasks (tenant_id, room_id, task_type, priority, status)
      VALUES ($1, $2, 'checkout_cleaning', 'high', 'pending')
    `, [tenantId, booking.room_id]);
    
    // Store feedback if provided
    if (rating || feedback) {
      await client.query(`
        INSERT INTO hotel_guest_feedback (tenant_id, booking_id, guest_id, overall_rating, comments, source)
        VALUES ($1, $2, $3, $4, $5, 'self_checkout')
      `, [tenantId, booking_id, booking.guest_id, rating, feedback]);
    }
    
    await client.query('COMMIT');
    
    await publishEnvelope('hospitality.self_checkin.checkout_completed.v1', 1, {
      booking_id,
      room_id: booking.room_id
    });
    
    res.json({
      success: true,
      checkout: {
        booking_id,
        room_number: booking.room_number,
        status: 'checked_out',
        message: 'Thank you for staying with us! Have a safe journey.'
      }
    });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ============================================
// KIOSK STATUS
// ============================================

app.get('/kiosks', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    
    const result = await query(`
      SELECT id, name, location, status, last_heartbeat, 
             (NOW() - last_heartbeat) < INTERVAL '5 minutes' as is_online
      FROM hotel_kiosks
      WHERE tenant_id = $1
      ORDER BY name
    `, [tenantId]);
    
    res.json({ success: true, kiosks: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/kiosks/:id/heartbeat', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    await query(`
      UPDATE hotel_kiosks SET last_heartbeat = NOW(), status = 'online' WHERE id = $1 AND tenant_id = $2
    `, [id, tenantId]);
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// STATS
// ============================================

app.get('/stats', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const today = new Date().toISOString().split('T')[0];
    
    const result = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE checkin_method = 'self_service' AND DATE(checked_in_at) = $2) as self_checkins_today,
        COUNT(*) FILTER (WHERE checkout_method = 'self_service' AND DATE(checked_out_at) = $2) as self_checkouts_today,
        COUNT(*) FILTER (WHERE checkin_method = 'self_service') as total_self_checkins,
        COUNT(*) FILTER (WHERE checkin_method = 'front_desk' OR checkin_method IS NULL) as total_desk_checkins
      FROM hotel_bookings
      WHERE tenant_id = $1
    `, [tenantId, today]);
    
    const keysRes = await query(`
      SELECT COUNT(*) as active_keys FROM hotel_digital_keys WHERE tenant_id = $1 AND is_active = true
    `, [tenantId]);
    
    res.json({
      success: true,
      stats: {
        ...result.rows[0],
        active_digital_keys: parseInt(keysRes.rows[0].active_keys),
        self_service_rate: result.rows[0].total_self_checkins + result.rows[0].total_desk_checkins > 0
          ? Math.round(result.rows[0].total_self_checkins / (result.rows[0].total_self_checkins + result.rows[0].total_desk_checkins) * 100)
          : 0
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

const PORT = process.env.PORT || 8932;
app.listen(PORT, () => {
  console.log(`✅ Self Check-in Kiosk Service listening on ${PORT}`);
});
