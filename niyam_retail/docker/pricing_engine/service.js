// Pricing Engine — price updates and quotes
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

const PriceUpdate=z.object({ sku: z.string().optional(), product_id: z.string().uuid().optional(), new_price: z.coerce.number().positive(), reason: z.string().optional() }).refine(v=>v.sku||v.product_id,{ message:'sku or product_id required' });
const Quote=z.object({ items: z.array(z.object({ sku: z.string(), quantity: z.coerce.number().int().positive() })).min(1) });

app.post('/price/update', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const b=PriceUpdate.parse(req.body); let product; if (b.sku){ const r=await query('SELECT * FROM products WHERE tenant_id = $1 AND sku = $2',[tenantId,b.sku]); if (r.rowCount===0) return res.status(404).json({ error:'Product not found' }); product=r.rows[0]; } else { const r=await query('SELECT * FROM products WHERE tenant_id = $1 AND id = $2',[tenantId,b.product_id]); if (r.rowCount===0) return res.status(404).json({ error:'Product not found' }); product=r.rows[0]; }
    const oldPrice=Number(product.price||0); await query('INSERT INTO price_history (product_id, sku, old_price, new_price, reason, effective_date, created_at) VALUES ($1,$2,$3,$4,$5,CURRENT_DATE,NOW())',[product.id, product.sku, isNaN(oldPrice)?null:oldPrice, b.new_price, b.reason||null]); const u=await query('UPDATE products SET price = $1, updated_at = NOW() WHERE id = $2 RETURNING *',[b.new_price, product.id]); res.json({ success:true, product:u.rows[0] }); }catch(e){ next(e); }
});

app.get('/price/history', requireAnyRole(['manager','admin','ops','accountant']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const sku=req.query.sku; if (!sku) return res.status(400).json({ error:'sku required' }); const p=await query('SELECT id FROM products WHERE tenant_id = $1 AND sku = $2',[tenantId, sku]); if (p.rowCount===0) return res.json({ success:true, history: [] }); const r=await query('SELECT * FROM price_history WHERE product_id = $1 ORDER BY created_at DESC LIMIT 200',[p.rows[0].id]); res.json({ success:true, history: r.rows }); }catch(e){ next(e); }
});

app.post('/price/quote', requireAnyRole(['manager','admin','ops','cashier','accountant']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const b=Quote.parse(req.body); const items=[]; let subtotal=0; for (const it of b.items){ const r=await query('SELECT sku, price, name, tax_rate FROM products WHERE tenant_id = $1 AND sku = $2',[tenantId, it.sku]); if (r.rowCount===0) return res.status(404).json({ error:`SKU ${it.sku} not found` }); const price=Number(r.rows[0].price||0); const lineTotal=price*it.quantity; subtotal+=lineTotal; items.push({ sku: it.sku, name: r.rows[0].name, unit_price: price, quantity: it.quantity, line_total: Number(lineTotal.toFixed(2)), tax_rate: Number(r.rows[0].tax_rate||0) }); }
    res.json({ success:true, subtotal: Number(subtotal.toFixed(2)), items }); }catch(e){ next(e); }
});

app.get('/healthz', (req,res)=> res.json({ status:'ok', service:'pricing_engine' }));
app.get('/readyz', (req,res)=> res.json({ status:'ready', service:'pricing_engine' }));
app.get('/stats', (req,res)=> res.json({ uptime: Math.round((Date.now()-started)/1000) }));
const PORT = process.env.PORT || 8963;

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

app.listen(PORT, ()=> console.log('Pricing Engine listening on', PORT));
