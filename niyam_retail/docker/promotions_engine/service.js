// Promotions Engine — CRUD & validation
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

const PromoCreate=z.object({ code: z.string().min(2).optional(), name: z.string().min(1), description: z.string().optional(), discount_type: z.enum(['percentage','fixed']), discount_value: z.coerce.number().positive(), min_purchase_amount: z.coerce.number().nonnegative().optional(), max_discount_amount: z.coerce.number().nonnegative().optional(), applicable_products: z.any().optional(), applicable_stores: z.any().optional(), start_date: z.coerce.date(), end_date: z.coerce.date(), max_uses: z.coerce.number().int().positive().optional(), max_uses_per_customer: z.coerce.number().int().positive().optional(), stackable: z.boolean().optional(), active: z.boolean().optional() });
const PromoPatch=PromoCreate.partial();
const Validate=z.object({ code: z.string().min(1), items: z.array(z.object({ sku: z.string(), price: z.coerce.number().nonnegative(), quantity: z.coerce.number().int().positive() })).min(1), customer_id: z.string().uuid().optional() });

app.get('/promotions', requireAnyRole(['manager','admin','marketing','ops']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const active=req.query.active; let sql='SELECT * FROM promotions WHERE tenant_id = $1'; const params=[tenantId]; if (active==='true') sql+=' AND active = true'; sql+=' ORDER BY created_at DESC LIMIT 200'; const r=await query(sql, params); res.json({ success:true, promotions:r.rows }); }catch(e){ next(e); }
});

app.post('/promotions', requireAnyRole(['manager','admin','marketing']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const b=PromoCreate.parse(req.body); const r=await query(`INSERT INTO promotions (tenant_id, code, name, description, discount_type, discount_value, min_purchase_amount, max_discount_amount, applicable_products, applicable_stores, start_date, end_date, max_uses, max_uses_per_customer, stackable, active, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,COALESCE($16,true),NOW(),NOW()) RETURNING *`,[tenantId,b.code||null,b.name,b.description||null,b.discount_type,b.discount_value,b.min_purchase_amount||null,b.max_discount_amount||null,b.applicable_products||null,b.applicable_stores||null,b.start_date,b.end_date,b.max_uses||null,b.max_uses_per_customer||null,!!b.stackable,b.active===undefined?true:b.active]); res.json({ success:true, promotion:r.rows[0] }); }catch(e){ next(e); }
});

app.patch('/promotions/:id', requireAnyRole(['manager','admin','marketing']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const id=req.params.id; const p=PromoPatch.parse(req.body); const fields=[]; const vals=[tenantId,id]; let i=3; for (const [k,v] of Object.entries(p)) { fields.push(`${k} = $${i++}`); vals.push(v); } if (fields.length===0) return res.status(400).json({ error:'No fields to update' }); const r=await query(`UPDATE promotions SET ${fields.join(', ')}, updated_at = NOW() WHERE tenant_id = $1 AND id = $2 RETURNING *`, vals); if (r.rowCount===0) return res.status(404).json({ error:'Not found' }); res.json({ success:true, promotion:r.rows[0] }); }catch(e){ next(e); }
});

app.post('/promotions/validate', requireAnyRole(['manager','admin','marketing','cashier','accountant','ops']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const b=Validate.parse(req.body); const now=new Date(); const r=await query('SELECT * FROM promotions WHERE tenant_id = $1 AND code = $2 AND active = true AND start_date <= NOW() AND end_date >= NOW()',[tenantId,b.code]); if (r.rowCount===0) return res.status(404).json({ error:'Invalid or inactive code' }); const promo=r.rows[0]; const cartTotal=b.items.reduce((s,it)=>s+(it.price*it.quantity),0); if (promo.min_purchase_amount && cartTotal < Number(promo.min_purchase_amount)) return res.json({ success:true, valid:false, reason:'min_purchase_amount', cart_total: cartTotal, discount_total: 0 }); let discount=0; if (promo.discount_type==='percentage') discount = cartTotal * (Number(promo.discount_value)/100); else if (promo.discount_type==='fixed') discount = Math.min(Number(promo.discount_value), cartTotal); if (promo.max_discount_amount) discount = Math.min(discount, Number(promo.max_discount_amount)); const finalTotal = Math.max(0, cartTotal - discount); res.json({ success:true, valid:true, cart_total: cartTotal, discount_total: Number(discount.toFixed(2)), final_total: Number(finalTotal.toFixed(2)), promotion: { id: promo.id, code: promo.code, name: promo.name } }); }catch(e){ next(e); }
});

app.get('/healthz', (req,res)=> res.json({ status:'ok', service:'promotions_engine' }));
app.get('/readyz', (req,res)=> res.json({ status:'ready', service:'promotions_engine' }));
app.get('/stats', (req,res)=> res.json({ uptime: Math.round((Date.now()-started)/1000) }));
const PORT = process.env.PORT || 8966;

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

app.listen(PORT, ()=> console.log('Promotions Engine listening on', PORT));
