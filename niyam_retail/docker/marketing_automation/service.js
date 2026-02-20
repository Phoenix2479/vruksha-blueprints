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

const app = express();
app.use(express.json());
const started = Date.now();

const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
app.use(helmet({ contentSecurityPolicy: false }));
const DEFAULT_ALLOWED=['http://localhost:3001','http://localhost:3003','http://localhost:3004','http://localhost:3005'];
const ALLOW_ALL=(process.env.ALLOW_ALL_CORS||'true').toLowerCase()==='true';
const ALLOWED_ORIGINS=(process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
const ORIGIN_ALLOWLIST=ALLOWED_ORIGINS.length?ALLOWED_ORIGINS:DEFAULT_ALLOWED;
app.use(cors({ origin:(origin,cb)=>{ if(ALLOW_ALL||!origin||ORIGIN_ALLOWLIST.includes(origin)) return cb(null,true); return cb(new Error('CORS not allowed'), false); }, allowedHeaders:['Content-Type','Authorization','X-Tenant-ID'] }));

function getTenantId(req){ const t=req.headers['x-tenant-id']; return (typeof t==='string'&&t.trim())? t.trim(): DEFAULT_TENANT_ID; }
const SKIP_AUTH=(process.env.SKIP_AUTH||'true').toLowerCase()==='true';
const JWT_SECRET=process.env.JWT_SECRET||'dev_secret_change_me';
function authenticate(req,_res,next){ if(SKIP_AUTH) return next(); const hdr=req.headers.authorization||''; const token=hdr.startsWith('Bearer ')?hdr.slice(7):null; if(!token) return next(); try{ req.user=jwt.verify(token, JWT_SECRET, {algorithms:['HS256']}); }catch(_){} next(); }
function requireAnyRole(roles){ return (req,res,next)=>{ if(SKIP_AUTH) return next(); if(!req.user||!Array.isArray(req.user.roles)) return res.status(401).json({error:'Unauthorized'}); const ok=req.user.roles.some(r=>roles.includes(r)); if(!ok) return res.status(403).json({error:'Forbidden'}); if(req.user.tenant_id && req.user.tenant_id!==getTenantId(req)) return res.status(403).json({error:'Tenant mismatch'}); next(); } }
app.use(authenticate);

// Metrics
const registry=new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
const httpHistogram=new promClient.Histogram({ name:'marketing_http_request_duration_seconds', help:'HTTP duration', labelNames:['method','route','status'], buckets:[0.005,0.01,0.05,0.1,0.5,1,2,5]});
registry.registerMetric(httpHistogram);
app.use((req,res,next)=>{ const s=process.hrtime.bigint(); res.on('finish',()=>{ const d=Number(process.hrtime.bigint()-s)/1e9; const route=req.route?.path||req.path; httpHistogram.labels(req.method, route, String(res.statusCode)).observe(d); }); next(); });
app.get('/metrics', async (req,res)=>{ res.set('Content-Type', registry.contentType); res.end(await registry.metrics()); });

// Validation
const CampaignCreate=z.object({ name: z.string().min(1), trigger: z.any().optional(), template: z.any().optional(), audience: z.any().optional() });
const CampaignRun=z.object({});

// Endpoints
app.post('/campaigns', requireAnyRole(['manager','admin','marketing','ops']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const b=CampaignCreate.parse(req.body); const r=await query('INSERT INTO marketing_campaigns (tenant_id, name, trigger, template, audience, status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',[tenantId,b.name,b.trigger||null,b.template||null,b.audience||null,'draft']); await publishEnvelope('retail.marketing.campaign.created.v1',1,{ tenant_id:tenantId, id:r.rows[0].id, name:b.name }); res.json({ success:true, campaign: r.rows[0] }); }catch(e){ next(e); }
});

app.get('/campaigns', requireAnyRole(['manager','admin','marketing','ops']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const r=await query('SELECT * FROM marketing_campaigns WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 200',[tenantId]); res.json({ success:true, campaigns: r.rows }); }catch(e){ next(e); }
});

app.post('/campaigns/:id/run', requireAnyRole(['manager','admin','marketing','ops']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const id=req.params.id; await query('UPDATE marketing_campaigns SET status = $1, updated_at = NOW() WHERE tenant_id = $2 AND id = $3',['running',tenantId,id]); const r=await query('INSERT INTO marketing_campaign_runs (tenant_id, campaign_id, status, started_at) VALUES ($1,$2,$3,NOW()) RETURNING *',[tenantId,id,'running']); await publishEnvelope('retail.marketing.campaign.run_started.v1',1,{ tenant_id:tenantId, campaign_id:id, run_id:r.rows[0].id }); res.json({ success:true, run: r.rows[0] }); }catch(e){ next(e); }
});

// Health
app.get('/healthz', (req,res)=> res.json({ status: 'ok', service: 'marketing_automation' }));
app.get('/readyz', (req,res)=> res.json({ status: 'ready', service: 'marketing_automation' }));
app.get('/stats', (req,res)=> res.json({ uptime: Math.round((Date.now()-started)/1000) }));
const PORT = process.env.PORT || 8956;

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

app.listen(PORT, ()=> console.log('Marketing Automation service listening on', PORT));
