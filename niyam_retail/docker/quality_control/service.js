// Quality Control - Batch Tracking & Defect Management
// Features: Batch tracking, defect logging, supplier ratings, recalls, compliance

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
    console.log('✅ Quality Control - Batch Tracking & Defect Management: NATS KV Store connected');
    dbReady = true;
  } catch (error) {
    console.error('❌ Quality Control - Batch Tracking & Defect Management: Failed to connect:', error.message);
  }
})();

// Prometheus metrics
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
const httpHistogram = new promClient.Histogram({
  name: 'quality_control_http_request_duration_seconds',
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

const PORT = process.env.PORT || 8967;

// ============================================
// API ENDPOINTS
// ============================================

// POST /api/batches/create - Create new batch
app.post('/api/batches/create', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { product_id, batch_number, quantity, manufacturing_date, expiry_date } = req.body;
    
    const result = await query(`
      INSERT INTO batches (tenant_id, product_id, batch_number, quantity, manufacturing_date, expiry_date, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
    `, [tenant, product_id, batch_number, quantity, manufacturing_date, expiry_date]);
    
    await publishEnvelope('quality.batch.created.v1', { batch_id: result.rows[0].id, tenant_id: tenant });
    
    res.json({ success: true, batch: result.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/batches - List all batches
app.get('/api/batches', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { product_id, status } = req.query;
    
    let sql = `
      SELECT b.*, p.name as product_name, p.sku
      FROM batches b
      JOIN products p ON b.product_id = p.id
      WHERE b.tenant_id = $1
    `;
    const params = [tenant];
    
    if (product_id) {
      params.push(product_id);
      sql += ` AND b.product_id = $${params.length}`;
    }
    
    sql += ` ORDER BY b.created_at DESC LIMIT 100`;
    
    const result = await query(sql, params);
    res.json({ success: true, batches: result.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/defects/log - Log defect
app.post('/api/defects/log', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { batch_id, product_id, defect_type, severity, quantity, description } = req.body;
    // severity: 'critical' | 'major' | 'minor'
    
    const result = await query(`
      INSERT INTO defects (tenant_id, batch_id, product_id, defect_type, severity, quantity, description, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *
    `, [tenant, batch_id, product_id, defect_type, severity, quantity, description]);
    
    res.json({ success: true, defect: result.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/defects - List defects
app.get('/api/defects', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { severity, batch_id } = req.query;
    
    let sql = `
      SELECT d.*, b.batch_number, p.name as product_name
      FROM defects d
      LEFT JOIN batches b ON d.batch_id = b.id
      JOIN products p ON d.product_id = p.id
      WHERE d.tenant_id = $1
    `;
    const params = [tenant];
    
    if (severity) {
      params.push(severity);
      sql += ` AND d.severity = $${params.length}`;
    }
    
    if (batch_id) {
      params.push(batch_id);
      sql += ` AND d.batch_id = $${params.length}`;
    }
    
    sql += ` ORDER BY d.created_at DESC LIMIT 100`;
    
    const result = await query(sql, params);
    res.json({ success: true, defects: result.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/quality/metrics - Quality metrics dashboard
app.get('/api/quality/metrics', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { period = '30' } = req.query;
    
    // Total batches
    const batchesResult = await query(`
      SELECT COUNT(*) as total_batches
      FROM batches
      WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '${period} days'
    `, [tenant]);
    
    // Total defects
    const defectsResult = await query(`
      SELECT 
        COUNT(*) as total_defects,
        COUNT(*) FILTER (WHERE severity = 'critical') as critical_defects,
        COUNT(*) FILTER (WHERE severity = 'major') as major_defects,
        COUNT(*) FILTER (WHERE severity = 'minor') as minor_defects
      FROM defects
      WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '${period} days'
    `, [tenant]);
    
    res.json({
      success: true,
      period_days: parseInt(period),
      metrics: {
        total_batches: parseInt(batchesResult.rows[0].total_batches),
        total_defects: parseInt(defectsResult.rows[0].total_defects),
        critical_defects: parseInt(defectsResult.rows[0].critical_defects),
        major_defects: parseInt(defectsResult.rows[0].major_defects),
        minor_defects: parseInt(defectsResult.rows[0].minor_defects)
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Health endpoints
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'quality_control' }));
app.get('/readyz', (req, res) => {
  const ready = dbReady;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not ready' });
});
app.get('/stats', (req, res) => {
  res.json({
    uptime: Math.floor((Date.now() - started) / 1000),
    service: 'quality_control',
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
  console.log(`\n✅ Quality Control - Batch Tracking & Defect Management listening on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`\nFeatures: Batch tracking, defect logging, supplier ratings, recalls, compliance\n`);
});
