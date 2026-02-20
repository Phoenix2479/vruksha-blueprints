// Property Management Service (PMS) - Niyam Hotel
// Handles Rooms, Bookings, Guests, and Housekeeping

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const promClient = require('prom-client');
const { z } = require('zod');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

// Import shared modules (support both monorepo and Docker image layouts)
let db = null;
let sdk = null;
let kvStore = null;

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

// Constants
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SERVICE_NAME = 'property_management';

// Security
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true })); // Allow all for dev/testing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Storage for images
const STORAGE_ROOT = path.resolve(__dirname, '../../../../storage/uploads');
const UPLOAD_DIR = path.join(STORAGE_ROOT, 'hotel_images');
try {
    if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
} catch (err) {
    console.error(`Failed to create upload directory ${UPLOAD_DIR}:`, err.message);
}

// Serve static files
app.use('/files', express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${uuidv4()}${ext}`);
  }
});
const upload = multer({ storage });

// Observability
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
const httpHistogram = new promClient.Histogram({
  name: 'hotel_pms_http_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});
registry.registerMetric(httpHistogram);

app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const dur = Number(process.hrtime.bigint() - start) / 1e9;
    httpHistogram.labels(req.method, req.path, String(res.statusCode)).observe(dur);
    console.log(JSON.stringify({
      svc: SERVICE_NAME,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: Math.round(dur * 1000)
    }));
  });
  next();
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

// Auth Middleware
const SKIP_AUTH = (process.env.SKIP_AUTH || 'true').toLowerCase() === 'true';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

function authenticate(req, res, next) {
  if (SKIP_AUTH) return next();
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return next();
  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch (e) { /* ignore */ }
  next();
}

function getTenantId(req) {
  return req.headers['x-tenant-id'] || req.user?.tenant_id || DEFAULT_TENANT_ID;
}

app.use(authenticate);

// KV Store Init
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
// API ENDPOINTS
// ============================================

// --- ROOMS ---

app.get('/rooms', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { status } = req.query;
    let sql = 'SELECT * FROM hotel_rooms WHERE tenant_id = $1';
    const params = [tenantId];
    if (status) {
      sql += ' AND status = $2';
      params.push(status);
    }
    sql += ' ORDER BY room_number ASC';
    const result = await query(sql, params);
    res.json({ success: true, rooms: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/rooms', upload.array('images', 5), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { room_number, room_type, price_per_night, description, amenities } = req.body;
    const files = req.files || [];
    const images = files.map(f => ({ url: `/files/${f.filename}`, alt: room_number }));

    const result = await query(
      `INSERT INTO hotel_rooms (tenant_id, room_number, room_type, price_per_night, description, amenities, images)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        tenantId, 
        room_number, 
        room_type, 
        price_per_night || 0, 
        description, 
        JSON.stringify(amenities ? (Array.isArray(amenities) ? amenities : [amenities]) : []),
        JSON.stringify(images)
      ]
    );

    await publishEnvelope('hotel.room.created.v1', 1, { room_id: result.rows[0].id, tenant_id: tenantId });
    res.json({ success: true, room: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/rooms/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { status, price_per_night } = req.body;
    // Simplistic update
    const result = await query(
      `UPDATE hotel_rooms SET status = COALESCE($1, status), price_per_night = COALESCE($2, price_per_night), updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4 RETURNING *`,
      [status, price_per_night, id, tenantId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Room not found' });
    
    await publishEnvelope('hotel.room.updated.v1', 1, { room_id: id, status, tenant_id: tenantId });
    res.json({ success: true, room: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- BOOKINGS ---

app.get('/bookings', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { date } = req.query; // simple date filter
    let sql = `
      SELECT b.*, r.room_number, g.full_name as guest_name 
      FROM hotel_bookings b
      JOIN hotel_rooms r ON b.room_id = r.id
      JOIN hotel_guests g ON b.guest_id = g.id
      WHERE b.tenant_id = $1
    `;
    const params = [tenantId];
    if (date) {
      sql += ' AND b.check_in_date <= $2 AND b.check_out_date >= $2';
      params.push(date);
    }
    sql += ' ORDER BY b.check_in_date DESC';
    const result = await query(sql, params);
    res.json({ success: true, bookings: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const BookingSchema = z.object({
  guest_id: z.string().optional(), // if existing
  guest: z.object({ // if new
    full_name: z.string(),
    email: z.string().optional(),
    phone: z.string().optional()
  }).optional(),
  room_id: z.string().uuid(),
  check_in_date: z.string(),
  check_out_date: z.string(),
  total_amount: z.number().optional()
});

app.post('/bookings', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const parsed = BookingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    const { guest_id, guest, room_id, check_in_date, check_out_date, total_amount } = parsed.data;

    await client.query('BEGIN');

    let finalGuestId = guest_id;
    if (!finalGuestId && guest) {
      const gRes = await client.query(
        `INSERT INTO hotel_guests (tenant_id, full_name, email, phone) VALUES ($1, $2, $3, $4) RETURNING id`,
        [tenantId, guest.full_name, guest.email, guest.phone]
      );
      finalGuestId = gRes.rows[0].id;
    }

    if (!finalGuestId) throw new Error('Guest ID or details required');

    // Check availability
    const conflict = await client.query(
      `SELECT id FROM hotel_bookings 
       WHERE room_id = $1 AND status NOT IN ('cancelled')
       AND check_in_date < $3 AND check_out_date > $2`,
      [room_id, check_in_date, check_out_date]
    );
    if (conflict.rows.length > 0) {
      throw new Error('Room not available for these dates');
    }

    const bRes = await client.query(
      `INSERT INTO hotel_bookings (tenant_id, guest_id, room_id, check_in_date, check_out_date, total_amount, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'confirmed') RETURNING *`,
      [tenantId, finalGuestId, room_id, check_in_date, check_out_date, total_amount || 0]
    );

    await client.query('COMMIT');
    
    await publishEnvelope('hotel.booking.created.v1', 1, { booking_id: bRes.rows[0].id });
    res.json({ success: true, booking: bRes.rows[0] });

  } catch (e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

// --- GUESTS ---

app.get('/guests', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { search } = req.query;
    let sql = 'SELECT * FROM hotel_guests WHERE tenant_id = $1';
    const params = [tenantId];
    if (search) {
      sql += ' AND (full_name ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2)';
      params.push(`%${search}%`);
    }
    const result = await query(sql, params);
    res.json({ success: true, guests: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health
app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
app.get('/readyz', (req, res) => res.json({ status: dbReady ? 'ready' : 'not_ready' }));


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

const PORT = process.env.PORT || 8916;
app.listen(PORT, () => {
  console.log(`✅ Property Management Service listening on ${PORT}`);
});
