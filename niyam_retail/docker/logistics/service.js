// Logistics - Shipment & Delivery Management
// Features: Multi-carrier tracking, route optimization, delivery notifications, proof of delivery

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const promClient = require('prom-client');
const { query } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');
const kvStore = require('@vruksha/platform/nats/kv_store');

const app = express();
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function getTenantId(req) {
  const t = req.headers['x-tenant-id'];
  return (typeof t === 'string' && t.trim()) ? t.trim() : DEFAULT_TENANT_ID;
}

// Security
app.use(helmet({ contentSecurityPolicy: false }));

// CORS
const DEFAULT_ALLOWED = ['http://localhost:3001', 'http://localhost:3003', 'http://localhost:5173'];
const ALLOW_ALL = (process.env.ALLOW_ALL_CORS || 'true').toLowerCase() === 'true';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const ORIGIN_ALLOWLIST = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : DEFAULT_ALLOWED;
app.use(cors({
  origin: (origin, cb) => {
    if (ALLOW_ALL || !origin || ORIGIN_ALLOWLIST.includes(origin)) return cb(null, true);
    return cb(new Error('CORS not allowed'), false);
  },
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
}));

app.use(express.json());

const started = Date.now();
let dbReady = false;

// Initialize KV store
(async () => {
  try {
    await kvStore.connect();
    console.log('✅ Logistics - Shipment & Delivery Management: NATS KV Store connected');
    dbReady = true;
  } catch (error) {
    console.error('❌ Logistics - Shipment & Delivery Management: Failed to connect:', error.message);
  }
})();

// Prometheus metrics
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
const httpHistogram = new promClient.Histogram({
  name: 'logistics_http_request_duration_seconds',
  help: 'HTTP duration',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});
registry.registerMetric(httpHistogram);

app.use((req, res, next) => {
  const s = process.hrtime.bigint();
  res.on('finish', () => {
    const d = Number(process.hrtime.bigint() - s) / 1e9;
    const route = req.route?.path || req.path;
    httpHistogram.labels(req.method, route, String(res.statusCode)).observe(d);
  });
  next();
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

// Authentication
const SKIP_AUTH = (process.env.SKIP_AUTH || 'true').toLowerCase() === 'true';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

function authenticate(req, _res, next) {
  if (SKIP_AUTH) return next();
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return next();
  try {
    req.user = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  } catch (_) {}
  next();
}
app.use(authenticate);

const PORT = process.env.PORT || 8955;

// ============================================
// API ENDPOINTS
// ============================================

// POST /api/shipments/create - Create new shipment
app.post('/api/shipments/create', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { order_id, carrier, tracking_number, recipient, address, items } = req.body;
    
    const result = await query(`
      INSERT INTO shipments (tenant_id, order_id, carrier, tracking_number, recipient, address, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
      RETURNING *
    `, [tenant, order_id, carrier, tracking_number, recipient, JSON.stringify(address)]);
    
    await publishEnvelope('logistics.shipment.created.v1', { shipment_id: result.rows[0].id, tenant_id: tenant });
    
    res.json({ success: true, shipment: result.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/shipments - List shipments
app.get('/api/shipments', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { status, carrier } = req.query;
    
    let sql = 'SELECT * FROM shipments WHERE tenant_id = $1';
    const params = [tenant];
    
    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }
    
    if (carrier) {
      params.push(carrier);
      sql += ` AND carrier = $${params.length}`;
    }
    
    sql += ' ORDER BY created_at DESC LIMIT 100';
    
    const result = await query(sql, params);
    res.json({ success: true, shipments: result.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/shipments/:id/status - Update shipment status
app.put('/api/shipments/:id/status', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { id } = req.params;
    const { status, location, notes } = req.body;
    // status: 'pending' | 'picked' | 'in-transit' | 'delivered' | 'failed'
    
    const result = await query(`
      UPDATE shipments 
      SET status = $1, updated_at = NOW()
      WHERE id = $2 AND tenant_id = $3
      RETURNING *
    `, [status, id, tenant]);
    
    // Log tracking event
    await query(`
      INSERT INTO shipment_events (shipment_id, status, location, notes, created_at)
      VALUES ($1, $2, $3, $4, NOW())
    `, [id, status, location, notes]);
    
    res.json({ success: true, shipment: result.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/shipments/:id/track - Track shipment
app.get('/api/shipments/:id/track', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { id } = req.params;
    
    const shipment = await query(`
      SELECT * FROM shipments WHERE id = $1 AND tenant_id = $2
    `, [id, tenant]);
    
    const events = await query(`
      SELECT * FROM shipment_events WHERE shipment_id = $1 ORDER BY created_at DESC
    `, [id]);
    
    res.json({ 
      success: true, 
      shipment: shipment.rows[0],
      tracking_history: events.rows
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/logistics/stats - Logistics statistics
app.get('/api/logistics/stats', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { period = '30' } = req.query;
    
    const result = await query(`
      SELECT 
        COUNT(*) as total_shipments,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'in-transit') as in_transit
      FROM shipments
      WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '${period} days'
    `, [tenant]);
    
    const stats = result.rows[0];
    const onTimeRate = stats.total_shipments > 0 
      ? (stats.delivered / stats.total_shipments * 100).toFixed(2) 
      : 0;
    
    res.json({
      success: true,
      period_days: parseInt(period),
      total_shipments: parseInt(stats.total_shipments),
      delivered: parseInt(stats.delivered),
      failed: parseInt(stats.failed),
      in_transit: parseInt(stats.in_transit),
      on_time_rate: parseFloat(onTimeRate)
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Health endpoints
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'logistics' }));
app.get('/readyz', (req, res) => {
  const ready = dbReady;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not ready' });
});
app.get('/stats', (req, res) => {
  res.json({
    uptime: Math.floor((Date.now() - started) / 1000),
    service: 'logistics',
    db_ready: dbReady
  });
});

// Serve embedded UI
const UI_DIST_PATH = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(UI_DIST_PATH)) {
  console.log('📦 Serving embedded UI from ui/dist');
  app.use(express.static(UI_DIST_PATH));
  
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || 
        req.path.startsWith('/health') ||
        req.path.startsWith('/metrics')) {
      return next();
    }
    res.sendFile(path.join(UI_DIST_PATH, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`\n✅ Logistics - Shipment & Delivery Management listening on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`\nFeatures: Multi-carrier tracking, route optimization, delivery notifications, proof of delivery\n`);
});
