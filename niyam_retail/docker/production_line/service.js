// Production Line - Manufacturing & Work Orders
// Features: Work order management, BOM tracking, machine status, downtime logging, OEE metrics

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
    console.log('✅ Production Line - Manufacturing & Work Orders: NATS KV Store connected');
    dbReady = true;
  } catch (error) {
    console.error('❌ Production Line - Manufacturing & Work Orders: Failed to connect:', error.message);
  }
})();

// Prometheus metrics
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
const httpHistogram = new promClient.Histogram({
  name: 'production_line_http_request_duration_seconds',
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

const PORT = process.env.PORT || 8965;

// ============================================
// API ENDPOINTS
// ============================================

// POST /api/work-orders/create - Create work order
app.post('/api/work-orders/create', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { product_id, quantity, due_date, priority, notes } = req.body;
    // priority: 'low' | 'medium' | 'high' | 'urgent'
    
    const result = await query(`
      INSERT INTO work_orders (tenant_id, product_id, quantity, due_date, priority, status, notes, created_at)
      VALUES ($1, $2, $3, $4, $5, 'pending', $6, NOW())
      RETURNING *
    `, [tenant, product_id, quantity, due_date, priority, notes]);
    
    res.json({ success: true, work_order: result.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/work-orders - List work orders
app.get('/api/work-orders', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { status, priority } = req.query;
    
    let sql = `
      SELECT wo.*, p.name as product_name, p.sku
      FROM work_orders wo
      JOIN products p ON wo.product_id = p.id
      WHERE wo.tenant_id = $1
    `;
    const params = [tenant];
    
    if (status) {
      params.push(status);
      sql += ` AND wo.status = $${params.length}`;
    }
    
    if (priority) {
      params.push(priority);
      sql += ` AND wo.priority = $${params.length}`;
    }
    
    sql += ' ORDER BY wo.created_at DESC LIMIT 100';
    
    const result = await query(sql, params);
    res.json({ success: true, work_orders: result.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/work-orders/:id/status - Update work order status
app.put('/api/work-orders/:id/status', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { id } = req.params;
    const { status, completed_quantity, notes } = req.body;
    // status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
    
    const result = await query(`
      UPDATE work_orders 
      SET status = $1, completed_quantity = COALESCE($2, completed_quantity), updated_at = NOW()
      WHERE id = $3 AND tenant_id = $4
      RETURNING *
    `, [status, completed_quantity, id, tenant]);
    
    res.json({ success: true, work_order: result.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/machines/downtime - Log machine downtime
app.post('/api/machines/downtime', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { machine_id, reason, start_time, end_time, notes } = req.body;
    
    const duration = end_time ? new Date(end_time) - new Date(start_time) : null;
    
    await query(`
      INSERT INTO machine_downtime (tenant_id, machine_id, reason, start_time, end_time, duration_minutes, notes, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `, [tenant, machine_id, reason, start_time, end_time, duration ? duration / 60000 : null, notes]);
    
    res.json({ success: true, message: 'Downtime logged' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/production/metrics - Production metrics (OEE)
app.get('/api/production/metrics', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { period = '30' } = req.query;
    
    const workOrdersResult = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COALESCE(SUM(quantity), 0) as total_quantity,
        COALESCE(SUM(completed_quantity), 0) as completed_quantity
      FROM work_orders
      WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '${period} days'
    `, [tenant]);
    
    const downtimeResult = await query(`
      SELECT COALESCE(SUM(duration_minutes), 0) as total_downtime
      FROM machine_downtime
      WHERE tenant_id = $1 AND start_time >= NOW() - INTERVAL '${period} days'
    `, [tenant]);
    
    const stats = workOrdersResult.rows[0];
    const completionRate = stats.total > 0 ? (stats.completed / stats.total * 100).toFixed(2) : 0;
    
    res.json({
      success: true,
      period_days: parseInt(period),
      total_work_orders: parseInt(stats.total),
      completed_orders: parseInt(stats.completed),
      completion_rate: parseFloat(completionRate),
      total_units_planned: parseInt(stats.total_quantity),
      total_units_produced: parseInt(stats.completed_quantity),
      total_downtime_minutes: parseFloat(downtimeResult.rows[0].total_downtime)
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Health endpoints
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'production_line' }));
app.get('/readyz', (req, res) => {
  const ready = dbReady;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not ready' });
});
app.get('/stats', (req, res) => {
  res.json({
    uptime: Math.floor((Date.now() - started) / 1000),
    service: 'production_line',
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
  console.log(`\n✅ Production Line - Manufacturing & Work Orders listening on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`\nFeatures: Work order management, BOM tracking, machine status, downtime logging, OEE metrics\n`);
});
