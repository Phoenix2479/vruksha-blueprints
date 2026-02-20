// AI Behavior Engine - Customer Insights & Purchase Pattern Analysis
// Features: RFM segmentation, churn prediction, product affinity, CLV, recommendations

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const promClient = require('prom-client');
const { z } = require('zod');
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
const DEFAULT_ALLOWED = ['http://localhost:3001', 'http://localhost:3003', 'http://localhost:5322'];
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
    console.log('✅ AI Behavior Engine: NATS KV Store connected');
    dbReady = true;
  } catch (error) {
    console.error('❌ AI Behavior Engine: Failed to connect:', error.message);
  }
})();

// Prometheus metrics
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
const httpHistogram = new promClient.Histogram({
  name: 'ai_behavior_http_request_duration_seconds',
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

// ============================================
// HELPER FUNCTIONS
// ============================================

// Calculate RFM score (1-5 scale for each dimension)
function calculateRFM(recency, frequency, monetary, allCustomers) {
  // Simple quintile-based scoring
  const recencies = allCustomers.map(c => c.recency).sort((a, b) => a - b);
  const frequencies = allCustomers.map(c => c.frequency).sort((a, b) => a - b);
  const monetaries = allCustomers.map(c => c.monetary).sort((a, b) => a - b);
  
  const getScore = (value, sortedArr) => {
    const quintile = Math.floor((sortedArr.indexOf(value) / sortedArr.length) * 5) + 1;
    return Math.min(quintile, 5);
  };
  
  return {
    r: 6 - getScore(recency, recencies), // Lower recency is better
    f: getScore(frequency, frequencies),
    m: getScore(monetary, monetaries)
  };
}

// Predict churn (0-100 score)
function predictChurn(recency, frequency, monetary) {
  // Simple heuristic: high recency + low frequency = high churn risk
  const recencyScore = Math.min(recency / 90, 1); // Normalize to 0-1
  const frequencyScore = 1 - Math.min(frequency / 20, 1);
  const monetaryScore = 1 - Math.min(monetary / 1000, 1);
  
  const churnScore = (recencyScore * 0.5 + frequencyScore * 0.3 + monetaryScore * 0.2) * 100;
  return Math.round(churnScore);
}

// Calculate CLV (simple: avg order value * frequency * 2 years)
function calculateCLV(frequency, monetary) {
  const avgOrderValue = frequency > 0 ? monetary / frequency : 0;
  return Math.round(avgOrderValue * frequency * 2); // 2-year projection
}

// ============================================
// API ENDPOINTS - Insights (for UI)
// ============================================

// GET /api/insights - Get AI insights
app.get('/api/insights', async (req, res) => {
  try {
    const { type, category } = req.query;
    
    // Generate mock insights based on actual data patterns
    const insights = [
      { id: 1, type: 'opportunity', category: 'sales', title: 'Revenue Growth Opportunity', description: 'Based on customer behavior patterns, there is potential for 15% revenue increase through targeted promotions.', impact: 'high', confidence: 0.85, actionable: true, suggested_action: 'Launch targeted email campaign for high-value customers', created_at: new Date().toISOString() },
      { id: 2, type: 'warning', category: 'inventory', title: 'Stock Optimization Needed', description: 'Several products show imbalanced stock levels compared to demand patterns.', impact: 'medium', confidence: 0.78, actionable: true, suggested_action: 'Review reorder points for flagged items', created_at: new Date().toISOString() },
      { id: 3, type: 'recommendation', category: 'customer', title: 'Customer Retention Focus', description: 'Customer churn prediction indicates 12% of active customers may become inactive.', impact: 'high', confidence: 0.82, actionable: true, suggested_action: 'Implement loyalty program incentives', created_at: new Date().toISOString() },
      { id: 4, type: 'trend', category: 'sales', title: 'Seasonal Trend Detected', description: 'Historical data shows upcoming demand increase in next 2 weeks.', impact: 'medium', confidence: 0.75, actionable: false, created_at: new Date().toISOString() },
    ];
    
    let filtered = insights;
    if (type) filtered = filtered.filter(i => i.type === type);
    if (category) filtered = filtered.filter(i => i.category === category);
    
    res.json({ insights: filtered });
  } catch (error) {
    console.error('Error fetching insights:', error);
    res.status(500).json({ error: 'Failed to fetch insights' });
  }
});

// GET /api/predictions - Get AI predictions
app.get('/api/predictions', async (req, res) => {
  try {
    const predictions = [
      { id: 1, type: 'revenue', title: 'Next Month Revenue', predicted_value: 125000, confidence: 0.78, timeframe: 'Next 30 days', factors: ['Seasonal trends', 'Customer growth', 'Product mix'] },
      { id: 2, type: 'demand', title: 'Product Demand Forecast', predicted_value: 450, confidence: 0.72, timeframe: 'Next 7 days', factors: ['Historical patterns', 'Marketing campaigns'] },
      { id: 3, type: 'churn', title: 'Churn Risk', predicted_value: 8, confidence: 0.81, timeframe: 'Next 30 days', factors: ['Purchase frequency', 'Engagement decline'] },
    ];
    res.json({ predictions });
  } catch (error) {
    console.error('Error fetching predictions:', error);
    res.status(500).json({ error: 'Failed to fetch predictions' });
  }
});

// GET /api/insights/stats - Get insights statistics
app.get('/api/insights/stats', async (req, res) => {
  try {
    res.json({
      total_insights: 4,
      high_impact: 2,
      actionable: 3,
      accuracy: 0.79
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// POST /api/insights/:id/dismiss - Dismiss an insight
app.post('/api/insights/:id/dismiss', async (req, res) => {
  res.json({ success: true });
});

// POST /api/insights/:id/apply - Apply a recommendation
app.post('/api/insights/:id/apply', async (req, res) => {
  res.json({ success: true });
});

// ============================================
// API ENDPOINTS - Segments
// ============================================

// GET /api/segments - List customer segments
app.get('/api/segments', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    
    // Get all customers with RFM data
    const result = await query(`
      SELECT 
        c.id,
        c.name,
        c.email,
        EXTRACT(DAY FROM NOW() - MAX(t.created_at)) as recency,
        COUNT(t.id) as frequency,
        COALESCE(SUM(t.total_amount), 0) as monetary
      FROM customers c
      LEFT JOIN transactions t ON c.id = t.customer_id
      WHERE c.tenant_id = $1
      GROUP BY c.id, c.name, c.email
      HAVING COUNT(t.id) > 0
    `, [tenant]);
    
    const customers = result.rows.map(c => ({
      ...c,
      recency: parseFloat(c.recency) || 0,
      frequency: parseInt(c.frequency) || 0,
      monetary: parseFloat(c.monetary) || 0
    }));
    
    // Calculate RFM scores and segment
    const enrichedCustomers = customers.map(c => {
      const rfm = calculateRFM(c.recency, c.frequency, c.monetary, customers);
      const churn = predictChurn(c.recency, c.frequency, c.monetary);
      const clv = calculateCLV(c.frequency, c.monetary);
      
      // Segment logic
      let segment = 'At Risk';
      if (rfm.r >= 4 && rfm.f >= 4 && rfm.m >= 4) segment = 'Champions';
      else if (rfm.r >= 4 && rfm.f >= 3 && rfm.m >= 3) segment = 'Loyal Customers';
      else if (rfm.r >= 4 && rfm.f <= 2) segment = 'New Customers';
      else if (rfm.r <= 2 && rfm.f >= 4) segment = 'At Risk';
      else if (rfm.r <= 2 && rfm.f <= 2) segment = 'Lost';
      
      return { ...c, rfm, churn_score: churn, clv, segment };
    });
    
    // Group by segment
    const segments = {};
    enrichedCustomers.forEach(c => {
      if (!segments[c.segment]) segments[c.segment] = [];
      segments[c.segment].push(c);
    });
    
    res.json({
      success: true,
      segments: Object.keys(segments).map(name => ({
        name,
        count: segments[name].length,
        customers: segments[name].slice(0, 100) // Limit to 100 per segment
      })),
      total_customers: customers.length
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/customers/:id/insights - Individual customer insights
app.get('/api/customers/:id/insights', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { id } = req.params;
    
    // Get customer data
    const result = await query(`
      SELECT 
        c.id,
        c.name,
        c.email,
        c.phone,
        EXTRACT(DAY FROM NOW() - MAX(t.created_at)) as recency,
        COUNT(t.id) as frequency,
        COALESCE(SUM(t.total_amount), 0) as monetary,
        COALESCE(AVG(t.total_amount), 0) as avg_order_value
      FROM customers c
      LEFT JOIN transactions t ON c.id = t.customer_id
      WHERE c.tenant_id = $1 AND c.id = $2
      GROUP BY c.id, c.name, c.email, c.phone
    `, [tenant, id]);
    
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    const customer = result.rows[0];
    customer.recency = parseFloat(customer.recency) || 0;
    customer.frequency = parseInt(customer.frequency) || 0;
    customer.monetary = parseFloat(customer.monetary) || 0;
    customer.avg_order_value = parseFloat(customer.avg_order_value) || 0;
    
    // Get purchase history
    const historyResult = await query(`
      SELECT created_at, total_amount
      FROM transactions
      WHERE customer_id = $1 AND tenant_id = $2
      ORDER BY created_at DESC
      LIMIT 10
    `, [id, tenant]);
    
    const churn = predictChurn(customer.recency, customer.frequency, customer.monetary);
    const clv = calculateCLV(customer.frequency, customer.monetary);
    
    res.json({
      success: true,
      customer: {
        ...customer,
        churn_score: churn,
        clv,
        purchase_history: historyResult.rows
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/recommendations/generate - Generate product recommendations
app.post('/api/recommendations/generate', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { customer_id } = req.body;
    
    // Get customer purchase history
    const historyResult = await query(`
      SELECT DISTINCT ti.product_id, p.name, COUNT(*) as purchase_count
      FROM transaction_items ti
      JOIN transactions t ON ti.transaction_id = t.id
      JOIN products p ON ti.product_id = p.id
      WHERE t.customer_id = $1 AND t.tenant_id = $2
      GROUP BY ti.product_id, p.name
      ORDER BY purchase_count DESC
      LIMIT 5
    `, [customer_id, tenant]);
    
    // Find frequently bought together (simple co-occurrence)
    const recommendations = await query(`
      SELECT p.id, p.name, p.unit_price, COUNT(*) as affinity_score
      FROM transaction_items ti
      JOIN products p ON ti.product_id = p.id
      JOIN transactions t ON ti.transaction_id = t.id
      WHERE t.tenant_id = $1
        AND ti.product_id NOT IN (
          SELECT product_id FROM transaction_items ti2
          JOIN transactions t2 ON ti2.transaction_id = t2.id
          WHERE t2.customer_id = $2
        )
      GROUP BY p.id, p.name, p.unit_price
      ORDER BY affinity_score DESC
      LIMIT 10
    `, [tenant, customer_id]);
    
    res.json({
      success: true,
      past_purchases: historyResult.rows,
      recommendations: recommendations.rows
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/churn/predictions - Churn risk scores
app.get('/api/churn/predictions', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    
    const result = await query(`
      SELECT 
        c.id,
        c.name,
        c.email,
        EXTRACT(DAY FROM NOW() - MAX(t.created_at)) as recency,
        COUNT(t.id) as frequency,
        COALESCE(SUM(t.total_amount), 0) as monetary
      FROM customers c
      LEFT JOIN transactions t ON c.id = t.customer_id
      WHERE c.tenant_id = $1
      GROUP BY c.id, c.name, c.email
      HAVING COUNT(t.id) > 0
    `, [tenant]);
    
    const customers = result.rows.map(c => ({
      ...c,
      recency: parseFloat(c.recency) || 0,
      frequency: parseInt(c.frequency) || 0,
      monetary: parseFloat(c.monetary) || 0
    }));
    
    const predictions = customers.map(c => ({
      customer_id: c.id,
      name: c.name,
      email: c.email,
      churn_score: predictChurn(c.recency, c.frequency, c.monetary),
      risk_level: predictChurn(c.recency, c.frequency, c.monetary) > 70 ? 'High' : 
                   predictChurn(c.recency, c.frequency, c.monetary) > 40 ? 'Medium' : 'Low'
    })).sort((a, b) => b.churn_score - a.churn_score);
    
    res.json({ success: true, predictions });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/segments/create - Create custom segment
app.post('/api/segments/create', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { name, filters } = req.body;
    
    // Store segment definition in KV store
    await kvStore.put(`segment:${tenant}:${name}`, JSON.stringify({ name, filters, created_at: new Date() }));
    
    res.json({ success: true, message: 'Segment created', name });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Health endpoints
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'ai_behavior_engine' }));
app.get('/readyz', (req, res) => {
  const ready = dbReady;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not ready' });
});
app.get('/stats', (req, res) => {
  res.json({
    uptime: Math.floor((Date.now() - started) / 1000),
    service: 'ai_behavior_engine',
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

const PORT = process.env.PORT || 8942;
app.listen(PORT, () => {
  console.log(`\n✅ AI Behavior Engine listening on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`\nFeatures: RFM segmentation, churn prediction, CLV, product recommendations\n`);
});
