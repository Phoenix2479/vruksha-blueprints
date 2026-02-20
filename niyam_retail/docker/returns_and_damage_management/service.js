// Returns & Damage Management Service — Return authorization, refunds, restocking
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

// Metrics
const registry=new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
app.get('/metrics', async (req,res)=>{ res.set('Content-Type', registry.contentType); res.end(await registry.metrics()); });

// Validation
const ReturnCreate=z.object({ transaction_id: z.string().uuid().optional(), customer_id: z.string().uuid().optional(), store_id: z.string().uuid().optional(), items: z.array(z.object({ sku: z.string(), quantity: z.coerce.number().int().positive(), unit_price: z.coerce.number().nonnegative(), reason: z.string().optional() })).min(1), refund_method: z.string().optional(), reason: z.string().optional(), notes: z.string().optional() });
const ReturnStatus=z.object({ status: z.enum(['pending','approved','rejected','completed']), notes: z.string().optional() });
const DamageReport=z.object({ product_id: z.string().uuid().optional(), sku: z.string(), quantity: z.coerce.number().int().positive(), damage_type: z.enum(['broken','expired','defective','water_damage','other']), description: z.string().optional(), action: z.enum(['write_off','return_to_vendor','repair','dispose']).optional() });

// Dashboard stats
app.get('/stats', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    
    const returnsR = await query(`
      SELECT 
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE status = 'approved') AS approved,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COALESCE(SUM(total),0)::numeric AS total_value,
        COALESCE(SUM(total) FILTER (WHERE status = 'completed'),0)::numeric AS refunded_value
      FROM returns WHERE tenant_id = $1
    `,[tenantId]);
    
    // Today's returns
    const todayR = await query(`
      SELECT COUNT(*) AS count, COALESCE(SUM(total),0)::numeric AS value
      FROM returns WHERE tenant_id = $1 AND created_at >= CURRENT_DATE
    `,[tenantId]);
    
    res.json({
      success: true,
      total_returns: parseInt(returnsR.rows[0]?.total) || 0,
      pending_returns: parseInt(returnsR.rows[0]?.pending) || 0,
      approved_returns: parseInt(returnsR.rows[0]?.approved) || 0,
      completed_returns: parseInt(returnsR.rows[0]?.completed) || 0,
      total_value: parseFloat(returnsR.rows[0]?.total_value) || 0,
      refunded_value: parseFloat(returnsR.rows[0]?.refunded_value) || 0,
      today_returns: parseInt(todayR.rows[0]?.count) || 0,
      today_value: parseFloat(todayR.rows[0]?.value) || 0
    });
  }catch(e){ next(e); }
});

// Create a return
app.post('/returns', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const b=ReturnCreate.parse(req.body); const subtotal=b.items.reduce((s,it)=>s+(it.quantity*it.unit_price),0); const tax=0; const total=subtotal; const retNum=`RET-${Date.now()}`; const itemsJson=JSON.stringify(b.items); const r=await query(`INSERT INTO returns (tenant_id, return_number, transaction_id, customer_id, store_id, items, subtotal, tax, total, refund_method, reason, status, created_at, updated_at, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending',NOW(),NOW(),$12) RETURNING *`,[tenantId,retNum,b.transaction_id||null,b.customer_id||null,b.store_id||DEFAULT_STORE_ID,itemsJson,subtotal,tax,total,b.refund_method||null,b.reason||null,b.notes||null]); res.json({ success:true, return:r.rows[0] }); }catch(e){ next(e); }
});

// List returns with filtering
app.get('/returns', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{ 
    const tenantId=getTenantId(req); 
    const status = req.query.status;
    const from = req.query.from;
    const to = req.query.to;
    
    let sql = 'SELECT * FROM returns WHERE tenant_id = $1';
    const params = [tenantId];
    
    if (status) { params.push(status); sql += ` AND status = $${params.length}`; }
    if (from) { params.push(new Date(from)); sql += ` AND created_at >= $${params.length}`; }
    if (to) { params.push(new Date(to)); sql += ` AND created_at <= $${params.length}`; }
    
    sql += ' ORDER BY created_at DESC LIMIT 200';
    
    const r=await query(sql, params); 
    res.json({ success:true, returns:r.rows }); 
  }catch(e){ next(e); }
});

// Get single return
app.get('/returns/:id', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{ 
    const tenantId=getTenantId(req); 
    const id=req.params.id;
    const r=await query('SELECT * FROM returns WHERE tenant_id = $1 AND id = $2',[tenantId, id]); 
    if (r.rowCount===0) return res.status(404).json({ error:'Not found' });
    res.json({ success:true, return:r.rows[0] }); 
  }catch(e){ next(e); }
});

// Update return status
app.patch('/returns/:id/status', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{ 
    const tenantId=getTenantId(req); 
    const id=req.params.id; 
    const { status, notes }=ReturnStatus.parse(req.body); 
    
    let sql = 'UPDATE returns SET status = $1, updated_at = NOW()';
    const params = [status];
    
    if (notes) { params.push(notes); sql += `, notes = COALESCE(notes, '') || E'\n' || $${params.length}`; }
    
    params.push(tenantId, id);
    sql += ` WHERE tenant_id = $${params.length - 1} AND id = $${params.length} RETURNING *`;
    
    const r=await query(sql, params); 
    if (r.rowCount===0) return res.status(404).json({ error:'Not found' }); 
    res.json({ success:true, return:r.rows[0] }); 
  }catch(e){ next(e); }
});

// Process refund for approved return
app.post('/returns/:id/refund', requireAnyRole(['manager','admin']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    const id=req.params.id;
    const { refund_method } = req.body || {};
    
    // Get the return
    const retR = await query('SELECT * FROM returns WHERE tenant_id = $1 AND id = $2',[tenantId, id]);
    if (retR.rowCount===0) return res.status(404).json({ error:'Not found' });
    
    const ret = retR.rows[0];
    if (ret.status !== 'approved') {
      return res.status(400).json({ error:'Return must be approved before refund' });
    }
    
    // Update to completed
    const r = await query(
      'UPDATE returns SET status = $1, refund_method = COALESCE($2, refund_method), updated_at = NOW() WHERE tenant_id = $3 AND id = $4 RETURNING *',
      ['completed', refund_method, tenantId, id]
    );
    
    res.json({ success:true, return:r.rows[0] });
  }catch(e){ next(e); }
});

// Report damaged goods
app.post('/damage', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    const b=DamageReport.parse(req.body);
    
    // Log damage (could be a separate table, using returns for simplicity)
    const items = JSON.stringify([{
      sku: b.sku,
      quantity: b.quantity,
      damage_type: b.damage_type,
      description: b.description,
      action: b.action
    }]);
    
    const r = await query(
      `INSERT INTO returns (tenant_id, return_number, store_id, items, subtotal, tax, total, reason, status, created_at, updated_at, notes) 
       VALUES ($1,$2,$3,$4,0,0,0,'damage_report','completed',NOW(),NOW(),$5) RETURNING *`,
      [tenantId, `DMG-${Date.now()}`, DEFAULT_STORE_ID, items, b.description || 'Damage report']
    );
    
    res.json({ success:true, damage_report: r.rows[0] });
  }catch(e){ next(e); }
});

// Get damage reports
app.get('/damage', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    const r = await query(
      "SELECT * FROM returns WHERE tenant_id = $1 AND reason = 'damage_report' ORDER BY created_at DESC LIMIT 200",
      [tenantId]
    );
    res.json({ success:true, damage_reports: r.rows });
  }catch(e){ next(e); }
});

// Get return reasons summary
app.get('/reasons', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    const r = await query(`
      SELECT reason, COUNT(*) AS count, COALESCE(SUM(total),0)::numeric AS total_value
      FROM returns WHERE tenant_id = $1 AND reason IS NOT NULL AND reason != 'damage_report'
      GROUP BY reason ORDER BY count DESC
    `,[tenantId]);
    res.json({ success:true, reasons: r.rows });
  }catch(e){ next(e); }
});

// Health
app.get('/healthz', (req,res)=> res.json({ status:'ok', service:'returns_and_damage_management' }));
app.get('/readyz', (req,res)=> res.json({ status:'ready', service:'returns_and_damage_management' }));
app.get('/stats', (req,res)=> res.json({ uptime: Math.round((Date.now()-started)/1000) }));
const PORT = process.env.PORT || 8820;

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

app.listen(PORT, ()=> console.log('Returns & Damage Management listening on', PORT));
