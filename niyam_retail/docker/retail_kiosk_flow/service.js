// Retail Kiosk Flow — create/list orders, status updates
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

const OrderItem=z.object({ sku: z.string(), quantity: z.coerce.number().int().positive(), price: z.coerce.number().nonnegative() });
const KioskOrder=z.object({ kiosk_id: z.string().min(1), store_id: z.string().uuid().optional(), customer_email: z.string().email().optional(), customer_phone: z.string().optional(), items: z.array(OrderItem).min(1), payment_method: z.string().optional() });
const Status=z.object({ order_status: z.enum(['pending','preparing','ready','completed','cancelled']) });

app.post('/kiosk/orders', requireAnyRole(['cashier','manager','admin','ops']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const b=KioskOrder.parse(req.body); const subtotal=b.items.reduce((s,it)=>s+(it.price*it.quantity),0); const tax=0; const total=subtotal; const num=`KO-${Date.now()}`; const itemsJson=JSON.stringify(b.items); const r=await query(`INSERT INTO kiosk_orders (tenant_id, order_number, kiosk_id, store_id, customer_email, customer_phone, items, subtotal, tax, total, payment_method, payment_status, order_status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending','pending',NOW()) RETURNING *`,[tenantId,num,b.kiosk_id,b.store_id||DEFAULT_STORE_ID,b.customer_email||null,b.customer_phone||null,itemsJson,subtotal,tax,total,b.payment_method||null]); res.json({ success:true, order:r.rows[0] }); }catch(e){ next(e); }
});

app.get('/kiosk/orders', requireAnyRole(['cashier','manager','admin','ops']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const r=await query('SELECT * FROM kiosk_orders WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 200',[tenantId]); res.json({ success:true, orders:r.rows }); }catch(e){ next(e); }
});

app.patch('/kiosk/orders/:id/status', requireAnyRole(['cashier','manager','admin','ops']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const id=req.params.id; const { order_status }=Status.parse(req.body); let extra=''; if(order_status==='ready') extra=', ready_at = NOW()'; if(order_status==='completed') extra=', completed_at = NOW()'; const r=await query(`UPDATE kiosk_orders SET order_status = $1${extra} WHERE tenant_id = $2 AND id = $3 RETURNING *`,[order_status,tenantId,id]); if (r.rowCount===0) return res.status(404).json({ error:'Not found' }); res.json({ success:true, order:r.rows[0] }); }catch(e){ next(e); }
});

app.get('/healthz', (req,res)=> res.json({ status:'ok', service:'retail_kiosk_flow' }));
app.get('/readyz', (req,res)=> res.json({ status:'ready', service:'retail_kiosk_flow' }));
app.get('/stats', (req,res)=> res.json({ uptime: Math.round((Date.now()-started)/1000) }));
const PORT = process.env.PORT || 8816;

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

app.listen(PORT, ()=> console.log('Retail Kiosk Flow listening on', PORT));
