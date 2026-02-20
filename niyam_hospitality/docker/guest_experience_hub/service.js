// Guest Experience Hub
// Handles Guest Portal, Mobile Key, Feedback, Service Requests

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const promClient = require('prom-client');
const { z } = require('zod');

// Import shared modules (support both monorepo and Docker image layouts)
let db = null;
let sdk = null;

try {
  db = require('../../../../db/postgres');
  sdk = require('../../../../platform/sdk/node');
} catch (_) {
  db = require('@vruksha/platform/db/postgres');
  sdk = require('@vruksha/platform/sdk/node');
}

const { query } = db;
const { publishEnvelope } = sdk;

const app = express();
const SERVICE_NAME = 'guest_experience_hub';
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// Security
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Auth (Optional for Guest Portal mostly)
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
  return req.headers['x-tenant-id'] || DEFAULT_TENANT_ID;
}

// ============================================
// API ENDPOINTS
// ============================================

// Guest Login (by Room Number + Last Name)
app.post('/auth/guest-login', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { room_number, last_name } = req.body;

    const result = await query(
      `SELECT b.id as booking_id, g.full_name, r.room_number
       FROM hotel_bookings b
       JOIN hotel_rooms r ON b.room_id = r.id
       JOIN hotel_guests g ON b.guest_id = g.id
       WHERE b.tenant_id = $1 
       AND r.room_number = $2 
       AND g.full_name ILIKE $3
       AND b.status = 'checked_in'`,
      [tenantId, room_number, `%${last_name}`]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid room number or name, or not checked in.' });
    }

    const guest = result.rows[0];
    const token = jwt.sign({ ...guest, role: 'guest', tenant_id: tenantId }, JWT_SECRET);

    res.json({ success: true, token, guest });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get My Booking Details
app.get('/my-stay', async (req, res) => {
  // In real app, use req.user.booking_id
  // Mocking for demo if no auth
  res.json({
    success: true,
    stay: {
      room: '302',
      guest: 'John Doe',
      check_out: '2025-11-25',
      wifi_code: 'Hotel_Guest_302',
      services: ['Room Service', 'Housekeeping', 'Spa']
    }
  });
});

// Request Service (e.g., Extra Towels)
app.post('/requests', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { type, notes } = req.body;
    // In real app, this would create a task in housekeeping service via NATS or direct DB
    
    // Publish event so Housekeeping service picks it up
    await publishEnvelope('guest.request.created.v1', 1, { 
      tenant_id: tenantId,
      type, 
      notes,
      source: 'guest_portal' 
    });

    res.json({ success: true, message: 'Request received' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health
app.get('/healthz', (req, res) => res.json({ status: 'ok' }));


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

const PORT = process.env.PORT || 8926;
app.listen(PORT, () => {
  console.log(`✅ Guest Experience Service listening on ${PORT}`);
});
