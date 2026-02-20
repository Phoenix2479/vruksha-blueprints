// Inventory Procurement — Purchase Orders (Phase 1 minimal)
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

const POCreate=z.object({ supplier_id: z.string().uuid(), store_id: z.string().uuid().optional(), items: z.array(z.object({ sku: z.string(), quantity: z.coerce.number().int().positive(), unit_cost: z.coerce.number().positive() })).min(1), notes: z.string().optional() });

app.post('/pos', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const b=POCreate.parse(req.body); const subtotal=b.items.reduce((s,it)=>s+(it.quantity*it.unit_cost),0); const total=subtotal; const poNum=`PO-${Date.now()}`; const itemsJson = JSON.stringify(b.items);
    const r=await query(`INSERT INTO purchase_orders (tenant_id, po_number, supplier_id, store_id, items, subtotal, total, status, order_date, created_at, updated_at, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',CURRENT_DATE,NOW(),NOW(),$8) RETURNING *`,[tenantId,poNum,b.supplier_id,b.store_id||DEFAULT_STORE_ID,itemsJson,subtotal,total,b.notes||null]); res.json({ success:true, po:r.rows[0] }); }catch(e){ next(e); }
});

app.get('/pos', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const r=await query('SELECT * FROM purchase_orders WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 200',[tenantId]); res.json({ success:true, pos:r.rows }); }catch(e){ next(e); }
});

// Receive goods against PO - triggers accounting event
app.post('/pos/:po_id/receive', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { po_id } = req.params;
    const { received_items, notes } = req.body; // [{ sku, quantity_received }]
    
    await client.query('BEGIN');
    
    // Get PO
    const poRes = await client.query(
      'SELECT * FROM purchase_orders WHERE id = $1 AND tenant_id = $2',
      [po_id, tenantId]
    );
    
    if (poRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    
    const po = poRes.rows[0];
    
    // Update PO status
    await client.query(
      `UPDATE purchase_orders SET status = 'received', received_date = NOW(), updated_at = NOW(), notes = COALESCE($1, notes) WHERE id = $2`,
      [notes, po_id]
    );
    
    await client.query('COMMIT');
    
    // Publish accounting event
    await publishEnvelope('retail.inventory.purchase.received.v1', 1, {
      purchase_order_id: po_id,
      po_number: po.po_number,
      supplier_id: po.supplier_id,
      store_id: po.store_id,
      items: po.items,
      subtotal: parseFloat(po.subtotal),
      total_amount: parseFloat(po.total),
      purchase_date: new Date().toISOString(),
      vendor_name: po.supplier_name || null,
      notes: notes || po.notes
    });
    
    res.json({ success: true, message: 'Goods received', po_id });
  } catch (e) {
    await client.query('ROLLBACK');
    next(e);
  } finally {
    client.release();
  }
});

// Approve PO
app.post('/pos/:po_id/approve', requireAnyRole(['manager','admin']), async (req,res,next)=>{
  try {
    const tenantId = getTenantId(req);
    const { po_id } = req.params;
    
    const r = await query(
      `UPDATE purchase_orders SET status = 'approved', updated_at = NOW() WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [po_id, tenantId]
    );
    
    if (r.rowCount === 0) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    
    await publishEnvelope('retail.inventory.purchase.approved.v1', 1, {
      purchase_order_id: po_id,
      po_number: r.rows[0].po_number,
      total_amount: parseFloat(r.rows[0].total)
    });
    
    res.json({ success: true, po: r.rows[0] });
  } catch (e) {
    next(e);
  }
});

app.get('/healthz', (req,res)=> res.json({ status: 'ok', service:'inventory_procurement' }));
app.get('/readyz', (req,res)=> res.json({ status: 'ready', service:'inventory_procurement' }));
app.get('/stats', (req,res)=> res.json({ uptime: Math.round((Date.now()-started)/1000) }));
const PORT = process.env.PORT || 8982;

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

app.listen(PORT, ()=> console.log('Inventory Procurement listening on', PORT));
