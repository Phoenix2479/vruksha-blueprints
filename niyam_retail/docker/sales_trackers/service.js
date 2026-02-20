// Sales Trackers Service - Complete Implementation
// Tracks daily sales, performance metrics, targets, and trends

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const promClient = require('prom-client');
const { z } = require('zod');
const { query } = require('@vruksha/platform/db/postgres');

const app = express();
app.use(express.json());
const started = Date.now();

const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());

function getTenantId(req) {
  const t = req.headers['x-tenant-id'];
  return (typeof t === 'string' && t.trim()) ? t.trim() : DEFAULT_TENANT_ID;
}

// AuthN/Z helpers
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

function requireAnyRole(roles) {
  return (req, res, next) => {
    if (SKIP_AUTH) return next();
    if (!req.user || !Array.isArray(req.user.roles)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const ok = req.user.roles.some(r => roles.includes(r));
    if (!ok) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

app.use(authenticate);

// Prometheus metrics
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
const salesCounter = new promClient.Counter({
  name: 'sales_tracker_queries_total',
  help: 'Total sales tracker queries',
  labelNames: ['endpoint'],
  registers: [registry]
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

// Validation schemas
const DateRangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date()
});

const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

// ============ SALES SUMMARY ENDPOINTS ============

// GET /sales/daily - Daily sales summary
app.get('/sales/daily', requireAnyRole(['cashier', 'manager', 'admin', 'accountant']), async (req, res, next) => {
  try {
    salesCounter.inc({ endpoint: 'daily' });
    const tenantId = getTenantId(req);
    const { from, to } = DateRangeSchema.parse(req.query);

    const result = await query(`
      SELECT
        DATE(created_at) as sale_date,
        COUNT(*)::int as transaction_count,
        COALESCE(SUM(total_amount), 0)::numeric as total_sales,
        COALESCE(SUM(discount_amount), 0)::numeric as total_discounts,
        COALESCE(AVG(total_amount), 0)::numeric as avg_transaction,
        COUNT(DISTINCT customer_id)::int as unique_customers
      FROM sales
      WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
      GROUP BY DATE(created_at)
      ORDER BY sale_date DESC
    `, [tenantId, from, to]);

    res.json({ success: true, from, to, daily_sales: result.rows });
  } catch (e) {
    next(e);
  }
});

// GET /sales/hourly - Hourly breakdown for a specific date
app.get('/sales/hourly', requireAnyRole(['manager', 'admin']), async (req, res, next) => {
  try {
    salesCounter.inc({ endpoint: 'hourly' });
    const tenantId = getTenantId(req);
    const date = z.coerce.date().parse(req.query.date);

    const result = await query(`
      SELECT
        EXTRACT(HOUR FROM created_at)::int as hour,
        COUNT(*)::int as transaction_count,
        COALESCE(SUM(total_amount), 0)::numeric as total_sales
      FROM sales
      WHERE tenant_id = $1 AND DATE(created_at) = $2
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY hour
    `, [tenantId, date]);

    res.json({ success: true, date, hourly_sales: result.rows });
  } catch (e) {
    next(e);
  }
});

// GET /sales/by-product - Sales breakdown by product
app.get('/sales/by-product', requireAnyRole(['manager', 'admin', 'accountant']), async (req, res, next) => {
  try {
    salesCounter.inc({ endpoint: 'by-product' });
    const tenantId = getTenantId(req);
    const { from, to } = DateRangeSchema.parse(req.query);
    const { limit } = PaginationSchema.parse(req.query);

    const result = await query(`
      SELECT
        si.product_id,
        p.name as product_name,
        p.sku,
        SUM(si.quantity)::int as units_sold,
        COALESCE(SUM(si.line_total), 0)::numeric as total_revenue,
        COUNT(DISTINCT s.id)::int as transaction_count
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      LEFT JOIN products p ON si.product_id = p.id
      WHERE s.tenant_id = $1 AND s.created_at BETWEEN $2 AND $3
      GROUP BY si.product_id, p.name, p.sku
      ORDER BY total_revenue DESC
      LIMIT $4
    `, [tenantId, from, to, limit]);

    res.json({ success: true, from, to, products: result.rows });
  } catch (e) {
    next(e);
  }
});

// GET /sales/by-category - Sales breakdown by category
app.get('/sales/by-category', requireAnyRole(['manager', 'admin', 'accountant']), async (req, res, next) => {
  try {
    salesCounter.inc({ endpoint: 'by-category' });
    const tenantId = getTenantId(req);
    const { from, to } = DateRangeSchema.parse(req.query);

    const result = await query(`
      SELECT
        c.id as category_id,
        c.name as category_name,
        SUM(si.quantity)::int as units_sold,
        COALESCE(SUM(si.line_total), 0)::numeric as total_revenue,
        COUNT(DISTINCT s.id)::int as transaction_count
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE s.tenant_id = $1 AND s.created_at BETWEEN $2 AND $3
      GROUP BY c.id, c.name
      ORDER BY total_revenue DESC
    `, [tenantId, from, to]);

    res.json({ success: true, from, to, categories: result.rows });
  } catch (e) {
    next(e);
  }
});

// GET /sales/by-staff - Sales by cashier/staff member
app.get('/sales/by-staff', requireAnyRole(['manager', 'admin']), async (req, res, next) => {
  try {
    salesCounter.inc({ endpoint: 'by-staff' });
    const tenantId = getTenantId(req);
    const { from, to } = DateRangeSchema.parse(req.query);

    const result = await query(`
      SELECT
        s.cashier_id,
        u.name as cashier_name,
        COUNT(*)::int as transaction_count,
        COALESCE(SUM(s.total_amount), 0)::numeric as total_sales,
        COALESCE(AVG(s.total_amount), 0)::numeric as avg_transaction,
        SUM(CASE WHEN s.payment_method = 'cash' THEN 1 ELSE 0 END)::int as cash_transactions,
        SUM(CASE WHEN s.payment_method = 'card' THEN 1 ELSE 0 END)::int as card_transactions
      FROM sales s
      LEFT JOIN users u ON s.cashier_id = u.id
      WHERE s.tenant_id = $1 AND s.created_at BETWEEN $2 AND $3
      GROUP BY s.cashier_id, u.name
      ORDER BY total_sales DESC
    `, [tenantId, from, to]);

    res.json({ success: true, from, to, staff_performance: result.rows });
  } catch (e) {
    next(e);
  }
});

// ============ TRENDS & ANALYTICS ============

// GET /sales/trends - Compare sales across time periods
app.get('/sales/trends', requireAnyRole(['manager', 'admin', 'accountant']), async (req, res, next) => {
  try {
    salesCounter.inc({ endpoint: 'trends' });
    const tenantId = getTenantId(req);
    const period = z.enum(['daily', 'weekly', 'monthly']).default('daily').parse(req.query.period);
    const { from, to } = DateRangeSchema.parse(req.query);

    let dateFormat, groupBy;
    switch (period) {
      case 'weekly':
        dateFormat = "DATE_TRUNC('week', created_at)";
        groupBy = 'week';
        break;
      case 'monthly':
        dateFormat = "DATE_TRUNC('month', created_at)";
        groupBy = 'month';
        break;
      default:
        dateFormat = "DATE(created_at)";
        groupBy = 'day';
    }

    const result = await query(`
      SELECT
        ${dateFormat} as period_start,
        COUNT(*)::int as transaction_count,
        COALESCE(SUM(total_amount), 0)::numeric as total_sales,
        COALESCE(AVG(total_amount), 0)::numeric as avg_transaction
      FROM sales
      WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
      GROUP BY ${dateFormat}
      ORDER BY period_start
    `, [tenantId, from, to]);

    res.json({ success: true, period, from, to, trends: result.rows });
  } catch (e) {
    next(e);
  }
});

// GET /sales/top-sellers - Top selling products
app.get('/sales/top-sellers', requireAnyRole(['manager', 'admin', 'accountant']), async (req, res, next) => {
  try {
    salesCounter.inc({ endpoint: 'top-sellers' });
    const tenantId = getTenantId(req);
    const { from, to } = DateRangeSchema.parse(req.query);
    const limit = z.coerce.number().int().min(1).max(50).default(10).parse(req.query.limit);

    const result = await query(`
      SELECT
        p.id as product_id,
        p.name as product_name,
        p.sku,
        p.category_id,
        c.name as category_name,
        SUM(si.quantity)::int as units_sold,
        COALESCE(SUM(si.line_total), 0)::numeric as total_revenue
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE s.tenant_id = $1 AND s.created_at BETWEEN $2 AND $3
      GROUP BY p.id, p.name, p.sku, p.category_id, c.name
      ORDER BY units_sold DESC
      LIMIT $4
    `, [tenantId, from, to, limit]);

    res.json({ success: true, from, to, top_sellers: result.rows });
  } catch (e) {
    next(e);
  }
});

// ============ TARGETS & GOALS ============

// GET /targets - Get sales targets
app.get('/targets', requireAnyRole(['manager', 'admin']), async (req, res, next) => {
  try {
    salesCounter.inc({ endpoint: 'targets' });
    const tenantId = getTenantId(req);
    const period = z.enum(['daily', 'weekly', 'monthly', 'yearly']).default('monthly').parse(req.query.period);

    const result = await query(`
      SELECT
        id, target_type, target_amount, period_start, period_end,
        store_id, staff_id, category_id,
        created_at, updated_at
      FROM sales_targets
      WHERE tenant_id = $1 AND target_type = $2
      ORDER BY period_start DESC
      LIMIT 50
    `, [tenantId, period]);

    res.json({ success: true, targets: result.rows });
  } catch (e) {
    next(e);
  }
});

// POST /targets - Create a sales target
app.post('/targets', requireAnyRole(['manager', 'admin']), async (req, res, next) => {
  try {
    salesCounter.inc({ endpoint: 'create-target' });
    const tenantId = getTenantId(req);

    const TargetSchema = z.object({
      target_type: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
      target_amount: z.number().positive(),
      period_start: z.coerce.date(),
      period_end: z.coerce.date(),
      store_id: z.string().uuid().optional(),
      staff_id: z.string().uuid().optional(),
      category_id: z.string().uuid().optional()
    });

    const data = TargetSchema.parse(req.body);

    const result = await query(`
      INSERT INTO sales_targets (tenant_id, target_type, target_amount, period_start, period_end, store_id, staff_id, category_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [tenantId, data.target_type, data.target_amount, data.period_start, data.period_end, data.store_id || null, data.staff_id || null, data.category_id || null]);

    res.status(201).json({ success: true, target: result.rows[0] });
  } catch (e) {
    next(e);
  }
});

// GET /targets/progress - Get progress against targets
app.get('/targets/progress', requireAnyRole(['cashier', 'manager', 'admin']), async (req, res, next) => {
  try {
    salesCounter.inc({ endpoint: 'target-progress' });
    const tenantId = getTenantId(req);

    const result = await query(`
      SELECT
        t.id as target_id,
        t.target_type,
        t.target_amount,
        t.period_start,
        t.period_end,
        COALESCE(SUM(s.total_amount), 0)::numeric as achieved_amount,
        ROUND((COALESCE(SUM(s.total_amount), 0) / t.target_amount * 100), 2) as progress_percentage
      FROM sales_targets t
      LEFT JOIN sales s ON s.tenant_id = t.tenant_id
        AND s.created_at BETWEEN t.period_start AND t.period_end
        AND (t.store_id IS NULL OR s.store_id = t.store_id)
        AND (t.staff_id IS NULL OR s.cashier_id = t.staff_id)
      WHERE t.tenant_id = $1 AND t.period_end >= CURRENT_DATE
      GROUP BY t.id
      ORDER BY t.period_start
    `, [tenantId]);

    res.json({ success: true, progress: result.rows });
  } catch (e) {
    next(e);
  }
});

// ============ PAYMENT ANALYSIS ============

// GET /sales/by-payment-method - Sales breakdown by payment method
app.get('/sales/by-payment-method', requireAnyRole(['manager', 'admin', 'accountant']), async (req, res, next) => {
  try {
    salesCounter.inc({ endpoint: 'by-payment-method' });
    const tenantId = getTenantId(req);
    const { from, to } = DateRangeSchema.parse(req.query);

    const result = await query(`
      SELECT
        payment_method,
        COUNT(*)::int as transaction_count,
        COALESCE(SUM(total_amount), 0)::numeric as total_amount,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
      FROM sales
      WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
      GROUP BY payment_method
      ORDER BY total_amount DESC
    `, [tenantId, from, to]);

    res.json({ success: true, from, to, payment_methods: result.rows });
  } catch (e) {
    next(e);
  }
});

// ============ REAL-TIME DASHBOARD ============

// GET /sales/realtime - Real-time sales stats for today
app.get('/sales/realtime', requireAnyRole(['cashier', 'manager', 'admin']), async (req, res, next) => {
  try {
    salesCounter.inc({ endpoint: 'realtime' });
    const tenantId = getTenantId(req);

    const result = await query(`
      SELECT
        COUNT(*)::int as transactions_today,
        COALESCE(SUM(total_amount), 0)::numeric as sales_today,
        COALESCE(AVG(total_amount), 0)::numeric as avg_transaction,
        COUNT(DISTINCT customer_id)::int as customers_today,
        MAX(created_at) as last_sale_at
      FROM sales
      WHERE tenant_id = $1 AND DATE(created_at) = CURRENT_DATE
    `, [tenantId]);

    // Get last 5 transactions
    const recentSales = await query(`
      SELECT id, total_amount, payment_method, created_at
      FROM sales
      WHERE tenant_id = $1 AND DATE(created_at) = CURRENT_DATE
      ORDER BY created_at DESC
      LIMIT 5
    `, [tenantId]);

    res.json({
      success: true,
      today: result.rows[0],
      recent_sales: recentSales.rows
    });
  } catch (e) {
    next(e);
  }
});

// ============ HEALTH & SYSTEM ============

app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'sales_trackers' }));
app.get('/readyz', (req, res) => res.json({ status: 'ready', service: 'sales_trackers' }));
app.get('/stats', (req, res) => res.json({ uptime: Math.round((Date.now() - started) / 1000) }));

// Error handler
app.use((err, req, res, next) => {
  console.error('[SalesTrackers Error]', err);
  if (err.name === 'ZodError') {
    return res.status(400).json({ success: false, error: 'Validation error', details: err.errors });
  }
  res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 8971;

// Serve embedded UI from ui/dist if it exists
const UI_DIST_PATH = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(UI_DIST_PATH)) {
  console.log('Serving embedded UI from ui/dist');
  app.use(express.static(UI_DIST_PATH));

  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') ||
        req.path.startsWith('/health') ||
        req.path.startsWith('/metrics') ||
        req.path.startsWith('/sales') ||
        req.path.startsWith('/targets')) {
      return next();
    }
    res.sendFile(path.join(UI_DIST_PATH, 'index.html'));
  });
}

app.listen(PORT, () => console.log(`Sales Trackers service listening on port ${PORT}`));
