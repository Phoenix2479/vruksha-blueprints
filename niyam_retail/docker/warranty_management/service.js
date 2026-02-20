// Warranty Management — register and claim warranties
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

const WRegister=z.object({ product_id: z.string().uuid(), transaction_id: z.string().uuid().optional(), customer_id: z.string().uuid().optional(), customer_email: z.string().email().optional(), customer_name: z.string().optional(), purchase_date: z.coerce.date(), warranty_period_months: z.coerce.number().int().positive() });
const WClaim=z.object({ claim_notes: z.string().optional() });

app.post('/warranties', requireAnyRole(['cashier','manager','admin','ops']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const b=WRegister.parse(req.body); const number=`WAR-${Date.now()}`; const expiry = new Date(b.purchase_date); expiry.setMonth(expiry.getMonth()+b.warranty_period_months);
    let customerId=b.customer_id||null;
    if (!customerId){
      if (!b.customer_email){ return res.status(400).json({ error:'customer_id or customer_email required' }); }
      // find or create customer
      const existing=await query('SELECT id FROM customers WHERE tenant_id=$1 AND email=$2',[tenantId,b.customer_email]);
      if (existing.rowCount>0) customerId=existing.rows[0].id; else {
        const created=await query('INSERT INTO customers (tenant_id, name, email, status, created_at, updated_at) VALUES ($1,$2,$3,\'active\',NOW(),NOW()) RETURNING id',[tenantId,b.customer_name||'Warranty Customer', b.customer_email]);
        customerId=created.rows[0].id;
      }
    }
    const r=await query(`INSERT INTO warranties (tenant_id, warranty_number, product_id, transaction_id, customer_id, purchase_date, warranty_period_months, expiry_date, status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',NOW(),NOW()) RETURNING *`,[tenantId,number,b.product_id,b.transaction_id||null,customerId,b.purchase_date, b.warranty_period_months, expiry]); res.json({ success:true, warranty:r.rows[0] }); }catch(e){ next(e); }
});

app.get('/warranties', requireAnyRole(['cashier','manager','admin','ops']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const r=await query('SELECT * FROM warranties WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 200',[tenantId]); res.json({ success:true, warranties:r.rows }); }catch(e){ next(e); }
});

app.patch('/warranties/:id/claim', requireAnyRole(['cashier','manager','admin','ops']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const id=req.params.id; const { claim_notes }=WClaim.parse(req.body||{}); const r=await query(`UPDATE warranties SET status = 'claimed', claim_date = CURRENT_DATE, claim_notes = $1, updated_at = NOW() WHERE tenant_id = $2 AND id = $3 RETURNING *`,[claim_notes||null, tenantId, id]); if (r.rowCount===0) return res.status(404).json({ error:'Not found' }); res.json({ success:true, warranty:r.rows[0] }); }catch(e){ next(e); }
});

app.get('/healthz', (req,res)=> res.json({ status:'ok', service:'warranty_management' }));
app.get('/readyz', (req,res)=> res.json({ status:'ready', service:'warranty_management' }));
app.get('/stats', (req,res)=> res.json({ uptime: Math.round((Date.now()-started)/1000) }));
const PORT = process.env.PORT || 8975;

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

app.listen(PORT, ()=> console.log('Warranty Management listening on', PORT));
