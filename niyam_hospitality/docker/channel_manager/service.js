// Channel Manager Service - OTA Integration Hub
// Sync rates, availability, and bookings with OTAs (Booking.com, Expedia, Airbnb, etc.)

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const crypto = require('crypto');
const promClient = require('prom-client');

let db, sdk;
try {
  db = require('../../../../db/postgres');
  sdk = require('../../../../platform/sdk/node');
} catch (_) {
  db = { query: async () => ({ rows: [] }), getClient: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) };
  sdk = { publishEnvelope: async () => {} };
}

const { query, getClient } = db;
const { publishEnvelope } = sdk;

const app = express();
const SERVICE_NAME = 'channel_manager';
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

const getTenantId = (req) => req.headers['x-tenant-id'] || DEFAULT_TENANT_ID;

// ============================================
// WEBHOOK SECURITY
// ============================================

function generateWebhookSecret() {
  return crypto.randomBytes(32).toString('hex');
}

function verifyWebhookSignature(rawBody, signature, secret, channel) {
  if (!signature || !secret) return false;
  try {
    let expectedSignature;
    const bodyStr = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);

    if (channel === 'booking_com' || channel === 'expedia') {
      // Most OTAs use HMAC-SHA256
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(bodyStr);
      expectedSignature = hmac.digest('hex');
    } else if (channel === 'airbnb') {
      // Airbnb uses base64 encoded signature
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(bodyStr);
      expectedSignature = hmac.digest('base64');
    } else {
      // Default to SHA256 hex
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(bodyStr);
      expectedSignature = hmac.digest('hex');
    }

    // Use timing-safe comparison
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (sigBuffer.length !== expectedBuffer.length) return false;
    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  } catch (error) {
    console.error('Webhook signature verification error:', error.message);
    return false;
  }
}

// Middleware to capture raw body for webhook signature verification
app.use('/webhook', express.raw({ type: '*/*' }));

// ============================================
// CHANNEL CONNECTIONS
// ============================================

const SUPPORTED_CHANNELS = [
  { code: 'booking_com', name: 'Booking.com', type: 'ota', logo: 'booking.png' },
  { code: 'expedia', name: 'Expedia', type: 'ota', logo: 'expedia.png' },
  { code: 'airbnb', name: 'Airbnb', type: 'ota', logo: 'airbnb.png' },
  { code: 'agoda', name: 'Agoda', type: 'ota', logo: 'agoda.png' },
  { code: 'tripadvisor', name: 'TripAdvisor', type: 'ota', logo: 'tripadvisor.png' },
  { code: 'google_hotels', name: 'Google Hotels', type: 'metasearch', logo: 'google.png' },
  { code: 'trivago', name: 'Trivago', type: 'metasearch', logo: 'trivago.png' },
  { code: 'gds_amadeus', name: 'Amadeus GDS', type: 'gds', logo: 'amadeus.png' },
  { code: 'gds_sabre', name: 'Sabre GDS', type: 'gds', logo: 'sabre.png' },
];

app.get('/channels/available', (req, res) => {
  res.json({ success: true, channels: SUPPORTED_CHANNELS });
});

app.get('/connections', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const result = await query(`
      SELECT c.*, 
             (SELECT COUNT(*) FROM channel_bookings WHERE channel_id = c.id AND created_at > NOW() - INTERVAL '30 days') as bookings_30d,
             (SELECT SUM(total_amount) FROM channel_bookings WHERE channel_id = c.id AND created_at > NOW() - INTERVAL '30 days') as revenue_30d
      FROM channel_connections c
      WHERE c.tenant_id = $1
      ORDER BY c.channel_name
    `, [tenantId]);
    res.json({ success: true, connections: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/connections', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { channel_code, channel_name, api_key, api_secret, property_id, settings } = req.body;

    // Generate webhook secret for this connection
    const webhookSecret = generateWebhookSecret();

    const result = await query(`
      INSERT INTO channel_connections (tenant_id, channel_code, channel_name, api_key, api_secret, property_id, webhook_secret, settings, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', NOW())
      RETURNING id, tenant_id, channel_code, channel_name, property_id, webhook_secret, settings, status, created_at
    `, [tenantId, channel_code, channel_name, api_key, api_secret, property_id, webhookSecret, JSON.stringify(settings || {})]);

    await publishEnvelope('hospitality.channel.connection_created.v1', 1, { connection_id: result.rows[0].id });
    res.json({ success: true, data: { connection: result.rows[0] } });
  } catch (e) {
    res.status(500).json({ success: false, error: { code: 'CONNECTION_CREATE_FAILED', message: e.message } });
  }
});

app.patch('/connections/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { status, api_key, api_secret, settings } = req.body;
    
    const updates = [];
    const values = [id, tenantId];
    let idx = 3;
    
    if (status) { updates.push(`status = $${idx++}`); values.push(status); }
    if (api_key) { updates.push(`api_key = $${idx++}`); values.push(api_key); }
    if (api_secret) { updates.push(`api_secret = $${idx++}`); values.push(api_secret); }
    if (settings) { updates.push(`settings = $${idx++}`); values.push(JSON.stringify(settings)); }
    
    if (updates.length === 0) return res.status(400).json({ error: 'No updates provided' });
    
    const result = await query(`
      UPDATE channel_connections SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2 RETURNING *
    `, values);
    
    res.json({ success: true, connection: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// RATE & AVAILABILITY SYNC
// ============================================

app.get('/inventory', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { from_date, to_date, room_type } = req.query;
    
    let sql = `
      SELECT ci.*, rt.name as room_type_name
      FROM channel_inventory ci
      LEFT JOIN hotel_room_types rt ON ci.room_type_code = rt.code AND ci.tenant_id = rt.tenant_id
      WHERE ci.tenant_id = $1
    `;
    const params = [tenantId];
    let idx = 2;
    
    if (from_date) { sql += ` AND ci.date >= $${idx++}`; params.push(from_date); }
    if (to_date) { sql += ` AND ci.date <= $${idx++}`; params.push(to_date); }
    if (room_type) { sql += ` AND ci.room_type_code = $${idx++}`; params.push(room_type); }
    
    sql += ' ORDER BY ci.date, ci.room_type_code';
    
    const result = await query(sql, params);
    res.json({ success: true, inventory: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/inventory/update', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { updates } = req.body; // Array of { date, room_type_code, available, rate, min_stay, closed }
    
    await client.query('BEGIN');
    
    for (const u of updates) {
      await client.query(`
        INSERT INTO channel_inventory (tenant_id, date, room_type_code, available_rooms, rate, min_stay, is_closed, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (tenant_id, date, room_type_code) 
        DO UPDATE SET available_rooms = $4, rate = $5, min_stay = $6, is_closed = $7, updated_at = NOW()
      `, [tenantId, u.date, u.room_type_code, u.available, u.rate, u.min_stay || 1, u.closed || false]);
    }
    
    await client.query('COMMIT');
    
    // Queue sync to channels
    await publishEnvelope('hospitality.channel.inventory_updated.v1', 1, { tenant_id: tenantId, count: updates.length });
    
    res.json({ success: true, updated: updates.length });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

app.post('/sync/push', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { channel_ids, from_date, to_date } = req.body;
    
    // Create sync job
    const result = await query(`
      INSERT INTO channel_sync_jobs (tenant_id, job_type, channel_ids, date_from, date_to, status, created_at)
      VALUES ($1, 'push_rates', $2, $3, $4, 'pending', NOW())
      RETURNING *
    `, [tenantId, JSON.stringify(channel_ids || []), from_date, to_date]);
    
    await publishEnvelope('hospitality.channel.sync_requested.v1', 1, { job_id: result.rows[0].id });
    
    res.json({ success: true, job: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/sync/pull', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { channel_ids } = req.body;
    
    const result = await query(`
      INSERT INTO channel_sync_jobs (tenant_id, job_type, channel_ids, status, created_at)
      VALUES ($1, 'pull_bookings', $2, 'pending', NOW())
      RETURNING *
    `, [tenantId, JSON.stringify(channel_ids || [])]);
    
    await publishEnvelope('hospitality.channel.sync_requested.v1', 1, { job_id: result.rows[0].id });
    
    res.json({ success: true, job: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// CHANNEL BOOKINGS
// ============================================

app.get('/bookings', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { channel_id, status, from_date, to_date, limit = 50 } = req.query;
    
    let sql = `
      SELECT cb.*, cc.channel_name
      FROM channel_bookings cb
      JOIN channel_connections cc ON cb.channel_id = cc.id
      WHERE cb.tenant_id = $1
    `;
    const params = [tenantId];
    let idx = 2;
    
    if (channel_id) { sql += ` AND cb.channel_id = $${idx++}`; params.push(channel_id); }
    if (status) { sql += ` AND cb.status = $${idx++}`; params.push(status); }
    if (from_date) { sql += ` AND cb.check_in >= $${idx++}`; params.push(from_date); }
    if (to_date) { sql += ` AND cb.check_in <= $${idx++}`; params.push(to_date); }
    
    sql += ` ORDER BY cb.created_at DESC LIMIT $${idx}`;
    params.push(limit);
    
    const result = await query(sql, params);
    res.json({ success: true, bookings: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Secure webhook endpoint for OTA callbacks (with signature verification)
app.post('/webhook/:channel_id', async (req, res) => {
  const client = await getClient();
  try {
    const { channel_id } = req.params;
    const signature = req.headers['x-webhook-signature'] || req.headers['x-signature'];

    // Get channel connection and webhook secret
    const connResult = await query(`
      SELECT id, tenant_id, channel_code, webhook_secret FROM channel_connections WHERE id = $1
    `, [channel_id]);

    if (connResult.rowCount === 0) {
      return res.status(404).json({ success: false, error: { code: 'CHANNEL_NOT_FOUND', message: 'Channel connection not found' } });
    }

    const connection = connResult.rows[0];

    // Verify webhook signature
    const rawBody = req.body;
    if (!verifyWebhookSignature(rawBody, signature, connection.webhook_secret, connection.channel_code)) {
      console.warn(`Webhook signature verification failed for channel ${channel_id}`);
      return res.status(401).json({ success: false, error: { code: 'INVALID_SIGNATURE', message: 'Webhook signature verification failed' } });
    }

    // Parse body if it was raw
    const booking = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    const tenantId = connection.tenant_id;

    await client.query('BEGIN');

    // Create channel booking record
    const cbResult = await client.query(`
      INSERT INTO channel_bookings (tenant_id, channel_id, channel_booking_id, guest_name, guest_email, guest_phone,
                                     room_type, check_in, check_out, adults, children, total_amount, commission, status, raw_data, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending', $14, NOW())
      RETURNING *
    `, [tenantId, channel_id, booking.channel_booking_id, booking.guest_name, booking.guest_email, booking.guest_phone,
        booking.room_type, booking.check_in, booking.check_out, booking.adults || 1, booking.children || 0,
        booking.total_amount, booking.commission || 0, JSON.stringify(booking)]);

    await client.query('COMMIT');

    await publishEnvelope('hospitality.channel.booking_received.v1', 1, { booking_id: cbResult.rows[0].id });

    res.json({ success: true, data: { booking: cbResult.rows[0] } });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: { code: 'WEBHOOK_PROCESSING_FAILED', message: e.message } });
  } finally {
    client.release();
  }
});

// Internal import endpoint (for manual imports, requires tenant auth)
app.post('/bookings/import', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { channel_id, booking } = req.body;

    // Verify channel belongs to tenant
    const connCheck = await query(`SELECT id FROM channel_connections WHERE id = $1 AND tenant_id = $2`, [channel_id, tenantId]);
    if (connCheck.rowCount === 0) {
      return res.status(403).json({ success: false, error: { code: 'UNAUTHORIZED_CHANNEL', message: 'Channel does not belong to this tenant' } });
    }

    await client.query('BEGIN');

    // Create channel booking record
    const cbResult = await client.query(`
      INSERT INTO channel_bookings (tenant_id, channel_id, channel_booking_id, guest_name, guest_email, guest_phone,
                                     room_type, check_in, check_out, adults, children, total_amount, commission, status, raw_data, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending', $14, NOW())
      RETURNING *
    `, [tenantId, channel_id, booking.channel_booking_id, booking.guest_name, booking.guest_email, booking.guest_phone,
        booking.room_type, booking.check_in, booking.check_out, booking.adults || 1, booking.children || 0,
        booking.total_amount, booking.commission || 0, JSON.stringify(booking.raw_data || {})]);

    await client.query('COMMIT');

    await publishEnvelope('hospitality.channel.booking_received.v1', 1, { booking_id: cbResult.rows[0].id });

    res.json({ success: true, data: { booking: cbResult.rows[0] } });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: { code: 'IMPORT_FAILED', message: e.message } });
  } finally {
    client.release();
  }
});

app.post('/bookings/:id/convert', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { room_id } = req.body;
    
    await client.query('BEGIN');
    
    // Get channel booking
    const cbResult = await client.query(`
      SELECT * FROM channel_bookings WHERE id = $1 AND tenant_id = $2 AND status = 'pending'
    `, [id, tenantId]);
    
    if (cbResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pending booking not found' });
    }
    
    const cb = cbResult.rows[0];
    
    // Create or find guest
    let guestResult = await client.query(`
      SELECT id FROM hotel_guests WHERE tenant_id = $1 AND (email = $2 OR phone = $3) LIMIT 1
    `, [tenantId, cb.guest_email, cb.guest_phone]);
    
    let guestId;
    if (guestResult.rowCount === 0) {
      const newGuest = await client.query(`
        INSERT INTO hotel_guests (tenant_id, full_name, email, phone, source, created_at)
        VALUES ($1, $2, $3, $4, 'ota', NOW()) RETURNING id
      `, [tenantId, cb.guest_name, cb.guest_email, cb.guest_phone]);
      guestId = newGuest.rows[0].id;
    } else {
      guestId = guestResult.rows[0].id;
    }
    
    // Create hotel booking
    const confNum = `CH${Date.now().toString(36).toUpperCase()}`;
    const bookingResult = await client.query(`
      INSERT INTO hotel_bookings (tenant_id, guest_id, room_id, confirmation_number, check_in_date, check_out_date,
                                   total_amount, adults_count, children_count, source, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ota', 'confirmed', NOW())
      RETURNING *
    `, [tenantId, guestId, room_id, confNum, cb.check_in, cb.check_out, cb.total_amount, cb.adults, cb.children]);
    
    // Update channel booking
    await client.query(`
      UPDATE channel_bookings SET status = 'converted', hotel_booking_id = $1, updated_at = NOW()
      WHERE id = $2
    `, [bookingResult.rows[0].id, id]);
    
    // Update room status
    await client.query(`UPDATE hotel_rooms SET status = 'reserved' WHERE id = $1`, [room_id]);
    
    await client.query('COMMIT');
    
    res.json({ success: true, hotel_booking: bookingResult.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ============================================
// RATE PARITY & MONITORING
// ============================================

app.get('/parity', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { date } = req.query;
    const checkDate = date || new Date().toISOString().split('T')[0];
    
    const result = await query(`
      SELECT rp.*, cc.channel_name
      FROM channel_rate_parity rp
      JOIN channel_connections cc ON rp.channel_id = cc.id
      WHERE rp.tenant_id = $1 AND rp.check_date = $2
      ORDER BY rp.room_type, cc.channel_name
    `, [tenantId, checkDate]);
    
    res.json({ success: true, parity: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/sync-logs', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { limit = 50 } = req.query;
    
    const result = await query(`
      SELECT sl.*, cc.channel_name
      FROM channel_sync_logs sl
      LEFT JOIN channel_connections cc ON sl.channel_id = cc.id
      WHERE sl.tenant_id = $1
      ORDER BY sl.created_at DESC
      LIMIT $2
    `, [tenantId, limit]);
    
    res.json({ success: true, logs: result.rows });
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
    
    const [connectionsRes, bookingsRes, revenueRes, pendingRes] = await Promise.all([
      query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'active') as active FROM channel_connections WHERE tenant_id = $1`, [tenantId]),
      query(`SELECT COUNT(*) FROM channel_bookings WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '30 days'`, [tenantId]),
      query(`SELECT COALESCE(SUM(total_amount), 0) as revenue, COALESCE(SUM(commission), 0) as commission FROM channel_bookings WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '30 days'`, [tenantId]),
      query(`SELECT COUNT(*) FROM channel_bookings WHERE tenant_id = $1 AND status = 'pending'`, [tenantId]),
    ]);
    
    res.json({
      success: true,
      stats: {
        total_channels: parseInt(connectionsRes.rows[0].total),
        active_channels: parseInt(connectionsRes.rows[0].active),
        bookings_30d: parseInt(bookingsRes.rows[0].count),
        revenue_30d: parseFloat(revenueRes.rows[0].revenue),
        commission_30d: parseFloat(revenueRes.rows[0].commission),
        pending_bookings: parseInt(pendingRes.rows[0].count),
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health
app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
app.get('/readyz', (req, res) => res.json({ status: 'ready' }));


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

const PORT = process.env.PORT || 8890;
app.listen(PORT, () => console.log(`Channel Manager Service listening on ${PORT}`));
