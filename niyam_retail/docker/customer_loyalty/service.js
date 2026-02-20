// Customer Loyalty Service
// Points, tiers, rewards, gamification

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
app.use(express.json());

const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// Security & CORS
app.use(helmet({ contentSecurityPolicy: false }));
const DEFAULT_ALLOWED = ['http://localhost:3001','http://localhost:3003','http://localhost:3004','http://localhost:3005'];
const ALLOW_ALL = (process.env.ALLOW_ALL_CORS || 'true').toLowerCase() === 'true';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean);
const ORIGIN_ALLOWLIST = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : DEFAULT_ALLOWED;
app.use(cors({ origin: (origin,cb)=>{ if(ALLOW_ALL||!origin||ORIGIN_ALLOWLIST.includes(origin)) return cb(null,true); return cb(new Error('CORS not allowed'), false); }, allowedHeaders: ['Content-Type','Authorization','X-Tenant-ID'] }));

// KV
let kvReady = false;
(async()=>{ try{ await kvStore.connect(); kvReady=true; console.log('✅ Loyalty: KV connected'); } catch(e){ console.error('❌ Loyalty: KV connect failed', e.message); } })();

// Metrics
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
const httpHistogram = new promClient.Histogram({ name:'loyalty_http_request_duration_seconds', help:'HTTP duration', labelNames:['method','route','status'], buckets:[0.005,0.01,0.05,0.1,0.5,1,2,5] });
registry.registerMetric(httpHistogram);
app.use((req,res,next)=>{ const s=process.hrtime.bigint(); res.on('finish',()=>{ const d=Number(process.hrtime.bigint()-s)/1e9; const route=req.route?.path||req.path; httpHistogram.labels(req.method, route, String(res.statusCode)).observe(d); }); next(); });
app.get('/metrics', async (req,res)=>{ res.set('Content-Type', registry.contentType); res.end(await registry.metrics()); });

// Helpers & Auth
function getTenantId(req){ const t=req.headers['x-tenant-id']; return (typeof t==='string' && t.trim())? t.trim(): DEFAULT_TENANT_ID; }
const SKIP_AUTH = (process.env.SKIP_AUTH || 'true').toLowerCase() === 'true';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
function authenticate(req,_res,next){ if(SKIP_AUTH) return next(); const hdr=req.headers.authorization||''; const token=hdr.startsWith('Bearer ')?hdr.slice(7):null; if(!token) return next(); try{ req.user=jwt.verify(token, JWT_SECRET, {algorithms:['HS256']}); }catch(_){} next(); }
function requireAnyRole(roles){ return (req,res,next)=>{ if(SKIP_AUTH) return next(); if(!req.user||!Array.isArray(req.user.roles)) return res.status(401).json({error:'Unauthorized'}); const ok=req.user.roles.some(r=>roles.includes(r)); if(!ok) return res.status(403).json({error:'Forbidden'}); const tt=req.user.tenant_id; const ht=getTenantId(req); if(tt&&ht&&tt!==ht) return res.status(403).json({error:'Tenant mismatch'}); next(); } }
app.use(authenticate);

// Validation
const Redeem = z.object({ customer_id: z.string().uuid(), points: z.number().int().positive(), reason: z.string().optional() });

// Status
app.get('/status', (req,res)=> res.json({ success:true, service:'customer_loyalty', ready: kvReady }));

// Summary
app.get('/loyalty/:customer_id/summary', requireAnyRole(['manager','admin','cashier','accountant']), async (req,res,next)=>{
  try {
    const tenantId = getTenantId(req);
    const { customer_id } = req.params;
    const cust = await query('SELECT id, name, loyalty_points, loyalty_tier FROM customers WHERE tenant_id = $1 AND id = $2', [tenantId, customer_id]);
    if (cust.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    const tx = await query('SELECT transaction_type, points, created_at, reason FROM loyalty_transactions WHERE tenant_id = $1 AND customer_id = $2 ORDER BY created_at DESC LIMIT 100', [tenantId, customer_id]);
    res.json({ success:true, customer: cust.rows[0], transactions: tx.rows });
  } catch(e){ next(e); }
});

// Redeem
app.post('/loyalty/redeem', requireAnyRole(['manager','admin','cashier']), async (req,res,next)=>{
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const body = Redeem.parse({ ...req.body, points: typeof req.body.points==='string' ? parseInt(req.body.points,10) : req.body.points });
    const c = await client.query('SELECT id, loyalty_points FROM customers WHERE tenant_id = $1 AND id = $2 FOR UPDATE', [tenantId, body.customer_id]);
    if (c.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    const before = parseInt(c.rows[0].loyalty_points, 10) || 0;
    if (before < body.points) return res.status(400).json({ error: 'Insufficient points' });
    const after = before - body.points;
    await client.query('BEGIN');
    await client.query('UPDATE customers SET loyalty_points = $1, updated_at = NOW() WHERE tenant_id = $2 AND id = $3', [after, tenantId, body.customer_id]);
    await client.query(
      `INSERT INTO loyalty_transactions (tenant_id, customer_id, transaction_type, points, balance_before, balance_after, reason)
       VALUES ($1,$2,'redeemed',$3,$4,$5,$6)`,
      [tenantId, body.customer_id, body.points, before, after, body.reason || 'redeem']
    );
    await client.query('COMMIT');
    await publishEnvelope('retail.loyalty.points.redeemed.v1', 1, { tenant_id: tenantId, customer_id: body.customer_id, points: body.points });
    res.json({ success:true, balance: after });
  } catch(e){ await client.query('ROLLBACK'); next(e); } finally { client.release(); }
});

// Errors & Health
app.use((err, req, res, next) => { console.error('[Loyalty] Error:', err); res.status(err.status||500).json({ error: err.message || 'Internal server error' }); });
app.get('/healthz', (req,res)=> res.json({ status: 'ok', service: 'customer_loyalty' }));
app.get('/readyz', (req,res)=> res.json({ status: kvReady ? 'ready' : 'not_ready', service: 'customer_loyalty' }));
app.get('/stats', (req,res)=> res.json({ uptime: Math.round((Date.now()-Date.now()+started)/1000) }));

const started = Date.now();
const PORT = process.env.PORT || 8951;

// Serve embedded UI from ui/dist if it exists
const UI_DIST_PATH = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(UI_DIST_PATH)) {
  console.log('📦 Serving embedded UI from ui/dist');
  app.use(express.static(UI_DIST_PATH));
  
  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || 
        req.path.startsWith('/health') ||
        req.path.startsWith('/metrics')) {
      return next();
    }
    res.sendFile(path.join(UI_DIST_PATH, 'index.html'));
  });
}

app.listen(PORT, () => { console.log(`\n✅ Customer Loyalty service listening on port ${PORT}`); console.log(`📍 http://localhost:${PORT}`); });
