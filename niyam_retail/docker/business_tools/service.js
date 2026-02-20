// Business Tools - Calculators & Reports
// Features: Profit margin calculator, break-even analysis, pricing simulator, financial reports

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
    console.log('✅ Business Tools - Calculators & Reports: NATS KV Store connected');
    dbReady = true;
  } catch (error) {
    console.error('❌ Business Tools - Calculators & Reports: Failed to connect:', error.message);
  }
})();

// Prometheus metrics
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
const httpHistogram = new promClient.Histogram({
  name: 'business_tools_http_request_duration_seconds',
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

const PORT = process.env.PORT || 8946;

// ============================================
// API ENDPOINTS
// ============================================

// POST /api/calculator/margin - Calculate profit margin and markup
app.post('/api/calculator/margin', (req, res) => {
  try {
    const { cost, price, type } = req.body; // type: 'margin' | 'markup'
    
    if (!cost || !price) {
      return res.status(400).json({ error: 'Cost and price required' });
    }
    
    const margin = ((price - cost) / price * 100).toFixed(2);
    const markup = ((price - cost) / cost * 100).toFixed(2);
    
    res.json({
      success: true,
      cost: parseFloat(cost),
      price: parseFloat(price),
      margin_percent: parseFloat(margin),
      markup_percent: parseFloat(markup),
      profit: price - cost
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/calculator/breakeven - Break-even analysis
app.post('/api/calculator/breakeven', (req, res) => {
  try {
    const { fixed_costs, variable_cost_per_unit, price_per_unit } = req.body;
    
    if (!fixed_costs || !variable_cost_per_unit || !price_per_unit) {
      return res.status(400).json({ error: 'All parameters required' });
    }
    
    const contributionMargin = price_per_unit - variable_cost_per_unit;
    const breakEvenUnits = Math.ceil(fixed_costs / contributionMargin);
    const breakEvenRevenue = breakEvenUnits * price_per_unit;
    
    res.json({
      success: true,
      break_even_units: breakEvenUnits,
      break_even_revenue: breakEvenRevenue,
      contribution_margin: contributionMargin
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/calculator/roi - ROI calculator
app.post('/api/calculator/roi', (req, res) => {
  try {
    const { investment, gain } = req.body;
    
    if (!investment || !gain) {
      return res.status(400).json({ error: 'Investment and gain required' });
    }
    
    const roi = ((gain - investment) / investment * 100).toFixed(2);
    const netProfit = gain - investment;
    
    res.json({
      success: true,
      investment: parseFloat(investment),
      gain: parseFloat(gain),
      roi_percent: parseFloat(roi),
      net_profit: netProfit
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/reports/financial - Generate financial report
app.get('/api/reports/financial', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { period = '30' } = req.query;
    
    // Get revenue
    const revenueResult = await query(`
      SELECT COALESCE(SUM(total_amount), 0) as revenue
      FROM transactions
      WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '${period} days'
    `, [tenant]);
    
    // Get costs
    const costResult = await query(`
      SELECT COALESCE(SUM(ti.quantity * p.cost_price), 0) as cogs
      FROM transaction_items ti
      JOIN transactions t ON ti.transaction_id = t.id
      JOIN products p ON ti.product_id = p.id
      WHERE t.tenant_id = $1 AND t.created_at >= NOW() - INTERVAL '${period} days'
    `, [tenant]);
    
    const revenue = parseFloat(revenueResult.rows[0].revenue);
    const cogs = parseFloat(costResult.rows[0].cogs);
    const grossProfit = revenue - cogs;
    const grossMargin = revenue > 0 ? (grossProfit / revenue * 100).toFixed(2) : 0;
    
    res.json({
      success: true,
      period_days: parseInt(period),
      revenue,
      cost_of_goods_sold: cogs,
      gross_profit: grossProfit,
      gross_margin_percent: parseFloat(grossMargin)
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/calculator/pricing - Pricing strategy calculator
app.post('/api/calculator/pricing', (req, res) => {
  try {
    const { cost, desired_margin, strategy } = req.body; // strategy: 'cost_plus' | 'margin_based'
    
    if (!cost || !desired_margin) {
      return res.status(400).json({ error: 'Cost and desired margin required' });
    }
    
    let price;
    if (strategy === 'cost_plus') {
      // Markup-based: price = cost * (1 + markup/100)
      price = cost * (1 + desired_margin / 100);
    } else {
      // Margin-based: price = cost / (1 - margin/100)
      price = cost / (1 - desired_margin / 100);
    }
    
    res.json({
      success: true,
      cost: parseFloat(cost),
      suggested_price: parseFloat(price.toFixed(2)),
      strategy,
      margin_percent: desired_margin
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Health endpoints
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'business_tools' }));
app.get('/readyz', (req, res) => {
  const ready = dbReady;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not ready' });
});
app.get('/stats', (req, res) => {
  res.json({
    uptime: Math.floor((Date.now() - started) / 1000),
    service: 'business_tools',
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
  console.log(`\n✅ Business Tools - Calculators & Reports listening on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`\nFeatures: Profit margin calculator, break-even analysis, pricing simulator, financial reports\n`);
});
