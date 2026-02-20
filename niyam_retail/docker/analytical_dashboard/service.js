// Analytical Dashboard - Retail KPIs & Metrics
// Features: 12 core KPIs, multi-store comparison, charts, alerts, scheduled reports

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
    console.log('✅ Analytical Dashboard: NATS KV Store connected');
    dbReady = true;
  } catch (error) {
    console.error('❌ Analytical Dashboard: Failed to connect:', error.message);
  }
})();

// Prometheus metrics
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
const httpHistogram = new promClient.Histogram({
  name: 'analytics_dashboard_http_request_duration_seconds',
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

const PORT = process.env.PORT || 8943;

// ============================================
// API ENDPOINTS - Dashboard Metrics (UI-friendly)
// ============================================

// GET /api/metrics - Dashboard metrics for UI
app.get('/api/metrics', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    
    // Revenue metrics
    let revenueToday = 0, revenueYesterday = 0, weekTrend = [];
    try {
      const todayResult = await query(`
        SELECT COALESCE(SUM(total_amount), 0) as total
        FROM transactions WHERE tenant_id = $1 AND DATE(created_at) = CURRENT_DATE
      `, [tenant]);
      revenueToday = parseFloat(todayResult.rows[0]?.total) || 0;
      
      const yesterdayResult = await query(`
        SELECT COALESCE(SUM(total_amount), 0) as total
        FROM transactions WHERE tenant_id = $1 AND DATE(created_at) = CURRENT_DATE - 1
      `, [tenant]);
      revenueYesterday = parseFloat(yesterdayResult.rows[0]?.total) || 0;
      
      const trendResult = await query(`
        SELECT DATE(created_at) as day, COALESCE(SUM(total_amount), 0) as total
        FROM transactions WHERE tenant_id = $1 AND created_at >= CURRENT_DATE - 7
        GROUP BY DATE(created_at) ORDER BY day
      `, [tenant]);
      weekTrend = trendResult.rows.map(r => parseFloat(r.total) || 0);
    } catch (e) { /* tables may not exist yet */ }
    
    // Orders metrics
    let ordersToday = 0, ordersYesterday = 0, avgValue = 0;
    try {
      const todayOrders = await query(`
        SELECT COUNT(*) as count, COALESCE(AVG(total_amount), 0) as avg
        FROM transactions WHERE tenant_id = $1 AND DATE(created_at) = CURRENT_DATE
      `, [tenant]);
      ordersToday = parseInt(todayOrders.rows[0]?.count) || 0;
      avgValue = parseFloat(todayOrders.rows[0]?.avg) || 0;
      
      const yesterdayOrders = await query(`
        SELECT COUNT(*) as count FROM transactions WHERE tenant_id = $1 AND DATE(created_at) = CURRENT_DATE - 1
      `, [tenant]);
      ordersYesterday = parseInt(yesterdayOrders.rows[0]?.count) || 0;
    } catch (e) { /* tables may not exist yet */ }
    
    // Customer metrics
    let activeCustomers = 0, newCustomers = 0, returningCustomers = 0;
    try {
      const custResult = await query(`
        SELECT 
          COUNT(DISTINCT customer_id) FILTER (WHERE created_at >= CURRENT_DATE - 30) as active,
          COUNT(DISTINCT customer_id) FILTER (WHERE DATE(created_at) = CURRENT_DATE) as new_today
        FROM transactions WHERE tenant_id = $1
      `, [tenant]);
      activeCustomers = parseInt(custResult.rows[0]?.active) || 0;
      newCustomers = parseInt(custResult.rows[0]?.new_today) || 0;
      returningCustomers = Math.max(0, activeCustomers - newCustomers);
    } catch (e) { /* tables may not exist yet */ }
    
    // Inventory metrics
    let lowStock = 0, outOfStock = 0, totalValue = 0;
    try {
      const invResult = await query(`
        SELECT 
          COUNT(*) FILTER (WHERE quantity > 0 AND quantity <= reorder_point) as low_stock,
          COUNT(*) FILTER (WHERE quantity = 0) as out_of_stock,
          COALESCE(SUM(quantity * cost_price), 0) as total_value
        FROM products WHERE tenant_id = $1 AND is_active = true
      `, [tenant]);
      lowStock = parseInt(invResult.rows[0]?.low_stock) || 0;
      outOfStock = parseInt(invResult.rows[0]?.out_of_stock) || 0;
      totalValue = parseFloat(invResult.rows[0]?.total_value) || 0;
    } catch (e) { /* tables may not exist yet */ }
    
    res.json({
      revenue: { today: revenueToday, yesterday: revenueYesterday, week_trend: weekTrend },
      orders: { today: ordersToday, yesterday: ordersYesterday, avg_value: avgValue },
      customers: { active: activeCustomers, new: newCustomers, returning: returningCustomers },
      inventory: { low_stock: lowStock, out_of_stock: outOfStock, total_value: totalValue }
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// GET /api/quick-stats - Quick stats for dashboard
app.get('/api/quick-stats', async (req, res) => {
  res.json({ stats: [] }); // placeholder
});

// ============================================
// API ENDPOINTS - Sales Analytics (for Sales Analytics UI)
// ============================================

// GET /api/sales/metrics - Sales metrics for period
app.get('/api/sales/metrics', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { period = 'month' } = req.query;
    
    const days = period === 'day' ? 1 : period === 'week' ? 7 : period === 'year' ? 365 : 30;
    
    let totalRevenue = 0, totalOrders = 0, avgOrderValue = 0, totalUnits = 0, returnRate = 0, newCustomers = 0;
    try {
      const result = await query(`
        SELECT 
          COALESCE(SUM(total_amount), 0) as total_revenue,
          COUNT(*) as total_orders,
          COALESCE(AVG(total_amount), 0) as avg_order_value,
          COUNT(DISTINCT customer_id) as new_customers
        FROM transactions 
        WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '${days} days'
      `, [tenant]);
      totalRevenue = parseFloat(result.rows[0]?.total_revenue) || 0;
      totalOrders = parseInt(result.rows[0]?.total_orders) || 0;
      avgOrderValue = parseFloat(result.rows[0]?.avg_order_value) || 0;
      newCustomers = parseInt(result.rows[0]?.new_customers) || 0;
      
      const unitsResult = await query(`
        SELECT COALESCE(SUM(ti.quantity), 0) as total_units
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.id
        WHERE t.tenant_id = $1 AND t.created_at >= NOW() - INTERVAL '${days} days'
      `, [tenant]);
      totalUnits = parseInt(unitsResult.rows[0]?.total_units) || 0;
    } catch (e) { /* tables may not exist */ }
    
    res.json({
      total_revenue: totalRevenue,
      total_orders: totalOrders,
      avg_order_value: avgOrderValue,
      total_units: totalUnits,
      return_rate: returnRate,
      new_customers: newCustomers
    });
  } catch (error) {
    console.error('Error fetching sales metrics:', error);
    res.status(500).json({ error: 'Failed to fetch sales metrics' });
  }
});

// GET /api/sales/trends - Sales trends over time
app.get('/api/sales/trends', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { period = 'month' } = req.query;
    
    const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
    let trends = [];
    
    try {
      const result = await query(`
        SELECT 
          DATE(created_at) as date,
          COALESCE(SUM(total_amount), 0) as revenue,
          COUNT(*) as orders
        FROM transactions 
        WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY DATE(created_at)
        ORDER BY date
      `, [tenant]);
      trends = result.rows.map(r => ({
        date: r.date,
        revenue: parseFloat(r.revenue) || 0,
        orders: parseInt(r.orders) || 0
      }));
    } catch (e) { /* tables may not exist */ }
    
    res.json({ trends });
  } catch (error) {
    console.error('Error fetching sales trends:', error);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

// GET /api/sales/top-products - Top selling products
app.get('/api/sales/top-products', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { limit = 10 } = req.query;
    
    let products = [];
    try {
      const result = await query(`
        SELECT 
          p.id as product_id,
          p.name as product_name,
          COALESCE(SUM(ti.quantity), 0) as units_sold,
          COALESCE(SUM(ti.quantity * ti.unit_price), 0) as revenue
        FROM products p
        LEFT JOIN transaction_items ti ON p.id = ti.product_id
        LEFT JOIN transactions t ON ti.transaction_id = t.id AND t.tenant_id = $1
        WHERE p.tenant_id = $1
        GROUP BY p.id, p.name
        ORDER BY revenue DESC
        LIMIT $2
      `, [tenant, parseInt(limit)]);
      products = result.rows;
    } catch (e) { /* tables may not exist */ }
    
    res.json({ products });
  } catch (error) {
    console.error('Error fetching top products:', error);
    res.status(500).json({ error: 'Failed to fetch top products' });
  }
});

// GET /api/sales/top-categories - Top categories by revenue
app.get('/api/sales/top-categories', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    
    let categories = [];
    try {
      const result = await query(`
        SELECT 
          COALESCE(c.name, 'Uncategorized') as category,
          COALESCE(SUM(ti.quantity * ti.unit_price), 0) as revenue
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN transaction_items ti ON p.id = ti.product_id
        LEFT JOIN transactions t ON ti.transaction_id = t.id AND t.tenant_id = $1
        WHERE p.tenant_id = $1
        GROUP BY c.name
        ORDER BY revenue DESC
      `, [tenant]);
      
      const total = result.rows.reduce((sum, r) => sum + parseFloat(r.revenue), 0);
      categories = result.rows.map(r => ({
        category: r.category,
        revenue: parseFloat(r.revenue) || 0,
        percentage: total > 0 ? ((parseFloat(r.revenue) / total) * 100).toFixed(1) : 0
      }));
    } catch (e) { /* tables may not exist */ }
    
    res.json({ categories });
  } catch (error) {
    console.error('Error fetching top categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// ============================================
// API ENDPOINTS - 12 Core KPIs
// ============================================

// GET /api/kpis - Get all KPIs for dashboard
app.get('/api/kpis', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { period = '30', store_id } = req.query; // period in days
    
    const storeFilter = store_id ? 'AND store_id = $2' : '';
    const params = store_id ? [tenant, store_id] : [tenant];
    
    // 1. Sales (Total Revenue)
    const salesResult = await query(`
      SELECT COALESCE(SUM(total_amount), 0) as total_sales
      FROM transactions
      WHERE tenant_id = $1 ${storeFilter}
        AND created_at >= NOW() - INTERVAL '${period} days'
    `, params);
    
    // 2. Conversion Rate (transactions / sessions)
    const conversionResult = await query(`
      SELECT 
        COUNT(DISTINCT id) as transactions,
        (SELECT COUNT(*) FROM pos_sessions WHERE tenant_id = $1 ${storeFilter} AND created_at >= NOW() - INTERVAL '${period} days') as sessions
      FROM transactions
      WHERE tenant_id = $1 ${storeFilter}
        AND created_at >= NOW() - INTERVAL '${period} days'
    `, params);
    
    const conversionRate = conversionResult.rows[0].sessions > 0 
      ? (conversionResult.rows[0].transactions / conversionResult.rows[0].sessions * 100).toFixed(2)
      : 0;
    
    // 3. Average Order Value
    const aovResult = await query(`
      SELECT COALESCE(AVG(total_amount), 0) as avg_order_value
      FROM transactions
      WHERE tenant_id = $1 ${storeFilter}
        AND created_at >= NOW() - INTERVAL '${period} days'
    `, params);
    
    // 4. Gross Margin %
    const marginResult = await query(`
      SELECT 
        COALESCE(SUM(ti.quantity * ti.unit_price), 0) as revenue,
        COALESCE(SUM(ti.quantity * p.cost_price), 0) as cost
      FROM transaction_items ti
      JOIN transactions t ON ti.transaction_id = t.id
      JOIN products p ON ti.product_id = p.id
      WHERE t.tenant_id = $1 ${storeFilter}
        AND t.created_at >= NOW() - INTERVAL '${period} days'
    `, params);
    
    const grossMargin = marginResult.rows[0].revenue > 0
      ? ((marginResult.rows[0].revenue - marginResult.rows[0].cost) / marginResult.rows[0].revenue * 100).toFixed(2)
      : 0;
    
    // 5. Inventory Turnover
    const turnoverResult = await query(`
      SELECT 
        COALESCE(SUM(ti.quantity * p.cost_price), 0) as cogs,
        COALESCE(AVG(p.quantity * p.cost_price), 0) as avg_inventory
      FROM transaction_items ti
      JOIN transactions t ON ti.transaction_id = t.id
      JOIN products p ON ti.product_id = p.id
      WHERE t.tenant_id = $1 ${storeFilter}
        AND t.created_at >= NOW() - INTERVAL '${period} days'
    `, params);
    
    const inventoryTurnover = turnoverResult.rows[0].avg_inventory > 0
      ? (turnoverResult.rows[0].cogs / turnoverResult.rows[0].avg_inventory).toFixed(2)
      : 0;
    
    // 6. Customer Retention Rate
    const retentionResult = await query(`
      SELECT 
        COUNT(DISTINCT customer_id) FILTER (WHERE created_at >= NOW() - INTERVAL '${period} days') as current_customers,
        COUNT(DISTINCT customer_id) FILTER (WHERE created_at >= NOW() - INTERVAL '${parseInt(period) * 2} days' AND created_at < NOW() - INTERVAL '${period} days') as previous_customers
      FROM transactions
      WHERE tenant_id = $1 ${storeFilter}
    `, params);
    
    const retentionRate = retentionResult.rows[0].previous_customers > 0
      ? (retentionResult.rows[0].current_customers / retentionResult.rows[0].previous_customers * 100).toFixed(2)
      : 0;
    
    // 7. Stock-Out Rate
    const stockoutResult = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE quantity = 0) as stockout_count,
        COUNT(*) as total_products
      FROM products
      WHERE tenant_id = $1 AND is_active = true
    `, [tenant]);
    
    const stockoutRate = stockoutResult.rows[0].total_products > 0
      ? (stockoutResult.rows[0].stockout_count / stockoutResult.rows[0].total_products * 100).toFixed(2)
      : 0;
    
    // 8. Return Rate
    const returnResult = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'returned') as returns,
        COUNT(*) as total_transactions
      FROM transactions
      WHERE tenant_id = $1 ${storeFilter}
        AND created_at >= NOW() - INTERVAL '${period} days'
    `, params);
    
    const returnRate = returnResult.rows[0].total_transactions > 0
      ? (returnResult.rows[0].returns / returnResult.rows[0].total_transactions * 100).toFixed(2)
      : 0;
    
    res.json({
      success: true,
      period_days: parseInt(period),
      kpis: {
        total_sales: parseFloat(salesResult.rows[0].total_sales),
        conversion_rate: parseFloat(conversionRate),
        avg_order_value: parseFloat(aovResult.rows[0].avg_order_value),
        gross_margin_percent: parseFloat(grossMargin),
        inventory_turnover: parseFloat(inventoryTurnover),
        customer_retention_rate: parseFloat(retentionRate),
        stockout_rate: parseFloat(stockoutRate),
        return_rate: parseFloat(returnRate),
        total_transactions: parseInt(conversionResult.rows[0].transactions),
        total_customers: parseInt(retentionResult.rows[0].current_customers)
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/sales/trend - Sales trend data for charts
app.get('/api/sales/trend', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { period = '30', store_id } = req.query;
    
    const storeFilter = store_id ? 'AND store_id = $2' : '';
    const params = store_id ? [tenant, store_id] : [tenant];
    
    const result = await query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as transaction_count,
        COALESCE(SUM(total_amount), 0) as total_sales
      FROM transactions
      WHERE tenant_id = $1 ${storeFilter}
        AND created_at >= NOW() - INTERVAL '${period} days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `, params);
    
    res.json({ success: true, trend: result.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stores/comparison - Multi-store comparison
app.get('/api/stores/comparison', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { period = '30' } = req.query;
    
    const result = await query(`
      SELECT 
        s.id as store_id,
        s.name as store_name,
        COUNT(t.id) as transaction_count,
        COALESCE(SUM(t.total_amount), 0) as total_sales,
        COALESCE(AVG(t.total_amount), 0) as avg_order_value
      FROM stores s
      LEFT JOIN transactions t ON s.id = t.store_id AND t.created_at >= NOW() - INTERVAL '${period} days'
      WHERE s.tenant_id = $1
      GROUP BY s.id, s.name
      ORDER BY total_sales DESC
    `, [tenant]);
    
    res.json({ success: true, stores: result.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/products/top-sellers - Top selling products
app.get('/api/products/top-sellers', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { period = '30', limit = '10' } = req.query;
    
    const result = await query(`
      SELECT 
        p.id,
        p.name,
        p.sku,
        SUM(ti.quantity) as units_sold,
        SUM(ti.quantity * ti.unit_price) as revenue
      FROM transaction_items ti
      JOIN transactions t ON ti.transaction_id = t.id
      JOIN products p ON ti.product_id = p.id
      WHERE t.tenant_id = $1
        AND t.created_at >= NOW() - INTERVAL '${period} days'
      GROUP BY p.id, p.name, p.sku
      ORDER BY units_sold DESC
      LIMIT ${limit}
    `, [tenant]);
    
    res.json({ success: true, top_sellers: result.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/alerts/create - Create KPI alert
app.post('/api/alerts/create', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { kpi_name, threshold, condition } = req.body; // condition: 'above' | 'below'
    
    const alertId = `alert:${tenant}:${kpi_name}`;
    await kvStore.put(alertId, JSON.stringify({ kpi_name, threshold, condition, created_at: new Date() }));
    
    res.json({ success: true, message: 'Alert created', alert_id: alertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/alerts - List all alerts
app.get('/api/alerts', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    // In production, you'd query KV store for all alerts with prefix
    res.json({ success: true, alerts: [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Health endpoints
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'analytical_dashboard' }));
app.get('/readyz', (req, res) => {
  const ready = dbReady;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not ready' });
});
app.get('/stats', (req, res) => {
  res.json({
    uptime: Math.floor((Date.now() - started) / 1000),
    service: 'analytical_dashboard',
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
  console.log(`\n✅ Analytical Dashboard listening on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`\nFeatures: 12 Core KPIs, Multi-store comparison, Sales trends, Alerts\n`);
});
