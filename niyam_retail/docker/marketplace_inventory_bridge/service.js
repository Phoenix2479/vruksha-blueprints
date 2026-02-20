// Marketplace Inventory Bridge — channel sync (Phase 1 minimal)
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const promClient = require('prom-client');
const { z } = require('zod');
const { query } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');

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

const Push=z.object({ items: z.array(z.object({ sku: z.string().min(1), quantity: z.coerce.number().int().min(0), price: z.coerce.number().optional() })).min(1) });
const ChannelCreate=z.object({ name: z.string().min(1), type: z.enum(['amazon','flipkart','shopify','woocommerce','other']), credentials: z.record(z.any()).optional(), settings: z.record(z.any()).optional() });

// Dashboard stats
app.get('/stats', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    
    // Count channels by status (simulated - in real app would have channels table)
    const logsR = await query(`
      SELECT 
        COUNT(DISTINCT channel) AS total_channels,
        COUNT(*) FILTER (WHERE status = 'completed') AS successful_syncs,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed_syncs,
        COUNT(*) FILTER (WHERE status = 'queued' OR status = 'processing') AS pending_syncs
      FROM channel_sync_logs WHERE tenant_id = $1
    `,[tenantId]);
    
    // Revenue from synced orders (simulated)
    const revenueR = await query(`
      SELECT COALESCE(SUM((payload->>'total')::numeric),0)::numeric AS total_revenue
      FROM channel_sync_logs 
      WHERE tenant_id = $1 AND action = 'order_import' AND status = 'completed'
    `,[tenantId]);
    
    res.json({
      success: true,
      total_channels: parseInt(logsR.rows[0]?.total_channels) || 0,
      connected: parseInt(logsR.rows[0]?.total_channels) || 0, // Assuming all are connected
      total_revenue: parseFloat(revenueR.rows[0]?.total_revenue) || 0,
      pending_orders: parseInt(logsR.rows[0]?.pending_syncs) || 0
    });
  }catch(e){ next(e); }
});

// List channels (simulated from logs)
app.get('/channels', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    
    const r = await query(`
      SELECT 
        channel AS name,
        channel AS type,
        'connected' AS status,
        MAX(created_at) AS last_sync,
        COUNT(*) FILTER (WHERE action = 'inventory_push') AS total_products,
        COUNT(*) FILTER (WHERE action = 'order_import') AS total_orders,
        COALESCE(SUM((payload->>'total')::numeric) FILTER (WHERE action = 'order_import'),0)::numeric AS revenue
      FROM channel_sync_logs 
      WHERE tenant_id = $1
      GROUP BY channel
    `,[tenantId]);
    
    // Map to expected format with IDs
    const channels = r.rows.map((row, idx) => ({
      id: idx + 1,
      name: row.name,
      type: row.type || 'other',
      status: row.status,
      last_sync: row.last_sync,
      total_products: parseInt(row.total_products) || 0,
      total_orders: parseInt(row.total_orders) || 0,
      revenue: parseFloat(row.revenue) || 0
    }));
    
    res.json({ success:true, channels });
  }catch(e){ next(e); }
});

// Sync a channel (trigger inventory push)
app.post('/channels/:id/sync', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    const channelId = req.params.id;
    
    // Get all products for sync
    const productsR = await query(`
      SELECT p.sku, i.quantity, p.price 
      FROM products p 
      LEFT JOIN inventory i ON i.product_id = p.id AND i.tenant_id = p.tenant_id
      WHERE p.tenant_id = $1 AND p.status = 'active'
      LIMIT 1000
    `,[tenantId]);
    
    const items = productsR.rows.map(p => ({
      sku: p.sku,
      quantity: parseInt(p.quantity) || 0,
      price: parseFloat(p.price) || 0
    }));
    
    // Create sync log
    const r = await query(
      'INSERT INTO channel_sync_logs (tenant_id, channel, action, payload, status) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [tenantId, `channel_${channelId}`, 'inventory_push', { items, count: items.length }, 'queued']
    );
    
    await publishEnvelope('retail.channel.inventory.push.queued.v1',1,{ tenant_id:tenantId, channel: `channel_${channelId}`, id:r.rows[0].id, count: items.length });
    
    res.json({ success:true, sync: r.rows[0] });
  }catch(e){ next(e); }
});

// List orders from channels
app.get('/orders', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    const channelId = req.query.channel_id;
    
    let sql = `
      SELECT id, channel AS channel_name, payload, status, created_at
      FROM channel_sync_logs 
      WHERE tenant_id = $1 AND action = 'order_import'
    `;
    const params = [tenantId];
    
    if (channelId) {
      params.push(`channel_${channelId}`);
      sql += ` AND channel = $${params.length}`;
    }
    
    sql += ' ORDER BY created_at DESC LIMIT 200';
    
    const r = await query(sql, params);
    
    // Map to expected order format
    const orders = r.rows.map((row, idx) => ({
      id: row.id,
      channel_id: parseInt(row.channel_name?.replace('channel_', '')) || 0,
      channel_name: row.channel_name,
      external_order_id: row.payload?.external_id || `EXT-${row.id}`,
      status: row.status === 'completed' ? 'delivered' : 'pending',
      customer_name: row.payload?.customer_name || 'Unknown',
      total: parseFloat(row.payload?.total) || 0,
      created_at: row.created_at
    }));
    
    res.json({ success:true, orders });
  }catch(e){ next(e); }
});

// Push inventory to specific channel
app.post('/channels/:channel/inventory_push', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const channel=req.params.channel; const b=Push.parse(req.body); const r=await query('INSERT INTO channel_sync_logs (tenant_id, channel, action, payload, status) VALUES ($1,$2,$3,$4,$5) RETURNING *',[tenantId, channel, 'inventory_push', b, 'queued']); await publishEnvelope('retail.channel.inventory.push.queued.v1',1,{ tenant_id:tenantId, channel, id:r.rows[0].id, count: b.items.length }); res.json({ success:true, log: r.rows[0] }); }catch(e){ next(e); }
});

// Get sync logs
app.get('/logs', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{ 
    const tenantId=getTenantId(req); 
    const channel = req.query.channel;
    const status = req.query.status;
    
    let sql = 'SELECT * FROM channel_sync_logs WHERE tenant_id = $1';
    const params = [tenantId];
    
    if (channel) { params.push(channel); sql += ` AND channel = $${params.length}`; }
    if (status) { params.push(status); sql += ` AND status = $${params.length}`; }
    
    sql += ' ORDER BY created_at DESC LIMIT 200';
    
    const r=await query(sql, params); 
    res.json({ success:true, logs:r.rows }); 
  }catch(e){ next(e); }
});

// Update sync log status
app.patch('/logs/:id', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const id=req.params.id; const { status, last_error } = req.body || {}; if (!status) return res.status(400).json({ error:'status required' }); const r=await query('UPDATE channel_sync_logs SET status = $1, attempts = attempts + 1, last_error = $2, updated_at = NOW() WHERE tenant_id = $3 AND id = $4 RETURNING *',[status, last_error || null, tenantId, id]); if (r.rowCount===0) return res.status(404).json({ error:'Not found' }); res.json({ success:true, log:r.rows[0] }); }catch(e){ next(e); }
});

// Retry failed sync
app.post('/logs/:id/retry', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    const id=req.params.id;
    
    const r = await query('UPDATE channel_sync_logs SET status = $1, last_error = NULL, updated_at = NOW() WHERE tenant_id = $2 AND id = $3 RETURNING *',['queued', tenantId, id]);
    if (r.rowCount===0) return res.status(404).json({ error:'Not found' });
    
    await publishEnvelope('retail.channel.sync.retry.v1',1,{ tenant_id:tenantId, id });
    
    res.json({ success:true, log:r.rows[0] });
  }catch(e){ next(e); }
});

app.get('/healthz', (req,res)=> res.json({ status: 'ok', service:'marketplace_inventory_bridge' }));
app.get('/readyz', (req,res)=> res.json({ status: 'ready', service:'marketplace_inventory_bridge' }));
app.get('/stats', (req,res)=> res.json({ uptime: Math.round((Date.now()-started)/1000) }));
const PORT = process.env.PORT || 8957;

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

app.listen(PORT, ()=> console.log('Marketplace Inventory Bridge listening on', PORT));
