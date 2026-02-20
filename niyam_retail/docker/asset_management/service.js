// Asset Management — assets and assignment
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

const DEFAULT_TENANT_ID='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
app.use(helmet({ contentSecurityPolicy:false }));
app.use(cors());
function getTenantId(req){ const t=req.headers['x-tenant-id']; return (typeof t==='string'&&t.trim())? t.trim(): DEFAULT_TENANT_ID; }
const SKIP_AUTH=(process.env.SKIP_AUTH||'true').toLowerCase()==='true';
const JWT_SECRET=process.env.JWT_SECRET||'dev_secret_change_me';
function authenticate(req,_res,next){ if(SKIP_AUTH) return next(); const hdr=req.headers.authorization||''; const token=hdr.startsWith('Bearer ')?hdr.slice(7):null; if(!token) return next(); try{ req.user=jwt.verify(token, JWT_SECRET, {algorithms:['HS256']}); }catch(_){} next(); }
function requireAnyRole(roles){ return (req,res,next)=>{ if(SKIP_AUTH) return next(); if(!req.user||!Array.isArray(req.user.roles)) return res.status(401).json({error:'Unauthorized'}); const ok=req.user.roles.some(r=>roles.includes(r)); if(!ok) return res.status(403).json({error:'Forbidden'}); next(); } }
app.use(authenticate);

const registry=new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
app.get('/metrics', async (req,res)=>{ res.set('Content-Type', registry.contentType); res.end(await registry.metrics()); });

const AssetCreate=z.object({ asset_tag: z.string().min(1), name: z.string().min(1), category: z.string().optional() });
const Assign=z.object({ employee_id: z.string().uuid().optional(), status: z.string().optional() });

app.get('/assets', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const r=await query('SELECT * FROM assets WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200',[tenantId]); res.json({ success:true, assets:r.rows }); }catch(e){ next(e); }
});
app.post('/assets', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const b=AssetCreate.parse(req.body); const r=await query('INSERT INTO assets (tenant_id, asset_tag, name, category, status) VALUES ($1,$2,$3,$4,\'available\') RETURNING *',[tenantId,b.asset_tag,b.name,b.category||null]); res.json({ success:true, asset:r.rows[0] }); }catch(e){ next(e); }
});
app.patch('/assets/:id/assign', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req); const id=req.params.id; const b=Assign.parse(req.body||{});
    const r=await query(
      "UPDATE assets SET assigned_to=$1::uuid, status=COALESCE($2::text, CASE WHEN $1::uuid IS NULL THEN 'available' ELSE 'assigned' END), updated_at=NOW() WHERE tenant_id=$3 AND id=$4 RETURNING *",
      [b.employee_id||null,b.status||null,tenantId,id]
    );
    if (r.rowCount===0) return res.status(404).json({ error:'Not found' });
    res.json({ success:true, asset:r.rows[0] });
  }catch(e){ next(e); }
});

app.get('/healthz', (req,res)=> res.json({ status:'ok', service:'asset_management' }));
app.get('/readyz', (req,res)=> res.json({ status:'ready', service:'asset_management' }));
app.get('/stats', (req,res)=> res.json({ uptime: Math.round((Date.now()-started)/1000) }));
const PORT = process.env.PORT || 8944;

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

app.listen(PORT, ()=> console.log('Asset Management listening on', PORT));
