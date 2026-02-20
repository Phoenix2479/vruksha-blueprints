// Onboarding Guide - Setup Wizard
// Features: Multi-step wizard, progress tracking, configuration templates, sample data

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
    console.log('✅ Onboarding Guide - Setup Wizard: NATS KV Store connected');
    dbReady = true;
  } catch (error) {
    console.error('❌ Onboarding Guide - Setup Wizard: Failed to connect:', error.message);
  }
})();

// Prometheus metrics
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
const httpHistogram = new promClient.Histogram({
  name: 'onboarding_guide_http_request_duration_seconds',
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

const PORT = process.env.PORT || 8961;

// ============================================
// API ENDPOINTS
// ============================================

// GET /api/onboarding/status - Get onboarding status
app.get('/api/onboarding/status', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    
    const result = await query(`
      SELECT * FROM onboarding_progress
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [tenant]);
    
    if (result.rows.length === 0) {
      // Initialize onboarding
      const init = await query(`
        INSERT INTO onboarding_progress (tenant_id, current_step, completed_steps, total_steps, created_at)
        VALUES ($1, 1, 0, 7, NOW())
        RETURNING *
      `, [tenant]);
      return res.json({ success: true, progress: init.rows[0] });
    }
    
    res.json({ success: true, progress: result.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/onboarding/step/complete - Complete onboarding step
app.post('/api/onboarding/step/complete', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { step_number, step_data } = req.body;
    
    const result = await query(`
      UPDATE onboarding_progress
      SET current_step = $1 + 1,
          completed_steps = $1,
          step_data = COALESCE(step_data, '{}'::jsonb) || $2::jsonb,
          updated_at = NOW()
      WHERE tenant_id = $3
      RETURNING *
    `, [step_number, JSON.stringify(step_data), tenant]);
    
    res.json({ success: true, progress: result.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/onboarding/complete - Complete onboarding
app.post('/api/onboarding/complete', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    
    const result = await query(`
      UPDATE onboarding_progress
      SET completed_steps = total_steps,
          current_step = total_steps,
          completed_at = NOW(),
          updated_at = NOW()
      WHERE tenant_id = $1
      RETURNING *
    `, [tenant]);
    
    res.json({ success: true, message: 'Onboarding complete', progress: result.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/onboarding/templates - Get configuration templates
app.get('/api/onboarding/templates', (req, res) => {
  try {
    const { retail_type } = req.query; // 'grocery' | 'fashion' | 'electronics'
    
    const templates = {
      grocery: { tax_rate: 5, reorder_level: 50, categories: ['Food', 'Beverages', 'Household'] },
      fashion: { tax_rate: 8, reorder_level: 20, categories: ['Clothing', 'Accessories', 'Footwear'] },
      electronics: { tax_rate: 10, reorder_level: 10, categories: ['Computers', 'Phones', 'Accessories'] }
    };
    
    res.json({ success: true, template: templates[retail_type] || templates.grocery });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/onboarding/sample-data - Load sample data
app.post('/api/onboarding/sample-data', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { include_products, include_customers } = req.body;
    
    let loaded = [];
    
    if (include_products) {
      // Create sample products
      await query(`
        INSERT INTO products (tenant_id, name, sku, unit_price, quantity, created_at)
        VALUES 
          ($1, 'Sample Product 1', 'SKU-001', 19.99, 100, NOW()),
          ($1, 'Sample Product 2', 'SKU-002', 29.99, 50, NOW())
      `, [tenant]);
      loaded.push('products');
    }
    
    if (include_customers) {
      // Create sample customers
      await query(`
        INSERT INTO customers (tenant_id, name, email, created_at)
        VALUES 
          ($1, 'John Doe', 'john@example.com', NOW()),
          ($1, 'Jane Smith', 'jane@example.com', NOW())
      `, [tenant]);
      loaded.push('customers');
    }
    
    res.json({ success: true, message: 'Sample data loaded', loaded });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Health endpoints
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'onboarding_guide' }));
app.get('/readyz', (req, res) => {
  const ready = dbReady;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not ready' });
});
app.get('/stats', (req, res) => {
  res.json({
    uptime: Math.floor((Date.now() - started) / 1000),
    service: 'onboarding_guide',
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
  console.log(`\n✅ Onboarding Guide - Setup Wizard listening on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`\nFeatures: Multi-step wizard, progress tracking, configuration templates, sample data\n`);
});
