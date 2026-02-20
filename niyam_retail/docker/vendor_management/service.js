// Vendor Management — supplier CRUD & KPIs (Phase 1 minimal)
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

// Metrics
const registry=new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
app.get('/metrics', async (req,res)=>{ res.set('Content-Type', registry.contentType); res.end(await registry.metrics()); });

// Validation
const VendorCreate=z.object({ code: z.string().min(1), name: z.string().min(1), email: z.string().email().optional(), phone: z.string().optional(), city: z.string().optional(), country: z.string().optional(), payment_terms: z.string().optional(), lead_time: z.coerce.number().int().optional() });
const VendorUpdate=z.object({ name: z.string().min(1).optional(), email: z.string().email().optional(), phone: z.string().optional(), city: z.string().optional(), country: z.string().optional(), payment_terms: z.string().optional(), lead_time: z.coerce.number().int().optional(), status: z.enum(['active','inactive','pending']).optional() });

// Dashboard stats
app.get('/stats', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    
    const vendorsR = await query(`
      SELECT 
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'active') AS active,
        COALESCE(AVG(rating),0)::numeric AS avg_rating
      FROM suppliers WHERE tenant_id = $1
    `,[tenantId]);
    
    // Get pending payments (simulated from purchase orders if they existed)
    // For now just return 0
    
    res.json({
      success: true,
      total_vendors: parseInt(vendorsR.rows[0]?.total) || 0,
      active: parseInt(vendorsR.rows[0]?.active) || 0,
      avg_rating: parseFloat(vendorsR.rows[0]?.avg_rating) || 0,
      pending_payments: 0
    });
  }catch(e){ next(e); }
});

// List vendors with filtering
app.get('/list', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{ 
    const tenantId=getTenantId(req); 
    const status = req.query.status;
    const search = req.query.search;
    
    let sql = 'SELECT * FROM suppliers WHERE tenant_id = $1';
    const params = [tenantId];
    
    if (status) { params.push(status); sql += ` AND status = $${params.length}`; }
    if (search) { params.push(`%${search}%`); sql += ` AND (name ILIKE $${params.length} OR code ILIKE $${params.length})`; }
    
    sql += ' ORDER BY created_at DESC LIMIT 200';
    
    const r=await query(sql, params); 
    res.json({ success:true, vendors:r.rows }); 
  }catch(e){ next(e); }
});

// Legacy endpoint for compatibility
app.get('/vendors', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const r=await query('SELECT * FROM suppliers WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 200',[tenantId]); res.json({ success:true, vendors:r.rows }); }catch(e){ next(e); }
});

// Get single vendor
app.get('/:id', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{ 
    const tenantId=getTenantId(req); 
    const id=req.params.id;
    // Skip if it's a reserved route
    if (['stats', 'list', 'vendors', 'healthz', 'readyz', 'metrics'].includes(id)) return next();
    
    const r=await query('SELECT * FROM suppliers WHERE tenant_id = $1 AND id = $2',[tenantId, id]); 
    if (r.rowCount===0) return res.status(404).json({ error:'Not found' });
    res.json({ success:true, vendor:r.rows[0] }); 
  }catch(e){ next(e); }
});

// Create vendor
app.post('/vendors', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const b=VendorCreate.parse(req.body); const r=await query('INSERT INTO suppliers (id, code, name, email, phone, city, country, payment_terms, lead_time, status, rating, created_at, updated_at, tenant_id) VALUES (uuid_generate_v4(),$1,$2,$3,$4,$5,$6,$7,$8,$9,0,NOW(),NOW(),$10) RETURNING *',[b.code,b.name,b.email||null,b.phone||null,b.city||null,b.country||null,b.payment_terms||'Net 30',b.lead_time||7,'active',tenantId]); res.json({ success:true, vendor:r.rows[0] }); }catch(e){ next(e); }
});

// Also support POST / for create
app.post('/', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const b=VendorCreate.parse(req.body); const r=await query('INSERT INTO suppliers (id, code, name, email, phone, city, country, payment_terms, lead_time, status, rating, created_at, updated_at, tenant_id) VALUES (uuid_generate_v4(),$1,$2,$3,$4,$5,$6,$7,$8,$9,0,NOW(),NOW(),$10) RETURNING *',[b.code,b.name,b.email||null,b.phone||null,b.city||null,b.country||null,b.payment_terms||'Net 30',b.lead_time||7,'active',tenantId]); res.json({ success:true, vendor:r.rows[0] }); }catch(e){ next(e); }
});

// Update vendor
app.patch('/:id', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    const id=req.params.id;
    const b=VendorUpdate.parse(req.body);
    
    const updates = [];
    const params = [];
    
    if (b.name !== undefined) { params.push(b.name); updates.push(`name = $${params.length}`); }
    if (b.email !== undefined) { params.push(b.email); updates.push(`email = $${params.length}`); }
    if (b.phone !== undefined) { params.push(b.phone); updates.push(`phone = $${params.length}`); }
    if (b.city !== undefined) { params.push(b.city); updates.push(`city = $${params.length}`); }
    if (b.country !== undefined) { params.push(b.country); updates.push(`country = $${params.length}`); }
    if (b.payment_terms !== undefined) { params.push(b.payment_terms); updates.push(`payment_terms = $${params.length}`); }
    if (b.lead_time !== undefined) { params.push(b.lead_time); updates.push(`lead_time = $${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); updates.push(`status = $${params.length}`); }
    
    if (updates.length === 0) {
      return res.status(400).json({ error:'No fields to update' });
    }
    
    params.push(tenantId, id);
    const sql = `UPDATE suppliers SET ${updates.join(', ')}, updated_at = NOW() WHERE tenant_id = $${params.length - 1} AND id = $${params.length} RETURNING *`;
    
    const r=await query(sql, params);
    if (r.rowCount===0) return res.status(404).json({ error:'Not found' });
    res.json({ success:true, vendor:r.rows[0] });
  }catch(e){ next(e); }
});

// Delete vendor (soft delete by setting status to inactive)
app.delete('/:id', requireAnyRole(['manager','admin']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    const id=req.params.id;
    
    const r=await query('UPDATE suppliers SET status = $1, updated_at = NOW() WHERE tenant_id = $2 AND id = $3 RETURNING *',['inactive', tenantId, id]);
    if (r.rowCount===0) return res.status(404).json({ error:'Not found' });
    res.json({ success:true, vendor:r.rows[0] });
  }catch(e){ next(e); }
});

// Rate vendor
app.post('/:id/rate', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    const id=req.params.id;
    const { rating } = req.body || {};
    
    if (typeof rating !== 'number' || rating < 0 || rating > 5) {
      return res.status(400).json({ error:'Rating must be between 0 and 5' });
    }
    
    const r=await query('UPDATE suppliers SET rating = $1, updated_at = NOW() WHERE tenant_id = $2 AND id = $3 RETURNING *',[rating, tenantId, id]);
    if (r.rowCount===0) return res.status(404).json({ error:'Not found' });
    res.json({ success:true, vendor:r.rows[0] });
  }catch(e){ next(e); }
});

// Get vendor performance (simulated)
app.get('/:id/performance', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    const id=req.params.id;
    
    const vendorR = await query('SELECT * FROM suppliers WHERE tenant_id = $1 AND id = $2',[tenantId, id]);
    if (vendorR.rowCount===0) return res.status(404).json({ error:'Not found' });
    
    // Return simulated performance data
    res.json({
      success: true,
      vendor_id: id,
      total_orders: 0,
      total_value: 0,
      on_time_delivery_rate: 0,
      quality_score: vendorR.rows[0].rating || 0,
      avg_lead_time: vendorR.rows[0].lead_time || 7
    });
  }catch(e){ next(e); }
});

// Health
app.get('/healthz', (req,res)=> res.json({ status: 'ok', service:'vendor_management' }));
app.get('/readyz', (req,res)=> res.json({ status: 'ready', service:'vendor_management' }));
app.get('/stats', (req,res)=> res.json({ uptime: Math.round((Date.now()-started)/1000) }));
const PORT = process.env.PORT || 8981;

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

app.listen(PORT, ()=> console.log('Vendor Management listening on', PORT));
