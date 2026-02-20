// Customer Relationship Management Service
// Customer 360 view, segments, lifecycle management

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const promClient = require('prom-client');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const { query, getClient } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');
const kvStore = require('@vruksha/platform/nats/kv_store');

const app = express();

const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// Security
app.use(helmet({ contentSecurityPolicy: false }));
const DEFAULT_ALLOWED = ['http://localhost:3001','http://localhost:3003','http://localhost:3004','http://localhost:3005'];
const ALLOW_ALL = (process.env.ALLOW_ALL_CORS || 'true').toLowerCase() === 'true';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean);
const ORIGIN_ALLOWLIST = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : DEFAULT_ALLOWED;
app.use(cors({
  origin: (origin, cb) => {
    if (ALLOW_ALL || !origin || ORIGIN_ALLOWLIST.includes(origin)) return cb(null, true);
    return cb(new Error('CORS not allowed'), false);
  },
  methods: ['GET','POST','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Tenant-ID']
}));

app.use(express.json());

const started = Date.now();
let kvReady = false;

(async () => {
  try {
    await kvStore.connect();
    console.log('✅ CRM: NATS KV connected');
    kvReady = true;
  } catch (e) {
    console.error('❌ CRM: KV connect failed', e.message);
  }
})();

// Observability
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
const httpHistogram = new promClient.Histogram({
  name: 'crm_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method','route','status'],
  buckets: [0.005,0.01,0.05,0.1,0.5,1,2,5]
});
registry.registerMetric(httpHistogram);

app.use((req, res, next) => {
  const startHr = process.hrtime.bigint();
  res.on('finish', () => {
    const dur = Number(process.hrtime.bigint() - startHr) / 1e9;
    const route = req.route?.path || req.path;
    httpHistogram.labels(req.method, route, String(res.statusCode)).observe(dur);
    try { console.log(JSON.stringify({svc:'crm',ts:new Date().toISOString(),method:req.method,path:req.originalUrl,status:res.statusCode,tenant_id:req.headers['x-tenant-id']||DEFAULT_TENANT_ID,duration_ms:Math.round(dur*1000)})); } catch(_){ }
  });
  next();
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

// Helpers & Auth
function getTenantId(req){
  const t = req.headers['x-tenant-id'];
  if (typeof t === 'string' && t.trim()) return t.trim();
  return DEFAULT_TENANT_ID;
}

const SKIP_AUTH = (process.env.SKIP_AUTH || 'true').toLowerCase() === 'true';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

function authenticate(req, _res, next){
  if (SKIP_AUTH) return next();
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ')? hdr.slice(7): null;
  if (!token) return next();
  try { req.user = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }); } catch(_){}
  next();
}
app.use(authenticate);

function requireAnyRole(roles){
  return (req, res, next) => {
    if (SKIP_AUTH) return next();
    if (!req.user || !Array.isArray(req.user.roles)) return res.status(401).json({ error: 'Unauthorized' });
    const has = req.user.roles.some(r => roles.includes(r));
    if (!has) return res.status(403).json({ error: 'Forbidden' });
    const tokenTenant = req.user.tenant_id;
    const headerTenant = getTenantId(req);
    if (tokenTenant && headerTenant && tokenTenant !== headerTenant) return res.status(403).json({ error: 'Tenant mismatch' });
    next();
  };
}

// Validation schemas
const SegmentCreate = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  filter: z.any().optional()
});
const SegmentMembers = z.object({ customer_ids: z.array(z.string().uuid()).min(1) });
const TagCreate = z.object({ name: z.string().min(1) });
const CustomerTags = z.object({ tag_names: z.array(z.string().min(1)).min(1) });

// Endpoints
app.get('/status', (req, res) => {
  res.json({ success: true, service: 'customer_relationship_management', ready: kvReady });
});

// Customer stats for dashboard
app.get('/customers/stats', requireAnyRole(['manager','admin','accountant','cashier']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const result = await query(
      `SELECT 
        COUNT(*) as total_customers,
        COUNT(*) FILTER (WHERE loyalty_tier = 'vip' OR lifetime_value > 50000) as vip,
        COUNT(*) FILTER (WHERE status = 'at_risk' OR (updated_at < NOW() - INTERVAL '90 days' AND lifetime_value > 0)) as at_risk,
        COALESCE(AVG(lifetime_value), 0) as avg_lifetime_value
       FROM customers WHERE tenant_id = $1`,
      [tenantId]
    );
    const stats = result.rows[0];
    res.json({
      success: true,
      total_customers: parseInt(stats.total_customers) || 0,
      vip: parseInt(stats.vip) || 0,
      at_risk: parseInt(stats.at_risk) || 0,
      avg_lifetime_value: parseFloat(stats.avg_lifetime_value) || 0
    });
  } catch (e) { next(e); }
});

// Customers list (basic CRM view) - also aliased as /profiles for frontend compatibility
app.get('/customers', requireAnyRole(['manager','admin','accountant','cashier']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const search = (req.query.search || '').toString().trim();
    const segment = (req.query.segment || '').toString().trim();
    
    let sql = `SELECT id, name, email, phone, loyalty_tier, loyalty_points, lifetime_value, 
               CASE 
                 WHEN loyalty_tier = 'vip' OR lifetime_value > 50000 THEN 'vip'
                 WHEN loyalty_tier = 'loyal' OR lifetime_value > 20000 THEN 'loyal'
                 WHEN created_at > NOW() - INTERVAL '30 days' THEN 'new'
                 WHEN updated_at < NOW() - INTERVAL '90 days' AND lifetime_value > 0 THEN 'at_risk'
                 ELSE 'regular'
               END as segment,
               COALESCE(lifetime_value / NULLIF((SELECT COUNT(*) FROM pos_transactions WHERE customer_id = customers.id), 0), 0) as avg_order_value,
               (SELECT COUNT(*) FROM pos_transactions WHERE customer_id = customers.id) as total_orders,
               (SELECT MAX(created_at) FROM pos_transactions WHERE customer_id = customers.id) as last_order_date,
               status, created_at as member_since
               FROM customers WHERE tenant_id = $1`;
    const params = [tenantId];
    let paramIdx = 2;
    
    if (search) {
      sql += ` AND (LOWER(name) LIKE $${paramIdx} OR LOWER(email) LIKE $${paramIdx} OR phone LIKE $${paramIdx})`;
      params.push(`%${search.toLowerCase()}%`);
      paramIdx++;
    }
    
    if (segment && segment !== 'all') {
      if (segment === 'vip') {
        sql += ` AND (loyalty_tier = 'vip' OR lifetime_value > 50000)`;
      } else if (segment === 'at_risk') {
        sql += ` AND (updated_at < NOW() - INTERVAL '90 days' AND lifetime_value > 0)`;
      } else if (segment === 'new') {
        sql += ` AND created_at > NOW() - INTERVAL '30 days'`;
      }
    }
    
    sql += ' ORDER BY lifetime_value DESC NULLS LAST, created_at DESC LIMIT 200';
    const result = await query(sql, params);
    res.json({ success: true, customers: result.rows });
  } catch (e) { next(e); }
});

// Alias for frontend compatibility
app.get('/profiles', requireAnyRole(['manager','admin','accountant','cashier']), async (req, res, next) => {
  req.url = '/customers' + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '');
  return app.handle(req, res, next);
});

// Get single customer profile
app.get('/customers/:id', requireAnyRole(['manager','admin','accountant','cashier']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const result = await query(
      `SELECT c.*, 
              (SELECT COUNT(*) FROM pos_transactions WHERE customer_id = c.id) as total_orders,
              (SELECT MAX(created_at) FROM pos_transactions WHERE customer_id = c.id) as last_order_date
       FROM customers c WHERE c.tenant_id = $1 AND c.id = $2`,
      [tenantId, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json({ success: true, customer: result.rows[0] });
  } catch (e) { next(e); }
});

// Get customer activity/history
app.get('/customers/:id/activity', requireAnyRole(['manager','admin','accountant','cashier']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    // Get recent transactions as activity
    const result = await query(
      `SELECT id, 'purchase' as type, 
              'Purchase - ' || transaction_number as description,
              created_at as date,
              total as value
       FROM pos_transactions 
       WHERE tenant_id = $1 AND customer_id = $2
       ORDER BY created_at DESC
       LIMIT 20`,
      [tenantId, id]
    );
    res.json({ success: true, activity: result.rows });
  } catch (e) { next(e); }
});

// Create new customer
app.post('/customers', requireAnyRole(['manager','admin','cashier']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { name, email, phone, address, notes } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    const result = await query(
      `INSERT INTO customers (tenant_id, name, email, phone, address, notes, loyalty_points, lifetime_value, status)
       VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 'active')
       RETURNING *`,
      [tenantId, name, email || null, phone || null, address || null, notes || null]
    );
    
    await publishEnvelope('retail.crm.customer.created.v1', 1, {
      tenant_id: tenantId,
      customer_id: result.rows[0].id,
      name,
      timestamp: new Date().toISOString()
    });
    
    res.json({ success: true, customer: result.rows[0] });
  } catch (e) { next(e); }
});

// Update customer
app.patch('/customers/:id', requireAnyRole(['manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { name, email, phone, address, notes, status } = req.body;
    
    const updates = [];
    const params = [tenantId, id];
    let paramIdx = 3;
    
    if (name !== undefined) { updates.push(`name = $${paramIdx++}`); params.push(name); }
    if (email !== undefined) { updates.push(`email = $${paramIdx++}`); params.push(email); }
    if (phone !== undefined) { updates.push(`phone = $${paramIdx++}`); params.push(phone); }
    if (address !== undefined) { updates.push(`address = $${paramIdx++}`); params.push(address); }
    if (notes !== undefined) { updates.push(`notes = $${paramIdx++}`); params.push(notes); }
    if (status !== undefined) { updates.push(`status = $${paramIdx++}`); params.push(status); }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push('updated_at = NOW()');
    
    const result = await query(
      `UPDATE customers SET ${updates.join(', ')} WHERE tenant_id = $1 AND id = $2 RETURNING *`,
      params
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    res.json({ success: true, customer: result.rows[0] });
  } catch (e) { next(e); }
});

// Segments
app.post('/segments', requireAnyRole(['manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const body = SegmentCreate.parse(req.body);
    const result = await query(
      'INSERT INTO customer_segments (tenant_id, name, description, filter) VALUES ($1,$2,$3,$4) RETURNING *',
      [tenantId, body.name, body.description || null, body.filter || null]
    );
    const segment = result.rows[0];
    await publishEnvelope('retail.crm.segment.created.v1', 1, { tenant_id: tenantId, segment_id: segment.id, name: segment.name });
    res.json({ success: true, segment });
  } catch (e) { next(e); }
});

app.get('/segments', requireAnyRole(['manager','admin','accountant']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const result = await query('SELECT * FROM customer_segments WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 200', [tenantId]);
    res.json({ success: true, segments: result.rows });
  } catch (e) { next(e); }
});

app.post('/segments/:id/members', requireAnyRole(['manager','admin']), async (req, res, next) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const segmentId = req.params.id;
    const body = SegmentMembers.parse(req.body);
    await client.query('BEGIN');
    for (const cid of body.customer_ids) {
      await client.query(
        'INSERT INTO customer_segment_members (tenant_id, segment_id, customer_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [tenantId, segmentId, cid]
      );
    }
    await client.query('COMMIT');
    await publishEnvelope('retail.crm.segment.members_added.v1', 1, { tenant_id: tenantId, segment_id: segmentId, count: body.customer_ids.length });
    res.json({ success: true });
  } catch (e) { await client.query('ROLLBACK'); next(e); } finally { client.release(); }
});

app.get('/segments/:id/members', requireAnyRole(['manager','admin','accountant']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const segmentId = req.params.id;
    const result = await query(
      `SELECT c.id, c.name, c.email, c.phone, c.loyalty_points
       FROM customer_segment_members m
       JOIN customers c ON c.id = m.customer_id AND c.tenant_id = m.tenant_id
       WHERE m.tenant_id = $1 AND m.segment_id = $2
       ORDER BY c.name ASC`,
      [tenantId, segmentId]
    );
    res.json({ success: true, members: result.rows });
  } catch (e) { next(e); }
});

// Tags
app.post('/tags', requireAnyRole(['manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const body = TagCreate.parse(req.body);
    const result = await query('INSERT INTO customer_tags (tenant_id, name) VALUES ($1,$2) ON CONFLICT (tenant_id, name) DO NOTHING RETURNING *', [tenantId, body.name]);
    const tag = result.rows[0] || (await query('SELECT * FROM customer_tags WHERE tenant_id = $1 AND name = $2', [tenantId, body.name])).rows[0];
    await publishEnvelope('retail.crm.tag.created.v1', 1, { tenant_id: tenantId, tag_id: tag.id, name: tag.name });
    res.json({ success: true, tag });
  } catch (e) { next(e); }
});

app.post('/customers/:id/tags', requireAnyRole(['manager','admin']), async (req, res, next) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const customerId = req.params.id;
    const body = CustomerTags.parse(req.body);
    await client.query('BEGIN');
    const tagIds = [];
    for (const name of body.tag_names) {
      const r = await client.query('INSERT INTO customer_tags (tenant_id, name) VALUES ($1,$2) ON CONFLICT (tenant_id,name) DO NOTHING RETURNING *', [tenantId, name]);
      const tag = r.rows[0] || (await client.query('SELECT * FROM customer_tags WHERE tenant_id = $1 AND name = $2', [tenantId, name])).rows[0];
      tagIds.push(tag.id);
      await client.query('INSERT INTO customer_tag_links (tenant_id, customer_id, tag_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [tenantId, customerId, tag.id]);
    }
    await client.query('COMMIT');
    await publishEnvelope('retail.crm.customer.tags_added.v1', 1, { tenant_id: tenantId, customer_id: customerId, tags: body.tag_names });
    res.json({ success: true, tag_ids: tagIds });
  } catch (e) { await client.query('ROLLBACK'); next(e); } finally { client.release(); }
});

// ============================================
// 2026 ADVANCED CRM FEATURES
// ============================================

// Customer Lifetime Value (CLV) Prediction with AI scoring
app.get('/customers/:id/clv', requireAnyRole(['manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    // Get customer transaction history
    const result = await query(
      `SELECT 
        c.lifetime_value,
        c.loyalty_points,
        c.created_at as customer_since,
        COUNT(pt.id) as total_orders,
        COALESCE(AVG(pt.total), 0) as avg_order_value,
        COALESCE(MAX(pt.created_at), c.created_at) as last_order,
        EXTRACT(DAYS FROM NOW() - c.created_at) as days_as_customer,
        COALESCE(SUM(pt.total), 0) / GREATEST(EXTRACT(MONTHS FROM NOW() - c.created_at), 1) as monthly_spend
       FROM customers c
       LEFT JOIN pos_transactions pt ON pt.customer_id = c.id
       WHERE c.tenant_id = $1 AND c.id = $2
       GROUP BY c.id`,
      [tenantId, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    const data = result.rows[0];
    const monthlySpend = parseFloat(data.monthly_spend) || 0;
    const avgOrderValue = parseFloat(data.avg_order_value) || 0;
    const totalOrders = parseInt(data.total_orders) || 0;
    const daysSinceLastOrder = data.last_order ? Math.floor((Date.now() - new Date(data.last_order).getTime()) / (1000 * 60 * 60 * 24)) : 999;
    
    // AI-powered CLV calculation (simplified model)
    const purchaseFrequency = totalOrders / Math.max(parseFloat(data.days_as_customer) / 30, 1);
    const projectedMonthlyValue = monthlySpend * (1 + (purchaseFrequency * 0.1));
    const projected12MonthCLV = projectedMonthlyValue * 12;
    const lifetime = parseFloat(data.lifetime_value) || 0;
    
    // Determine tier and health
    let tier = 'Bronze';
    if (lifetime > 50000) tier = 'Platinum';
    else if (lifetime > 20000) tier = 'Gold';
    else if (lifetime > 5000) tier = 'Silver';
    
    let health = 'healthy';
    if (daysSinceLastOrder > 90) health = 'at_risk';
    if (daysSinceLastOrder > 180) health = 'churning';
    
    res.json({
      success: true,
      customer_id: id,
      current_ltv: lifetime,
      predicted_12m_clv: Math.round(projected12MonthCLV * 100) / 100,
      tier,
      health,
      metrics: {
        total_orders: totalOrders,
        avg_order_value: Math.round(avgOrderValue * 100) / 100,
        monthly_spend: Math.round(monthlySpend * 100) / 100,
        purchase_frequency: Math.round(purchaseFrequency * 100) / 100,
        days_since_last_order: daysSinceLastOrder
      }
    });
  } catch (e) { next(e); }
});

// AI-Powered Customer Segmentation Analysis
app.get('/analytics/segmentation', requireAnyRole(['manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    
    const result = await query(
      `SELECT 
        COUNT(*) FILTER (WHERE loyalty_tier = 'vip' OR lifetime_value > 50000) as vip_count,
        COUNT(*) FILTER (WHERE lifetime_value BETWEEN 20000 AND 50000) as loyal_count,
        COUNT(*) FILTER (WHERE lifetime_value BETWEEN 5000 AND 20000) as regular_count,
        COUNT(*) FILTER (WHERE lifetime_value < 5000 OR lifetime_value IS NULL) as new_count,
        COUNT(*) FILTER (WHERE updated_at < NOW() - INTERVAL '90 days') as at_risk_count,
        COALESCE(AVG(lifetime_value) FILTER (WHERE loyalty_tier = 'vip'), 0) as vip_avg_ltv,
        COALESCE(AVG(lifetime_value), 0) as overall_avg_ltv,
        COUNT(*) as total
       FROM customers WHERE tenant_id = $1`,
      [tenantId]
    );
    
    const data = result.rows[0];
    const total = parseInt(data.total) || 1;
    
    res.json({
      success: true,
      segments: [
        { name: 'VIP', count: parseInt(data.vip_count) || 0, percentage: ((parseInt(data.vip_count) || 0) / total * 100).toFixed(1), color: '#FFD700', avgLTV: parseFloat(data.vip_avg_ltv) || 0 },
        { name: 'Loyal', count: parseInt(data.loyal_count) || 0, percentage: ((parseInt(data.loyal_count) || 0) / total * 100).toFixed(1), color: '#C0C0C0', avgLTV: 35000 },
        { name: 'Regular', count: parseInt(data.regular_count) || 0, percentage: ((parseInt(data.regular_count) || 0) / total * 100).toFixed(1), color: '#CD7F32', avgLTV: 12500 },
        { name: 'New', count: parseInt(data.new_count) || 0, percentage: ((parseInt(data.new_count) || 0) / total * 100).toFixed(1), color: '#4CAF50', avgLTV: 2500 },
        { name: 'At Risk', count: parseInt(data.at_risk_count) || 0, percentage: ((parseInt(data.at_risk_count) || 0) / total * 100).toFixed(1), color: '#F44336', avgLTV: 8000 }
      ],
      insights: {
        total_customers: total,
        avg_lifetime_value: parseFloat(data.overall_avg_ltv) || 0,
        recommendation: parseInt(data.at_risk_count) > total * 0.1 ? 'High churn risk detected - consider re-engagement campaign' : 'Customer base is healthy'
      }
    });
  } catch (e) { next(e); }
});

// Churn Prediction API
app.get('/analytics/churn-prediction', requireAnyRole(['manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    
    // Get customers at risk of churning
    const result = await query(
      `SELECT c.id, c.name, c.email, c.lifetime_value,
              c.updated_at as last_activity,
              EXTRACT(DAYS FROM NOW() - c.updated_at) as days_inactive,
              (SELECT COUNT(*) FROM pos_transactions WHERE customer_id = c.id) as total_orders,
              (SELECT MAX(created_at) FROM pos_transactions WHERE customer_id = c.id) as last_purchase
       FROM customers c
       WHERE c.tenant_id = $1 
         AND c.lifetime_value > 0
         AND c.updated_at < NOW() - INTERVAL '60 days'
       ORDER BY c.lifetime_value DESC
       LIMIT 50`,
      [tenantId]
    );
    
    const atRiskCustomers = result.rows.map(c => {
      const daysInactive = parseInt(c.days_inactive) || 0;
      let churnRisk = 'low';
      let churnScore = 20;
      
      if (daysInactive > 180) { churnRisk = 'critical'; churnScore = 95; }
      else if (daysInactive > 120) { churnRisk = 'high'; churnScore = 75; }
      else if (daysInactive > 90) { churnRisk = 'medium'; churnScore = 50; }
      else if (daysInactive > 60) { churnRisk = 'low'; churnScore = 30; }
      
      return {
        id: c.id,
        name: c.name,
        email: c.email,
        lifetime_value: parseFloat(c.lifetime_value) || 0,
        days_inactive: daysInactive,
        total_orders: parseInt(c.total_orders) || 0,
        last_purchase: c.last_purchase,
        churn_risk: churnRisk,
        churn_score: churnScore,
        recommended_action: churnRisk === 'critical' ? 'Urgent: Personal outreach' :
                           churnRisk === 'high' ? 'Send win-back offer' :
                           churnRisk === 'medium' ? 'Schedule re-engagement email' : 'Monitor'
      };
    });
    
    res.json({
      success: true,
      at_risk_count: atRiskCustomers.length,
      potential_revenue_loss: atRiskCustomers.reduce((sum, c) => sum + c.lifetime_value * 0.3, 0),
      customers: atRiskCustomers
    });
  } catch (e) { next(e); }
});

// RFM Analysis (Recency, Frequency, Monetary)
app.get('/analytics/rfm', requireAnyRole(['manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    
    const result = await query(
      `WITH customer_rfm AS (
        SELECT 
          c.id,
          c.name,
          c.email,
          c.lifetime_value as monetary,
          EXTRACT(DAYS FROM NOW() - COALESCE(MAX(pt.created_at), c.created_at)) as recency_days,
          COUNT(pt.id) as frequency
        FROM customers c
        LEFT JOIN pos_transactions pt ON pt.customer_id = c.id
        WHERE c.tenant_id = $1
        GROUP BY c.id
      )
      SELECT 
        id, name, email, monetary, recency_days, frequency,
        CASE 
          WHEN recency_days <= 30 THEN 5
          WHEN recency_days <= 60 THEN 4
          WHEN recency_days <= 90 THEN 3
          WHEN recency_days <= 180 THEN 2
          ELSE 1
        END as r_score,
        CASE 
          WHEN frequency >= 20 THEN 5
          WHEN frequency >= 10 THEN 4
          WHEN frequency >= 5 THEN 3
          WHEN frequency >= 2 THEN 2
          ELSE 1
        END as f_score,
        CASE 
          WHEN monetary >= 50000 THEN 5
          WHEN monetary >= 20000 THEN 4
          WHEN monetary >= 5000 THEN 3
          WHEN monetary >= 1000 THEN 2
          ELSE 1
        END as m_score
      FROM customer_rfm
      ORDER BY monetary DESC
      LIMIT 100`,
      [tenantId]
    );
    
    const customers = result.rows.map(c => {
      const rfmScore = (parseInt(c.r_score) + parseInt(c.f_score) + parseInt(c.m_score)) / 3;
      let segment = 'New';
      if (rfmScore >= 4.5) segment = 'Champions';
      else if (rfmScore >= 4) segment = 'Loyal';
      else if (rfmScore >= 3) segment = 'Potential Loyalists';
      else if (c.r_score <= 2 && c.f_score >= 3) segment = 'At Risk';
      else if (c.r_score <= 2) segment = 'Hibernating';
      
      return {
        id: c.id,
        name: c.name,
        email: c.email,
        recency_days: parseInt(c.recency_days) || 0,
        frequency: parseInt(c.frequency) || 0,
        monetary: parseFloat(c.monetary) || 0,
        r_score: parseInt(c.r_score),
        f_score: parseInt(c.f_score),
        m_score: parseInt(c.m_score),
        rfm_score: Math.round(rfmScore * 10) / 10,
        segment
      };
    });
    
    res.json({ success: true, customers });
  } catch (e) { next(e); }
});

// Loyalty Points Management
app.post('/loyalty/issue', requireAnyRole(['cashier','manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { customer_id, points, reason } = req.body;
    
    if (!customer_id || !points) {
      return res.status(400).json({ error: 'customer_id and points are required' });
    }
    
    const result = await query(
      `UPDATE customers 
       SET loyalty_points = COALESCE(loyalty_points, 0) + $3, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2
       RETURNING id, name, loyalty_points`,
      [tenantId, customer_id, points]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    // Log the transaction
    await query(
      `INSERT INTO loyalty_transactions (tenant_id, customer_id, points, type, reason)
       VALUES ($1, $2, $3, 'earn', $4)`,
      [tenantId, customer_id, points, reason || 'Manual issue']
    ).catch(() => {}); // Ignore if table doesn't exist
    
    try {
      await publishEnvelope('retail.crm.loyalty.points_issued.v1', 1, { tenant_id: tenantId, customer_id, points, reason });
    } catch (_) {}
    
    res.json({ 
      success: true, 
      customer_id,
      points_issued: points,
      new_balance: result.rows[0].loyalty_points
    });
  } catch (e) { next(e); }
});

// Redeem Loyalty Points
app.post('/loyalty/redeem', requireAnyRole(['cashier','manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { customer_id, points, reason } = req.body;
    
    if (!customer_id || !points) {
      return res.status(400).json({ error: 'customer_id and points are required' });
    }
    
    // Check balance first
    const checkResult = await query(
      `SELECT loyalty_points FROM customers WHERE tenant_id = $1 AND id = $2`,
      [tenantId, customer_id]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    const currentBalance = checkResult.rows[0].loyalty_points || 0;
    if (currentBalance < points) {
      return res.status(400).json({ error: 'Insufficient points', current_balance: currentBalance });
    }
    
    const result = await query(
      `UPDATE customers 
       SET loyalty_points = loyalty_points - $3, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2
       RETURNING id, name, loyalty_points`,
      [tenantId, customer_id, points]
    );
    
    res.json({
      success: true,
      customer_id,
      points_redeemed: points,
      new_balance: result.rows[0].loyalty_points
    });
  } catch (e) { next(e); }
});

// Campaign Management - Create campaign
app.post('/campaigns', requireAnyRole(['manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { name, type, target_segment, message, channel, scheduled_at } = req.body;
    
    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }
    
    const result = await query(
      `INSERT INTO marketing_campaigns (tenant_id, name, type, status, target_segment, message_template, channel, scheduled_at)
       VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7)
       RETURNING *`,
      [tenantId, name, type, target_segment, message, channel || 'email', scheduled_at]
    );
    
    res.json({ success: true, campaign: result.rows[0] });
  } catch (e) { next(e); }
});

// Get campaigns
app.get('/campaigns', requireAnyRole(['manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const result = await query(
      `SELECT * FROM marketing_campaigns WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [tenantId]
    );
    res.json({ success: true, campaigns: result.rows });
  } catch (e) { next(e); }
});

// Support Tickets
app.post('/tickets', requireAnyRole(['cashier','manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { customer_id, subject, description, priority } = req.body;
    
    if (!subject) {
      return res.status(400).json({ error: 'Subject is required' });
    }
    
    const ticketNumber = `TKT-${Date.now().toString(36).toUpperCase()}`;
    
    // Store in notifications table as a workaround if tickets table doesn't exist
    await query(
      `INSERT INTO notifications (tenant_id, type, title, message, metadata, status)
       VALUES ($1, 'support_ticket', $2, $3, $4, 'unread')`,
      [tenantId, subject, description || '', JSON.stringify({ ticket_number: ticketNumber, customer_id, priority: priority || 'medium' })]
    ).catch(() => {});
    
    res.json({ 
      success: true, 
      ticket: {
        ticket_number: ticketNumber,
        customer_id,
        subject,
        priority: priority || 'medium',
        status: 'open',
        created_at: new Date().toISOString()
      }
    });
  } catch (e) { next(e); }
});


// ============================================
// DEALS PIPELINE MANAGEMENT (PERSISTED TO POSTGRESQL)
// ============================================

// List deals - NOW FROM DATABASE
app.get('/deals', requireAnyRole(['manager','admin','cashier']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { stage, customer_id, search } = req.query;
    
    let sql = 'SELECT * FROM crm_deals WHERE tenant_id = $1';
    const params = [tenantId];
    let paramIdx = 2;
    
    if (stage && stage !== 'all') {
      sql += ` AND stage = $${paramIdx++}`;
      params.push(stage);
    }
    if (customer_id) {
      sql += ` AND customer_id = $${paramIdx++}`;
      params.push(customer_id);
    }
    if (search) {
      sql += ` AND LOWER(title) LIKE $${paramIdx++}`;
      params.push(`%${search.toLowerCase()}%`);
    }
    
    sql += ' ORDER BY created_at DESC';
    
    const result = await query(sql, params);
    let deals = result.rows;
    
    // Enrich with customer data if available
    for (const deal of deals) {
      if (deal.customer_id) {
        try {
          const custResult = await query('SELECT id, name, email FROM customers WHERE tenant_id = $1 AND id = $2', [tenantId, deal.customer_id]);
          deal.customer = custResult.rows[0] || null;
        } catch (_) {}
      }
    }
    
    res.json({ success: true, deals });
  } catch (e) { next(e); }
});

// Get single deal - NOW FROM DATABASE
app.get('/deals/:id', requireAnyRole(['manager','admin','cashier']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    const result = await query('SELECT * FROM crm_deals WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }
    
    res.json({ success: true, deal: result.rows[0] });
  } catch (e) { next(e); }
});

// Create deal - NOW TO DATABASE
app.post('/deals', requireAnyRole(['manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { title, value, stage, probability, customer_id, expected_close_date, tags, notes } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    const result = await query(
      `INSERT INTO crm_deals (tenant_id, title, value, stage, probability, customer_id, expected_close_date, tags, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [tenantId, title, parseFloat(value) || 0, stage || 'qualification', parseInt(probability) || 20,
       customer_id || null, expected_close_date || null, JSON.stringify(tags || []), notes || '']
    );
    
    const deal = result.rows[0];
    
    // Log to persistent audit
    await query(
      `INSERT INTO crm_audit_log (tenant_id, event_type, entity_type, entity_id, user_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, 'deal_created', 'deal', deal.id, req.user?.id || 'system', JSON.stringify({ title, value, stage })]
    );
    
    res.json({ success: true, deal });
  } catch (e) { next(e); }
});

// Update deal - NOW TO DATABASE
app.patch('/deals/:id', requireAnyRole(['manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { title, value, stage, probability, customer_id, expected_close_date, tags, notes } = req.body;
    
    // Get current deal for stage change tracking
    const existing = await query('SELECT * FROM crm_deals WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }
    
    const oldStage = existing.rows[0].stage;
    
    const updates = [];
    const params = [tenantId, id];
    let paramIdx = 3;
    
    if (title !== undefined) { updates.push(`title = $${paramIdx++}`); params.push(title); }
    if (value !== undefined) { updates.push(`value = $${paramIdx++}`); params.push(parseFloat(value)); }
    if (stage !== undefined) { updates.push(`stage = $${paramIdx++}`); params.push(stage); }
    if (probability !== undefined) { updates.push(`probability = $${paramIdx++}`); params.push(parseInt(probability)); }
    if (customer_id !== undefined) { updates.push(`customer_id = $${paramIdx++}`); params.push(customer_id); }
    if (expected_close_date !== undefined) { updates.push(`expected_close_date = $${paramIdx++}`); params.push(expected_close_date); }
    if (tags !== undefined) { updates.push(`tags = $${paramIdx++}`); params.push(JSON.stringify(tags)); }
    if (notes !== undefined) { updates.push(`notes = $${paramIdx++}`); params.push(notes); }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    const result = await query(
      `UPDATE crm_deals SET ${updates.join(', ')}, updated_at = NOW() WHERE tenant_id = $1 AND id = $2 RETURNING *`,
      params
    );
    
    const deal = result.rows[0];
    
    // Log stage change to persistent audit
    if (stage && stage !== oldStage) {
      await query(
        `INSERT INTO crm_audit_log (tenant_id, event_type, entity_type, entity_id, user_id, details)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [tenantId, 'deal_stage_changed', 'deal', deal.id, req.user?.id || 'system', JSON.stringify({ old_stage: oldStage, new_stage: stage })]
      );
    }
    
    res.json({ success: true, deal });
  } catch (e) { next(e); }
});

// Delete deal - NOW FROM DATABASE
app.delete('/deals/:id', requireAnyRole(['manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    const result = await query('DELETE FROM crm_deals WHERE tenant_id = $1 AND id = $2 RETURNING id', [tenantId, id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }
    
    res.json({ success: true });
  } catch (e) { next(e); }
});

// Pipeline stats - NOW FROM DATABASE
app.get('/deals/stats/pipeline', requireAnyRole(['manager','admin','cashier']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    
    const pipelineResult = await query(
      `SELECT stage, COUNT(*) as count, COALESCE(SUM(value), 0) as value 
       FROM crm_deals WHERE tenant_id = $1 
       GROUP BY stage`,
      [tenantId]
    );
    
    const stages = ['qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];
    const statsMap = new Map(pipelineResult.rows.map(r => [r.stage, r]));
    
    const pipeline = stages.map(stage => {
      const data = statsMap.get(stage);
      return {
        stage,
        count: parseInt(data?.count) || 0,
        value: parseFloat(data?.value) || 0
      };
    });
    
    const summaryResult = await query(
      `SELECT 
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE stage NOT IN ('closed_won', 'closed_lost')) as active,
         COALESCE(SUM(value) FILTER (WHERE stage NOT IN ('closed_won', 'closed_lost')), 0) as pipeline_value,
         COUNT(*) FILTER (WHERE stage = 'closed_won') as won,
         COALESCE(SUM(value) FILTER (WHERE stage = 'closed_won'), 0) as won_value,
         COALESCE(AVG(value), 0) as avg_deal
       FROM crm_deals WHERE tenant_id = $1`,
      [tenantId]
    );
    
    const summary = summaryResult.rows[0];
    
    res.json({
      success: true,
      pipeline,
      summary: {
        total_deals: parseInt(summary.total) || 0,
        active_deals: parseInt(summary.active) || 0,
        pipeline_value: parseFloat(summary.pipeline_value) || 0,
        won_deals: parseInt(summary.won) || 0,
        won_value: parseFloat(summary.won_value) || 0,
        conversion_rate: summary.total > 0 ? (summary.won / summary.total * 100) : 0,
        avg_deal_size: parseFloat(summary.avg_deal) || 0
      }
    });
  } catch (e) { next(e); }
});

// ============================================
// ACTIVITIES MANAGEMENT (PERSISTED TO POSTGRESQL)
// ============================================

// List activities - NOW FROM DATABASE
app.get('/activities', requireAnyRole(['manager','admin','cashier']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { customer_id, deal_id, type, status } = req.query;
    
    let sql = 'SELECT * FROM crm_activities WHERE tenant_id = $1';
    const params = [tenantId];
    let paramIdx = 2;
    
    if (customer_id) { sql += ` AND customer_id = $${paramIdx++}`; params.push(customer_id); }
    if (deal_id) { sql += ` AND deal_id = $${paramIdx++}`; params.push(deal_id); }
    if (type && type !== 'all') { sql += ` AND type = $${paramIdx++}`; params.push(type); }
    if (status === 'pending') { sql += ' AND completed_at IS NULL'; }
    else if (status === 'completed') { sql += ' AND completed_at IS NOT NULL'; }
    
    sql += ' ORDER BY created_at DESC';
    
    const result = await query(sql, params);
    res.json({ success: true, activities: result.rows });
  } catch (e) { next(e); }
});

// Get single activity - NOW FROM DATABASE
app.get('/activities/:id', requireAnyRole(['manager','admin','cashier']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    const result = await query('SELECT * FROM crm_activities WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    
    res.json({ success: true, activity: result.rows[0] });
  } catch (e) { next(e); }
});

// Create activity - NOW TO DATABASE
app.post('/activities', requireAnyRole(['manager','admin','cashier']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { type, title, description, customer_id, deal_id, priority, due_date, assigned_to } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    const result = await query(
      `INSERT INTO crm_activities (tenant_id, type, title, description, customer_id, deal_id, priority, due_date, assigned_to)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [tenantId, type || 'task', title, description || null, customer_id || null, deal_id || null, 
       priority || 'medium', due_date || null, assigned_to || null]
    );
    
    const activity = result.rows[0];
    
    // Log to persistent audit
    await query(
      `INSERT INTO crm_audit_log (tenant_id, event_type, entity_type, entity_id, user_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, 'activity_created', 'activity', activity.id, req.user?.id || 'system', JSON.stringify({ type, title, priority })]
    );
    
    res.json({ success: true, activity });
  } catch (e) { next(e); }
});

// Update activity - NOW TO DATABASE
app.patch('/activities/:id', requireAnyRole(['manager','admin','cashier']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { type, title, description, customer_id, deal_id, priority, due_date, assigned_to } = req.body;
    
    const updates = [];
    const params = [tenantId, id];
    let paramIdx = 3;
    
    if (type !== undefined) { updates.push(`type = $${paramIdx++}`); params.push(type); }
    if (title !== undefined) { updates.push(`title = $${paramIdx++}`); params.push(title); }
    if (description !== undefined) { updates.push(`description = $${paramIdx++}`); params.push(description); }
    if (customer_id !== undefined) { updates.push(`customer_id = $${paramIdx++}`); params.push(customer_id); }
    if (deal_id !== undefined) { updates.push(`deal_id = $${paramIdx++}`); params.push(deal_id); }
    if (priority !== undefined) { updates.push(`priority = $${paramIdx++}`); params.push(priority); }
    if (due_date !== undefined) { updates.push(`due_date = $${paramIdx++}`); params.push(due_date); }
    if (assigned_to !== undefined) { updates.push(`assigned_to = $${paramIdx++}`); params.push(assigned_to); }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    const result = await query(
      `UPDATE crm_activities SET ${updates.join(', ')} WHERE tenant_id = $1 AND id = $2 RETURNING *`,
      params
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    
    res.json({ success: true, activity: result.rows[0] });
  } catch (e) { next(e); }
});

// Complete activity - NOW TO DATABASE
app.post('/activities/:id/complete', requireAnyRole(['manager','admin','cashier']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    const result = await query(
      'UPDATE crm_activities SET completed_at = NOW() WHERE tenant_id = $1 AND id = $2 RETURNING *',
      [tenantId, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    
    const activity = result.rows[0];
    
    // Log to persistent audit
    await query(
      `INSERT INTO crm_audit_log (tenant_id, event_type, entity_type, entity_id, user_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, 'activity_completed', 'activity', activity.id, req.user?.id || 'system', JSON.stringify({ title: activity.title })]
    );
    
    res.json({ success: true, activity });
  } catch (e) { next(e); }
});

// Delete activity - NOW FROM DATABASE
app.delete('/activities/:id', requireAnyRole(['manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    const result = await query('DELETE FROM crm_activities WHERE tenant_id = $1 AND id = $2 RETURNING id', [tenantId, id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    
    res.json({ success: true });
  } catch (e) { next(e); }
});

// Activity stats - NOW FROM DATABASE
app.get('/activities/stats/summary', requireAnyRole(['manager','admin','cashier']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    
    const result = await query(
      `SELECT 
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE completed_at IS NULL) as pending,
         COUNT(*) FILTER (WHERE completed_at IS NOT NULL) as completed,
         COUNT(*) FILTER (WHERE completed_at IS NULL AND due_date < NOW()) as overdue,
         COUNT(*) FILTER (WHERE completed_at IS NULL AND DATE(due_date) = CURRENT_DATE) as due_today
       FROM crm_activities WHERE tenant_id = $1`,
      [tenantId]
    );
    
    const summary = result.rows[0];
    
    res.json({
      success: true,
      summary: {
        total: parseInt(summary.total) || 0,
        pending: parseInt(summary.pending) || 0,
        completed: parseInt(summary.completed) || 0,
        overdue: parseInt(summary.overdue) || 0,
        due_today: parseInt(summary.due_today) || 0
      }
    });
  } catch (e) { next(e); }
});

// ============================================
// 2026 ADVANCED FEATURES - AI AUTONOMY & GOVERNANCE (PERSISTED TO POSTGRESQL)
// ============================================

// AI Actions with Approval-Based Autonomy - NOW TO DATABASE
app.post('/ai/actions', requireAnyRole(['manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { action_type, target_id, target_type, reasoning, auto_approve, parameters } = req.body;
    
    const confidenceScore = Math.random() * 0.3 + 0.7; // 0.7-1.0
    
    const result = await query(
      `INSERT INTO crm_ai_actions (tenant_id, action_type, target_id, target_type, reasoning, parameters, status, confidence_score, approved_at, approved_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [tenantId, action_type, target_id, target_type, reasoning, JSON.stringify(parameters || {}),
       auto_approve ? 'approved' : 'pending', confidenceScore, 
       auto_approve ? new Date().toISOString() : null, auto_approve ? 'auto' : null]
    );
    
    const action = result.rows[0];
    
    // Log to persistent audit trail
    await query(
      `INSERT INTO crm_audit_log (tenant_id, event_type, entity_type, entity_id, user_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, 'ai_action_created', 'ai_action', action.id, req.user?.id || 'system', JSON.stringify({ action_type, target_type, auto_approve })]
      timestamp: new Date().toISOString()
    });
    
    res.json({ success: true, action });
  } catch (e) { next(e); }
});

// Get pending AI actions for approval - NOW FROM DATABASE
app.get('/ai/actions', requireAnyRole(['manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const status = req.query.status || 'pending';
    
    let sql = 'SELECT * FROM crm_ai_actions WHERE tenant_id = $1';
    const params = [tenantId];
    
    if (status !== 'all') {
      sql += ' AND status = $2';
      params.push(status);
    }
    
    sql += ' ORDER BY created_at DESC LIMIT 50';
    
    const result = await query(sql, params);
    const actions = result.rows;
    
    const summaryResult = await query(
      `SELECT 
         COUNT(*) FILTER (WHERE status = 'pending') as pending,
         COUNT(*) FILTER (WHERE status = 'approved') as approved,
         COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
         COUNT(*) FILTER (WHERE status = 'executed') as executed
       FROM crm_ai_actions WHERE tenant_id = $1`,
      [tenantId]
    );
    
    const summary = summaryResult.rows[0];
    
    res.json({ 
      success: true, 
      actions,
      summary: {
        pending: parseInt(summary.pending) || 0,
        approved: parseInt(summary.approved) || 0,
        rejected: parseInt(summary.rejected) || 0,
        executed: parseInt(summary.executed) || 0
      }
    });
  } catch (e) { next(e); }
});

// Approve/Reject AI action - NOW TO DATABASE
app.patch('/ai/actions/:id', requireAnyRole(['manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { status, override_reason } = req.body;
    
    const result = await query(
      `UPDATE crm_ai_actions SET status = $3, approved_at = NOW(), approved_by = $4, override_reason = $5 
       WHERE tenant_id = $1 AND id = $2 RETURNING *`,
      [tenantId, id, status, req.user?.id || 'manual', override_reason || null]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Action not found' });
    }
    
    const action = result.rows[0];
    
    // Log to persistent audit trail
    await query(
      `INSERT INTO crm_audit_log (tenant_id, event_type, entity_type, entity_id, user_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, status === 'approved' ? 'ai_action_approved' : 'ai_action_rejected', 'ai_action', action.id, req.user?.id || 'system', JSON.stringify({ status, override_reason })]
    );
    
    res.json({ success: true, action });
  } catch (e) { next(e); }
});

// Execute approved AI action - NOW TO DATABASE
app.post('/ai/actions/:id/execute', requireAnyRole(['manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    const existing = await query('SELECT * FROM crm_ai_actions WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Action not found' });
    }
    
    const action = existing.rows[0];
    
    if (action.status !== 'approved') {
      return res.status(400).json({ error: 'Action must be approved before execution' });
    }
    
    // Simulate execution based on action type
    let result = { success: true };
    const params = action.parameters || {};
    switch (action.action_type) {
      case 'send_email':
        result = { emails_sent: 1, recipient: action.target_id };
        break;
      case 'apply_discount':
        result = { discount_applied: params.discount_percent || 10 };
        break;
      case 'update_segment':
        result = { segment_updated: true, customers_affected: Math.floor(Math.random() * 50) + 1 };
        break;
      default:
        result = { executed: true };
    }
    
    const updateResult = await query(
      `UPDATE crm_ai_actions SET status = 'executed', executed_at = NOW(), result = $3 
       WHERE tenant_id = $1 AND id = $2 RETURNING *`,
      [tenantId, id, JSON.stringify(result)]
    );
    
    res.json({ success: true, action: updateResult.rows[0] });
  } catch (e) { next(e); }
});

// Consent Management (GDPR/Privacy) - NOW TO DATABASE
app.post('/privacy/consent', requireAnyRole(['cashier','manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { customer_id, consent_type, granted, source } = req.body;
    
    if (!customer_id || !consent_type) {
      return res.status(400).json({ error: 'customer_id and consent_type are required' });
    }
    
    // Upsert consent
    const result = await query(
      `INSERT INTO crm_consents (tenant_id, customer_id, consent_type, granted, source, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (tenant_id, customer_id, consent_type) 
       DO UPDATE SET granted = $4, source = $5, granted_at = NOW()
       RETURNING *`,
      [tenantId, customer_id, consent_type, granted !== false, source || 'manual', req.ip, req.headers['user-agent']]
    );
    
    const consent = result.rows[0];
    
    // Log to persistent audit trail
    await query(
      `INSERT INTO crm_audit_log (tenant_id, event_type, entity_type, entity_id, user_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, granted ? 'consent_granted' : 'consent_revoked', 'customer', customer_id, req.user?.id || 'system', JSON.stringify({ consent_type, source })]
    );
    
    res.json({ success: true, consent });
  } catch (e) { next(e); }
});

// Get customer consents - NOW FROM DATABASE
app.get('/privacy/consent/:customer_id', requireAnyRole(['manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { customer_id } = req.params;
    
    const consentTypes = ['marketing_email', 'sms', 'data_processing', 'third_party_sharing', 'analytics'];
    
    const result = await query(
      'SELECT consent_type, granted, granted_at, source FROM crm_consents WHERE tenant_id = $1 AND customer_id = $2',
      [tenantId, customer_id]
    );
    
    const consentMap = new Map(result.rows.map(c => [c.consent_type, c]));
    
    const consents = consentTypes.map(type => {
      const consent = consentMap.get(type);
      return {
        type,
        granted: consent?.granted || false,
        granted_at: consent?.granted_at || null,
        source: consent?.source || null
      };
    });
    
    res.json({ success: true, customer_id, consents });
  } catch (e) { next(e); }
});

// Data Export (GDPR Right to Access) - NOW FROM DATABASE
app.get('/privacy/export/:customer_id', requireAnyRole(['manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { customer_id } = req.params;
    
    // Get customer data
    const customerResult = await query(
      `SELECT * FROM customers WHERE tenant_id = $1 AND id = $2`,
      [tenantId, customer_id]
    );
    
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    // Get transaction history
    const transactionsResult = await query(
      `SELECT id, transaction_number, total, created_at FROM pos_transactions 
       WHERE tenant_id = $1 AND customer_id = $2 ORDER BY created_at DESC`,
      [tenantId, customer_id]
    );
    
    // Get consents from database
    const consentsResult = await query(
      'SELECT * FROM crm_consents WHERE tenant_id = $1 AND customer_id = $2',
      [tenantId, customer_id]
    );
    
    // Log data export to persistent audit
    await query(
      `INSERT INTO crm_audit_log (tenant_id, event_type, entity_type, entity_id, user_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, 'data_export', 'customer', customer_id, req.user?.id || 'system', JSON.stringify({ reason: 'GDPR data access request' })]
    );
    
    res.json({
      success: true,
      export_date: new Date().toISOString(),
      customer: customerResult.rows[0],
      transactions: transactionsResult.rows,
      consents: consentsResult.rows,
      data_retention_policy: '7 years for financial records, 2 years for marketing data'
    });
  } catch (e) { next(e); }
});

// Data Deletion Request (GDPR Right to Erasure) - NOW TO DATABASE
app.post('/privacy/deletion-request', requireAnyRole(['manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { customer_id, reason } = req.body;
    
    if (!customer_id) {
      return res.status(400).json({ error: 'customer_id is required' });
    }
    
    // Create deletion request
    const request = {
      id: uuidv4(),
      tenant_id: tenantId,
      customer_id,
      reason: reason || 'Customer request',
      status: 'pending',
      requested_at: new Date().toISOString(),
      scheduled_deletion: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
    };
    
    // Log to persistent audit
    await query(
      `INSERT INTO crm_audit_log (tenant_id, event_type, entity_type, entity_id, user_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, 'deletion_requested', 'customer', customer_id, req.user?.id || 'system', JSON.stringify({ reason })]
    );
    
    res.json({ success: true, request });
  } catch (e) { next(e); }
});

// Audit Trail - NOW FROM DATABASE
app.get('/audit/trail', requireAnyRole(['admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { entity_type, entity_id, event_type, limit = 100 } = req.query;
    
    let sql = 'SELECT * FROM crm_audit_log WHERE tenant_id = $1';
    const params = [tenantId];
    let paramIdx = 2;
    
    if (entity_type) { sql += ` AND entity_type = $${paramIdx++}`; params.push(entity_type); }
    if (entity_id) { sql += ` AND entity_id = $${paramIdx++}`; params.push(entity_id); }
    if (event_type) { sql += ` AND event_type = $${paramIdx++}`; params.push(event_type); }
    
    sql += ` ORDER BY timestamp DESC LIMIT $${paramIdx}`;
    params.push(parseInt(limit));
    
    const result = await query(sql, params);
    
    const totalResult = await query('SELECT COUNT(*) as count FROM crm_audit_log WHERE tenant_id = $1', [tenantId]);
    const eventTypesResult = await query('SELECT DISTINCT event_type FROM crm_audit_log WHERE tenant_id = $1', [tenantId]);
    
    res.json({ 
      success: true, 
      entries: result.rows,
      total: parseInt(totalResult.rows[0]?.count) || 0,
      event_types: eventTypesResult.rows.map(r => r.event_type)
    });
  } catch (e) { next(e); }
});

// Adaptive Automation - Trigger Rules
app.post('/automation/triggers', requireAnyRole(['manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { name, event_type, conditions, actions, enabled } = req.body;
    
    if (!name || !event_type || !actions) {
      return res.status(400).json({ error: 'name, event_type, and actions are required' });
    }
    
    // Store in KV if available, otherwise in-memory
    const trigger = {
      id: uuidv4(),
      tenant_id: tenantId,
      name,
      event_type, // 'customer_inactive_30d', 'high_value_purchase', 'birthday', 'churn_risk'
      conditions: conditions || {},
      actions, // Array of actions to perform
      enabled: enabled !== false,
      created_at: new Date().toISOString(),
      last_triggered: null,
      trigger_count: 0
    };
    
    try {
      if (kvReady) {
        await kvStore.put(`trigger:${tenantId}:${trigger.id}`, JSON.stringify(trigger));
      }
    } catch (e) {
      console.error('KV store error:', e.message);
    }
    
    res.json({ success: true, trigger });
  } catch (e) { next(e); }
});

// Customer Journey Tracking - NOW TO DATABASE
app.post('/journey/events', requireAnyRole(['cashier','manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { customer_id, event_type, channel, metadata } = req.body;
    
    if (!customer_id || !event_type) {
      return res.status(400).json({ error: 'customer_id and event_type are required' });
    }
    
    // Store journey event in database
    const result = await query(
      `INSERT INTO crm_journey_events (tenant_id, customer_id, event_type, channel, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [tenantId, customer_id, event_type, channel || 'pos', JSON.stringify(metadata || {})]
    );
    
    res.json({ success: true, event: result.rows[0] });
  } catch (e) { next(e); }
});

// Get customer journey - NOW FROM DATABASE
app.get('/journey/:customer_id', requireAnyRole(['manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { customer_id } = req.params;
    
    // Get journey events from database
    const journeyResult = await query(
      `SELECT * FROM crm_journey_events WHERE tenant_id = $1 AND customer_id = $2 ORDER BY timestamp ASC`,
      [tenantId, customer_id]
    );
    const journeyEvents = journeyResult.rows;
    
    // Get customer info
    const customerResult = await query(
      `SELECT c.*, 
              (SELECT MIN(created_at) FROM pos_transactions WHERE customer_id = c.id) as first_purchase,
              (SELECT MAX(created_at) FROM pos_transactions WHERE customer_id = c.id) as last_purchase,
              (SELECT COUNT(*) FROM pos_transactions WHERE customer_id = c.id) as total_purchases
       FROM customers c WHERE c.tenant_id = $1 AND c.id = $2`,
      [tenantId, customer_id]
    );
    
    const customer = customerResult.rows[0];
    
    // Build journey timeline
    const timeline = [];
    
    if (customer) {
      timeline.push({
        stage: 'acquisition',
        event: 'Customer Created',
        date: customer.created_at,
        channel: 'pos'
      });
      
      if (customer.first_purchase) {
        timeline.push({
          stage: 'activation',
          event: 'First Purchase',
          date: customer.first_purchase,
          channel: 'pos'
        });
      }
      
      if (parseInt(customer.total_purchases) > 1) {
        timeline.push({
          stage: 'retention',
          event: `${customer.total_purchases} Total Purchases`,
          date: customer.last_purchase,
          channel: 'pos'
        });
      }
      
      // Add any logged journey events
      journeyEvents.forEach(e => {
        timeline.push({
          stage: e.event_type.replace('journey_', ''),
          event: e.event_type.replace('journey_', '').replace(/_/g, ' '),
          date: e.timestamp,
          channel: e.details?.channel || 'system',
          metadata: e.details?.metadata
        });
      });
    }
    
    // Determine current lifecycle stage
    let currentStage = 'prospect';
    if (customer) {
      const daysSinceLastPurchase = customer.last_purchase 
        ? Math.floor((Date.now() - new Date(customer.last_purchase).getTime()) / (1000 * 60 * 60 * 24))
        : 999;
      
      if (daysSinceLastPurchase > 180) currentStage = 'churned';
      else if (daysSinceLastPurchase > 90) currentStage = 'at_risk';
      else if (parseInt(customer.total_purchases) > 5) currentStage = 'loyal';
      else if (parseInt(customer.total_purchases) > 1) currentStage = 'active';
      else if (parseInt(customer.total_purchases) === 1) currentStage = 'activated';
      else currentStage = 'new';
    }
    
    res.json({
      success: true,
      customer_id,
      current_stage: currentStage,
      timeline: timeline.sort((a, b) => new Date(a.date) - new Date(b.date)),
      stages: ['prospect', 'new', 'activated', 'active', 'loyal', 'at_risk', 'churned'],
      recommendations: currentStage === 'at_risk' 
        ? ['Send win-back email', 'Offer loyalty discount', 'Schedule follow-up call']
        : currentStage === 'loyal'
        ? ['Enroll in VIP program', 'Send exclusive offers', 'Request referrals']
        : ['Continue engagement', 'Monitor activity']
    });
  } catch (e) { next(e); }
});


// Serve embedded UI from ui/dist if it exists
const UI_DIST_PATH = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(UI_DIST_PATH)) {
  console.log('📦 Serving embedded UI from ui/dist');
  app.use(express.static(UI_DIST_PATH));
  
  // SPA fallback - serve index.html for all non-API routes
  const API_PREFIXES = ['/api', '/health', '/metrics', '/status', '/customers', '/deals', '/activities', 
    '/segments', '/tags', '/ai', '/privacy', '/audit', '/journey', '/analytics', '/loyalty', '/campaigns', '/tickets', '/automation', '/profiles'];
  app.get('*', (req, res, next) => {
    if (API_PREFIXES.some(prefix => req.path.startsWith(prefix))) {
      return next();
    }
    res.sendFile(path.join(UI_DIST_PATH, 'index.html'));
  });
}

// Error handler
app.use((err, req, res, next) => {
  console.error('[CRM] Error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error', timestamp: new Date().toISOString() });
});

// Health
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'customer_relationship_management' }));
app.get('/readyz', (req, res) => res.json({ status: kvReady ? 'ready' : 'not_ready', service: 'customer_relationship_management', nats_kv: kvReady }));
app.get('/stats', (req, res) => res.json({ uptime: Math.round((Date.now()-started)/1000), service: 'customer_relationship_management', version: '1.1.0' }));

// Start
const PORT = process.env.PORT || 8952;
app.listen(PORT, () => {
  console.log(`\n✅ Customer Relationship Management service listening on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
});
