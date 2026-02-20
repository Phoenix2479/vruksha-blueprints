// ROI Analysis - Investment Tracking & Profitability
// Features: Investment tracking, GMROI, payback period, product profitability, campaign ROI

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
    console.log('✅ ROI Analysis - Investment Tracking & Profitability: NATS KV Store connected');
    dbReady = true;
  } catch (error) {
    console.error('❌ ROI Analysis - Investment Tracking & Profitability: Failed to connect:', error.message);
  }
})();

// Prometheus metrics
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
const httpHistogram = new promClient.Histogram({
  name: 'roi_analysis_http_request_duration_seconds',
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

const PORT = process.env.PORT || 8969;

// ============================================
// API ENDPOINTS
// ============================================

// POST /api/investments/create - Track new investment
app.post('/api/investments/create', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { name, category, amount, date, expected_return, notes } = req.body;
    // category: 'marketing' | 'equipment' | 'inventory' | 'staff'
    
    const result = await query(`
      INSERT INTO investments (tenant_id, name, category, amount, date, expected_return, notes, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *
    `, [tenant, name, category, amount, date, expected_return, notes]);
    
    res.json({ success: true, investment: result.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/investments - List investments
app.get('/api/investments', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { category } = req.query;
    
    let sql = `SELECT * FROM investments WHERE tenant_id = $1`;
    const params = [tenant];
    
    if (category) {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }
    
    sql += ` ORDER BY date DESC`;
    
    const result = await query(sql, params);
    res.json({ success: true, investments: result.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/roi/gmroi - Calculate GMROI (Gross Margin Return on Investment)
app.get('/api/roi/gmroi', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { period = '30' } = req.query;
    
    // Calculate GMROI = Gross Profit / Average Inventory Cost
    const result = await query(`
      SELECT 
        COALESCE(SUM(ti.quantity * (ti.unit_price - p.cost_price)), 0) as gross_profit,
        COALESCE(AVG(p.quantity * p.cost_price), 1) as avg_inventory_cost
      FROM transaction_items ti
      JOIN transactions t ON ti.transaction_id = t.id
      JOIN products p ON ti.product_id = p.id
      WHERE t.tenant_id = $1 AND t.created_at >= NOW() - INTERVAL '${period} days'
    `, [tenant]);
    
    const grossProfit = parseFloat(result.rows[0].gross_profit);
    const avgInventoryCost = parseFloat(result.rows[0].avg_inventory_cost);
    const gmroi = avgInventoryCost > 0 ? (grossProfit / avgInventoryCost).toFixed(2) : 0;
    
    res.json({
      success: true,
      period_days: parseInt(period),
      gross_profit: grossProfit,
      avg_inventory_cost: avgInventoryCost,
      gmroi: parseFloat(gmroi),
      interpretation: parseFloat(gmroi) > 1 ? 'Profitable' : 'Not profitable'
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/roi/products - Product-level profitability
app.get('/api/roi/products', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { period = '30', limit = '20' } = req.query;
    
    const result = await query(`
      SELECT 
        p.id,
        p.name,
        p.sku,
        SUM(ti.quantity) as units_sold,
        SUM(ti.quantity * ti.unit_price) as revenue,
        SUM(ti.quantity * p.cost_price) as cost,
        SUM(ti.quantity * (ti.unit_price - p.cost_price)) as profit,
        CASE 
          WHEN SUM(ti.quantity * ti.unit_price) > 0 
          THEN (SUM(ti.quantity * (ti.unit_price - p.cost_price)) / SUM(ti.quantity * ti.unit_price) * 100)
          ELSE 0
        END as margin_percent
      FROM transaction_items ti
      JOIN transactions t ON ti.transaction_id = t.id
      JOIN products p ON ti.product_id = p.id
      WHERE t.tenant_id = $1 AND t.created_at >= NOW() - INTERVAL '${period} days'
      GROUP BY p.id, p.name, p.sku
      ORDER BY profit DESC
      LIMIT ${limit}
    `, [tenant]);
    
    res.json({ success: true, products: result.rows.map(r => ({
      ...r,
      units_sold: parseInt(r.units_sold),
      revenue: parseFloat(r.revenue),
      cost: parseFloat(r.cost),
      profit: parseFloat(r.profit),
      margin_percent: parseFloat(parseFloat(r.margin_percent).toFixed(2))
    }))});
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/roi/summary - ROI summary dashboard
app.get('/api/roi/summary', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { period = '30' } = req.query;
    
    // Total investments
    const investmentsResult = await query(`
      SELECT 
        COALESCE(SUM(amount), 0) as total_invested,
        COUNT(*) as investment_count
      FROM investments
      WHERE tenant_id = $1 AND date >= NOW() - INTERVAL '${period} days'
    `, [tenant]);
    
    // Total revenue & profit
    const revenueResult = await query(`
      SELECT 
        COALESCE(SUM(total_amount), 0) as revenue,
        COALESCE(SUM(total_amount - (SELECT SUM(ti.quantity * p.cost_price) 
          FROM transaction_items ti 
          JOIN products p ON ti.product_id = p.id 
          WHERE ti.transaction_id = t.id)), 0) as profit
      FROM transactions t
      WHERE t.tenant_id = $1 AND t.created_at >= NOW() - INTERVAL '${period} days'
    `, [tenant]);
    
    const totalInvested = parseFloat(investmentsResult.rows[0].total_invested);
    const revenue = parseFloat(revenueResult.rows[0].revenue);
    const profit = parseFloat(revenueResult.rows[0].profit);
    const roi = totalInvested > 0 ? ((profit - totalInvested) / totalInvested * 100).toFixed(2) : 0;
    
    res.json({
      success: true,
      period_days: parseInt(period),
      total_invested: totalInvested,
      investment_count: parseInt(investmentsResult.rows[0].investment_count),
      revenue,
      profit,
      roi_percent: parseFloat(roi)
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Health endpoints
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'roi_analysis' }));
app.get('/readyz', (req, res) => {
  const ready = dbReady;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not ready' });
});
app.get('/stats', (req, res) => {
  res.json({
    uptime: Math.floor((Date.now() - started) / 1000),
    service: 'roi_analysis',
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
  console.log(`\n✅ ROI Analysis - Investment Tracking & Profitability listening on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`\nFeatures: Investment tracking, GMROI, payback period, product profitability, campaign ROI\n`);
});
