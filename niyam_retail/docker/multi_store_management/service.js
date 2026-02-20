// Multi-Store Management — stock transfers across stores
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
const DEFAULT_STORE_ID='00000000-0000-0000-0000-000000000001';
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

const TransferCreate=z.object({ from_store_id: z.string().uuid().optional(), to_store_id: z.string().uuid().optional(), items: z.array(z.object({ sku: z.string(), quantity: z.coerce.number().int().positive() })).min(1), notes: z.string().optional() });
const TransferStatus=z.object({ status: z.enum(['pending','in_transit','completed','cancelled']) });

app.post('/transfers', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const b=TransferCreate.parse(req.body); const number=`TR-${Date.now()}`; const itemsJson=JSON.stringify(b.items); const r=await query(`INSERT INTO stock_transfers (tenant_id, transfer_number, from_store_id, to_store_id, items, status, created_at, updated_at, notes) VALUES ($1,$2,$3,$4,$5,'pending',NOW(),NOW(),$6) RETURNING *`,[tenantId,number,b.from_store_id||DEFAULT_STORE_ID,b.to_store_id||DEFAULT_STORE_ID,itemsJson,b.notes||null]); res.json({ success:true, transfer:r.rows[0] }); }catch(e){ next(e); }
});

app.get('/transfers', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const r=await query('SELECT * FROM stock_transfers WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 200',[tenantId]); res.json({ success:true, transfers:r.rows }); }catch(e){ next(e); }
});

app.patch('/transfers/:id/status', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const id=req.params.id; const { status }=TransferStatus.parse(req.body); let extra=''; if(status==='in_transit') extra=', shipped_at = NOW()'; if(status==='completed') extra=', received_at = NOW()'; const r=await query(`UPDATE stock_transfers SET status = $1${extra}, updated_at = NOW() WHERE tenant_id = $2 AND id = $3 RETURNING *`,[status,tenantId,id]); if (r.rowCount===0) return res.status(404).json({ error:'Not found' }); res.json({ success:true, transfer:r.rows[0] }); }catch(e){ next(e); }
});

app.get('/healthz', (req,res)=> res.json({ status:'ok', service:'multi_store_management' }));
app.get('/readyz', (req,res)=> res.json({ status:'ready', service:'multi_store_management' }));
app.get('/stats', (req,res)=> res.json({ uptime: Math.round((Date.now()-started)/1000) }));
const PORT = process.env.PORT || 8802;

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

app.listen(PORT, ()=> console.log('Multi-Store Management listening on', PORT));
