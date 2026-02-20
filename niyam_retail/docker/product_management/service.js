// Product Management Service — attributes/variants/categories CRUD (Phase 1 minimal)
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const promClient = require('prom-client');
const { z } = require('zod');
const { query, getClient } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');

const app = express();
app.use(express.json());

const DEFAULT_TENANT_ID='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
app.use(helmet({ contentSecurityPolicy:false }));
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
const httpHistogram=new promClient.Histogram({ name:'pm_http_request_duration_seconds', help:'HTTP duration', labelNames:['method','route','status'], buckets:[0.005,0.01,0.05,0.1,0.5,1,2,5]});
registry.registerMetric(httpHistogram);
app.use((req,res,next)=>{ const s=process.hrtime.bigint(); res.on('finish',()=>{ const d=Number(process.hrtime.bigint()-s)/1e9; const route=req.route?.path||req.path; httpHistogram.labels(req.method, route, String(res.statusCode)).observe(d); }); next(); });
app.get('/metrics', async (req,res)=>{ res.set('Content-Type', registry.contentType); res.end(await registry.metrics()); });

// Validation
const CategoryCreate=z.object({ name: z.string().min(1), parent_id: z.string().uuid().optional() });
const VariantCreate=z.object({ sku: z.string().min(1), attributes: z.any().optional(), price_override: z.coerce.number().optional() });
const AttrsCreate=z.object({ attributes: z.array(z.object({ key: z.string().min(1), value: z.string().optional() })).min(1) });

// Categories
app.get('/categories', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const r=await query('SELECT * FROM categories WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 200',[tenantId]); res.json({ success:true, categories: r.rows }); }catch(e){ next(e); }
});
app.post('/categories', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const b=CategoryCreate.parse(req.body); const r=await query('INSERT INTO categories (tenant_id, name, parent_id) VALUES ($1,$2,$3) RETURNING *',[tenantId,b.name,b.parent_id||null]); res.json({ success:true, category: r.rows[0] }); }catch(e){ next(e); }
});

// Variants
app.get('/products/:id/variants', requireAnyRole(['manager','admin']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const id=req.params.id; const r=await query('SELECT * FROM product_variants WHERE tenant_id = $1 AND product_id = $2 ORDER BY created_at DESC',[tenantId,id]); res.json({ success:true, variants: r.rows }); }catch(e){ next(e); }
});
app.post('/products/:id/variants', requireAnyRole(['manager','admin']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const id=req.params.id; const b=VariantCreate.parse(req.body); const r=await query('INSERT INTO product_variants (tenant_id, product_id, sku, attributes, price_override) VALUES ($1,$2,$3,$4,$5) RETURNING *',[tenantId,id,b.sku,b.attributes||null,b.price_override||null]); res.json({ success:true, variant: r.rows[0] }); }catch(e){ next(e); }
});

// Attributes
app.get('/products/:id/attributes', requireAnyRole(['manager','admin']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const id=req.params.id; const r=await query('SELECT attr_key, attr_value, created_at FROM product_attributes WHERE tenant_id = $1 AND product_id = $2 ORDER BY created_at DESC',[tenantId,id]); res.json({ success:true, attributes: r.rows }); }catch(e){ next(e); }
});
app.post('/products/:id/attributes', requireAnyRole(['manager','admin']), async (req,res,next)=>{
  const client=await getClient();
  try{ const tenantId=getTenantId(req); const id=req.params.id; const b=AttrsCreate.parse(req.body); await client.query('BEGIN'); for (const a of b.attributes){ await client.query('INSERT INTO product_attributes (tenant_id, product_id, attr_key, attr_value) VALUES ($1,$2,$3,$4)',[tenantId,id,a.key,a.value||null]); }
    await client.query('COMMIT'); await publishEnvelope('retail.catalog.product.attributes.updated.v1',1,{ tenant_id:tenantId, product_id:id, count:b.attributes.length }); res.json({ success:true }); }catch(e){ await client.query('ROLLBACK'); next(e); } finally { client.release(); }
});

// Product ↔ Category links
app.get('/products/:id/categories', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try { const tenantId=getTenantId(req); const id=req.params.id; const r=await query(`SELECT c.* FROM product_category_links l JOIN categories c ON c.id = l.category_id AND c.tenant_id = l.tenant_id WHERE l.tenant_id = $1 AND l.product_id = $2 ORDER BY c.name ASC`,[tenantId,id]); res.json({ success:true, categories: r.rows }); } catch(e){ next(e); }
});
app.post('/products/:id/categories', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try { const tenantId=getTenantId(req); const id=req.params.id; const category_id = req.body?.category_id; if (!category_id) return res.status(400).json({ error:'category_id required' }); await query('INSERT INTO product_category_links (tenant_id, product_id, category_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',[tenantId,id,category_id]); res.json({ success:true }); } catch(e){ next(e); }
});

// Health
const started=Date.now();
app.get('/healthz',(req,res)=>res.json({ status:'ok', service:'product_management' }));
app.get('/readyz',(req,res)=>res.json({ status:'ready', service:'product_management' }));
app.get('/stats',(req,res)=>res.json({ uptime: Math.round((Date.now()-started)/1000) }));
const PORT=process.env.PORT||8964;

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

app.listen(PORT, ()=> console.log('Product Management service listening on', PORT));
