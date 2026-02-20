// Net Worth - Financial Overview
// Features: Asset tracking, liability tracking, net worth calculation, financial health score

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
    console.log('✅ Net Worth - Financial Overview: NATS KV Store connected');
    dbReady = true;
  } catch (error) {
    console.error('❌ Net Worth - Financial Overview: Failed to connect:', error.message);
  }
})();

// Prometheus metrics
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
const httpHistogram = new promClient.Histogram({
  name: 'networth_http_request_duration_seconds',
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

const PORT = process.env.PORT || 8959;

// ============================================
// API ENDPOINTS
// ============================================

// GET /api/networth/summary - Get net worth summary
app.get('/api/networth/summary', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    
    // Calculate assets
    const assetsResult = await query(`
      SELECT 
        COALESCE(SUM(quantity * unit_price), 0) as inventory_value,
        (SELECT COALESCE(SUM(total_amount - amount_paid), 0) FROM invoices WHERE tenant_id = $1 AND status != 'paid') as receivables
      FROM products
      WHERE tenant_id = $1
    `, [tenant]);
    
    const cash = 0; // In production, get from accounting system
    const totalAssets = parseFloat(assetsResult.rows[0].inventory_value) + 
                        parseFloat(assetsResult.rows[0].receivables) + 
                        cash;
    
    // Calculate liabilities
    const liabilitiesResult = await query(`
      SELECT COALESCE(SUM(amount), 0) as total_payables
      FROM payables
      WHERE tenant_id = $1 AND status = 'pending'
    `, [tenant]);
    
    const totalLiabilities = parseFloat(liabilitiesResult.rows[0].total_payables || 0);
    const netWorth = totalAssets - totalLiabilities;
    
    res.json({
      success: true,
      net_worth: netWorth,
      total_assets: totalAssets,
      total_liabilities: totalLiabilities,
      breakdown: {
        cash: cash,
        inventory: parseFloat(assetsResult.rows[0].inventory_value),
        receivables: parseFloat(assetsResult.rows[0].receivables),
        payables: totalLiabilities
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/networth/trend - Net worth trend
app.get('/api/networth/trend', (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { months = '12' } = req.query;
    
    // In production, calculate historical net worth
    const trend = [];
    for (let i = parseInt(months); i >= 0; i--) {
      trend.push({
        month: new Date(Date.now() - i * 30 * 24 * 60 * 60 * 1000).toISOString().substr(0, 7),
        net_worth: Math.random() * 100000 + 50000 // Mock data
      });
    }
    
    res.json({ success: true, trend });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/assets/add - Add asset
app.post('/api/assets/add', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { name, category, value, purchase_date, notes } = req.body;
    // category: 'equipment' | 'inventory' | 'cash' | 'other'
    
    await query(`
      INSERT INTO assets (tenant_id, name, category, value, purchase_date, notes, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [tenant, name, category, value, purchase_date, notes]);
    
    res.json({ success: true, message: 'Asset added' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/liabilities/add - Add liability
app.post('/api/liabilities/add', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { name, category, amount, due_date, notes } = req.body;
    // category: 'loan' | 'payable' | 'other'
    
    await query(`
      INSERT INTO liabilities (tenant_id, name, category, amount, due_date, notes, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [tenant, name, category, amount, due_date, notes]);
    
    res.json({ success: true, message: 'Liability added' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/financial-health - Financial health score
app.get('/api/financial-health', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    
    // Simple health score calculation
    const summary = await query(`
      SELECT 
        (SELECT COUNT(*) FROM products WHERE tenant_id = $1 AND quantity > 0) as products_in_stock,
        (SELECT COUNT(*) FROM invoices WHERE tenant_id = $1 AND status = 'overdue') as overdue_invoices
    `, [tenant]);
    
    let healthScore = 100;
    if (summary.rows[0].overdue_invoices > 5) healthScore -= 20;
    if (summary.rows[0].products_in_stock < 10) healthScore -= 10;
    
    res.json({
      success: true,
      health_score: Math.max(healthScore, 0),
      status: healthScore > 80 ? 'Excellent' : healthScore > 60 ? 'Good' : 'Needs Attention'
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Health endpoints
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'networth' }));
app.get('/readyz', (req, res) => {
  const ready = dbReady;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not ready' });
});
app.get('/stats', (req, res) => {
  res.json({
    uptime: Math.floor((Date.now() - started) / 1000),
    service: 'networth',
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
  console.log(`\n✅ Net Worth - Financial Overview listening on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`\nFeatures: Asset tracking, liability tracking, net worth calculation, financial health score\n`);
});
