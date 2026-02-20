const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const promClient = require('prom-client');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const { query } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');

const app = express();
app.use(express.json());

const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
app.use(helmet({ contentSecurityPolicy: false }));
const DEFAULT_ALLOWED = ['http://localhost:3001','http://localhost:3003','http://localhost:3004','http://localhost:3005'];
const ALLOW_ALL = (process.env.ALLOW_ALL_CORS || 'true').toLowerCase() === 'true';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean);
const ORIGIN_ALLOWLIST = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : DEFAULT_ALLOWED;
app.use(cors({ origin: (origin,cb)=>{ if(ALLOW_ALL||!origin||ORIGIN_ALLOWLIST.includes(origin)) return cb(null,true); return cb(new Error('CORS not allowed'), false); }, allowedHeaders: ['Content-Type','Authorization','X-Tenant-ID'] }));

function getTenantId(req){ const t=req.headers['x-tenant-id']; return (typeof t==='string' && t.trim())? t.trim(): DEFAULT_TENANT_ID; }
const SKIP_AUTH=(process.env.SKIP_AUTH||'true').toLowerCase()==='true';
const JWT_SECRET=process.env.JWT_SECRET||'dev_secret_change_me';
function authenticate(req,_res,next){ if(SKIP_AUTH) return next(); const hdr=req.headers.authorization||''; const token=hdr.startsWith('Bearer ')?hdr.slice(7):null; if(!token) return next(); try{ req.user=jwt.verify(token, JWT_SECRET, {algorithms:['HS256']}); }catch(_){} next(); }
function requireAnyRole(roles){ return (req,res,next)=>{ if(SKIP_AUTH) return next(); if(!req.user||!Array.isArray(req.user.roles)) return res.status(401).json({error:'Unauthorized'}); const ok=req.user.roles.some(r=>roles.includes(r)); if(!ok) return res.status(403).json({error:'Forbidden'}); if(req.user.tenant_id && req.user.tenant_id!==getTenantId(req)) return res.status(403).json({error:'Tenant mismatch'}); next(); } }
app.use(authenticate);

// Metrics
const registry=new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
const httpHistogram=new promClient.Histogram({ name:'feedback_http_request_duration_seconds', help:'HTTP duration', labelNames:['method','route','status'], buckets:[0.005,0.01,0.05,0.1,0.5,1,2,5]});
registry.registerMetric(httpHistogram);
app.use((req,res,next)=>{ const s=process.hrtime.bigint(); res.on('finish',()=>{ const d=Number(process.hrtime.bigint()-s)/1e9; const route=req.route?.path||req.path; httpHistogram.labels(req.method, route, String(res.statusCode)).observe(d); }); next(); });
app.get('/metrics', async (req,res)=>{ res.set('Content-Type', registry.contentType); res.end(await registry.metrics()); });

// Validation
const FeedbackCreate=z.object({ customer_id: z.string().uuid().optional(), rating: z.number().int().min(0).max(10).optional(), feedback_type: z.string().optional(), comments: z.string().optional(), source: z.string().optional(), metadata: z.any().optional() });

// Endpoints
app.post('/feedback', requireAnyRole(['manager','admin','cashier','accountant','ops']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const b=FeedbackCreate.parse({ ...req.body, rating: typeof req.body.rating==='string'? parseInt(req.body.rating,10): req.body.rating }); const r=await query('INSERT INTO customer_feedback (tenant_id, customer_id, rating, feedback_type, comments, source, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',[tenantId, b.customer_id||null, b.rating??null, b.feedback_type||null, b.comments||null, b.source||null, b.metadata||null]); const fb=r.rows[0]; await publishEnvelope('retail.feedback.received.v1',1,{ tenant_id:tenantId, feedback_id: fb.id, rating: fb.rating }); res.json({ success:true, feedback: fb }); }catch(e){ next(e); }
});

app.get('/feedback', requireAnyRole(['manager','admin','accountant','ops']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const r=await query('SELECT * FROM customer_feedback WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 200',[tenantId]); res.json({ success:true, feedback: r.rows }); }catch(e){ next(e); }
});

// Health
const started = Date.now();
app.get('/healthz', (req,res)=> res.json({ status: 'ok', service: 'customer_feedback_management' }));
app.get('/readyz', (req,res)=> res.json({ status: 'ready', service: 'customer_feedback_management' }));
app.get('/stats', (req,res)=> res.json({ uptime: Math.round((Date.now()-started)/1000) }));
const PORT = process.env.PORT || 8950;

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

app.listen(PORT, ()=> console.log('Customer Feedback service listening on', PORT));
