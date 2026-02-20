// Analytics & Reporting Service
// Handles revenue reports, occupancy stats, and audit logs

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
const SERVICE_NAME = 'analytics_reporting';
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// Security
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

// ============================================
// API ENDPOINTS
// ============================================

// Dashboard Summary (Revenue, Occupancy, Orders)
app.get('/dashboard/summary', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const today = new Date().toISOString().split('T')[0];

    // 1. Revenue Today (Hotel + Restaurant)
    const hotelRevRes = await query(
      `SELECT COALESCE(SUM(total_amount), 0) as total FROM hotel_bookings 
       WHERE tenant_id = $1 AND created_at::date = $2`,
      [tenantId, today]
    );
    const restRevRes = await query(
      `SELECT COALESCE(SUM(total_amount), 0) as total FROM restaurant_orders 
       WHERE tenant_id = $1 AND created_at::date = $2`,
      [tenantId, today]
    );

    // 2. Occupancy
    const roomsRes = await query(
      `SELECT 
         COUNT(*) as total,
         COUNT(CASE WHEN status = 'occupied' THEN 1 END) as occupied
       FROM hotel_rooms WHERE tenant_id = $1`,
      [tenantId]
    );

    // 3. Restaurant Activity
    const ordersRes = await query(
      `SELECT COUNT(*) as total FROM restaurant_orders 
       WHERE tenant_id = $1 AND created_at::date = $2`,
      [tenantId, today]
    );

    const hotelRevenue = parseFloat(hotelRevRes.rows[0].total);
    const restRevenue = parseFloat(restRevRes.rows[0].total);
    const totalRooms = parseInt(roomsRes.rows[0].total);
    const occupiedRooms = parseInt(roomsRes.rows[0].occupied);
    const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

    res.json({
      success: true,
      summary: {
        revenue: {
          total: hotelRevenue + restRevenue,
          hotel: hotelRevenue,
          restaurant: restRevenue
        },
        occupancy: {
          total_rooms: totalRooms,
          occupied: occupiedRooms,
          rate: occupancyRate
        },
        operations: {
          today_orders: parseInt(ordersRes.rows[0].total)
        }
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Revenue Chart Data (Last 7 Days)
app.get('/reports/revenue', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    
    const result = await query(
      `WITH dates AS (
         SELECT generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day')::date AS date
       )
       SELECT 
         to_char(d.date, 'Mon DD') as date,
         COALESCE(SUM(hb.total_amount), 0) as hotel,
         COALESCE(SUM(ro.total_amount), 0) as restaurant
       FROM dates d
       LEFT JOIN hotel_bookings hb ON hb.created_at::date = d.date AND hb.tenant_id = $1
       LEFT JOIN restaurant_orders ro ON ro.created_at::date = d.date AND ro.tenant_id = $1
       GROUP BY d.date
       ORDER BY d.date`,
      [tenantId]
    );

    res.json({ success: true, data: result.rows });
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

const PORT = process.env.PORT || 8924;
app.listen(PORT, () => {
  console.log(`✅ Analytics Service listening on ${PORT}`);
});
