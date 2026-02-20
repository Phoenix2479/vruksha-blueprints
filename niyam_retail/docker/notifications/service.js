const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const promClient = require('prom-client');
const { z } = require('zod');
const { query } = require('@vruksha/platform/db/postgres');
const { publishEnvelope, subscribe } = require('@vruksha/platform/sdk/node');

const app = express();
app.use(express.json());
const started = Date.now();

const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
app.use(helmet({ contentSecurityPolicy: false }));
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
const httpHistogram=new promClient.Histogram({ name:'notifications_http_request_duration_seconds', help:'HTTP duration', labelNames:['method','route','status'], buckets:[0.005,0.01,0.05,0.1,0.5,1,2,5]});
registry.registerMetric(httpHistogram);
app.use((req,res,next)=>{ const s=process.hrtime.bigint(); res.on('finish',()=>{ const d=Number(process.hrtime.bigint()-s)/1e9; const route=req.route?.path||req.path; httpHistogram.labels(req.method, route, String(res.statusCode)).observe(d); }); next(); });
app.get('/metrics', async (req,res)=>{ res.set('Content-Type', registry.contentType); res.end(await registry.metrics()); });

// Validation
const Send=z.object({ channel: z.enum(['email','sms','push']), recipient: z.string().min(3), template: z.any().optional(), payload: z.any().optional(), scheduled_at: z.string().datetime().optional() });
const NotificationCreate=z.object({ type: z.enum(['info','warning','error','success']).default('info'), category: z.enum(['inventory','sales','customer','system','order']).default('system'), title: z.string().min(1), message: z.string().min(1), action_url: z.string().optional(), action_label: z.string().optional() });
const SettingsUpdate=z.object({ email_enabled: z.boolean().optional(), push_enabled: z.boolean().optional(), categories: z.record(z.boolean()).optional() });

// Endpoints

// List notifications with filtering
app.get('/list', requireAnyRole(['manager','admin','ops','cashier']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    const unreadOnly = req.query.unreadOnly === 'true';
    const category = req.query.category;
    let sql = 'SELECT * FROM notifications WHERE tenant_id = $1';
    const params = [tenantId];
    if (unreadOnly) { sql += ' AND read = false'; }
    if (category) { params.push(category); sql += ` AND category = $${params.length}`; }
    sql += ' ORDER BY created_at DESC LIMIT 200';
    const r = await query(sql, params);
    res.json({ success:true, notifications: r.rows });
  }catch(e){ next(e); }
});

// Create a notification
app.post('/create', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    const b=NotificationCreate.parse(req.body);
    const r=await query(
      'INSERT INTO notifications (tenant_id, type, category, title, message, action_url, action_label, read, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,false,NOW()) RETURNING *',
      [tenantId, b.type, b.category, b.title, b.message, b.action_url||null, b.action_label||null]
    );
    await publishEnvelope('retail.notifications.created.v1',1,{ tenant_id:tenantId, id:r.rows[0].id, type:b.type, category:b.category });
    res.json({ success:true, notification: r.rows[0] });
  }catch(e){ next(e); }
});

// Mark single notification as read
app.post('/:id/read', requireAnyRole(['manager','admin','ops','cashier']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    const id=req.params.id;
    const r=await query('UPDATE notifications SET read = true WHERE tenant_id = $1 AND id = $2 RETURNING *',[tenantId,id]);
    if (r.rowCount===0) return res.status(404).json({ error:'Not found' });
    res.json({ success:true, notification: r.rows[0] });
  }catch(e){ next(e); }
});

// Mark all notifications as read
app.post('/read-all', requireAnyRole(['manager','admin','ops','cashier']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    await query('UPDATE notifications SET read = true WHERE tenant_id = $1 AND read = false',[tenantId]);
    res.json({ success:true });
  }catch(e){ next(e); }
});

// Delete a notification
app.delete('/:id', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    const id=req.params.id;
    const r=await query('DELETE FROM notifications WHERE tenant_id = $1 AND id = $2 RETURNING id',[tenantId,id]);
    if (r.rowCount===0) return res.status(404).json({ error:'Not found' });
    res.json({ success:true });
  }catch(e){ next(e); }
});

// Get notification stats
app.get('/stats', requireAnyRole(['manager','admin','ops','cashier']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    const totalR=await query('SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE read = false)::int AS unread FROM notifications WHERE tenant_id = $1',[tenantId]);
    const catR=await query('SELECT category, COUNT(*)::int AS count FROM notifications WHERE tenant_id = $1 GROUP BY category',[tenantId]);
    const byCategory = {};
    catR.rows.forEach(row => { byCategory[row.category] = row.count; });
    res.json({ success:true, total: totalR.rows[0]?.total || 0, unread: totalR.rows[0]?.unread || 0, by_category: byCategory });
  }catch(e){ next(e); }
});

// Get notification settings
app.get('/settings', requireAnyRole(['manager','admin','ops','cashier']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    const r=await query('SELECT * FROM notification_settings WHERE tenant_id = $1',[tenantId]);
    if (r.rowCount===0) {
      // Return defaults if no settings exist
      res.json({ success:true, settings: { email_enabled: true, push_enabled: true, categories: { inventory: true, sales: true, customer: true, system: true, order: true } } });
    } else {
      res.json({ success:true, settings: r.rows[0] });
    }
  }catch(e){ next(e); }
});

// Update notification settings
app.put('/settings', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    const b=SettingsUpdate.parse(req.body);
    const existing=await query('SELECT id FROM notification_settings WHERE tenant_id = $1',[tenantId]);
    if (existing.rowCount===0) {
      await query(
        'INSERT INTO notification_settings (tenant_id, email_enabled, push_enabled, categories) VALUES ($1,$2,$3,$4)',
        [tenantId, b.email_enabled ?? true, b.push_enabled ?? true, JSON.stringify(b.categories || {})]
      );
    } else {
      const updates = [];
      const params = [tenantId];
      if (b.email_enabled !== undefined) { params.push(b.email_enabled); updates.push(`email_enabled = $${params.length}`); }
      if (b.push_enabled !== undefined) { params.push(b.push_enabled); updates.push(`push_enabled = $${params.length}`); }
      if (b.categories !== undefined) { params.push(JSON.stringify(b.categories)); updates.push(`categories = $${params.length}`); }
      if (updates.length > 0) {
        await query(`UPDATE notification_settings SET ${updates.join(', ')}, updated_at = NOW() WHERE tenant_id = $1`, params);
      }
    }
    res.json({ success:true });
  }catch(e){ next(e); }
});

// Legacy send endpoint (for outbox/queue)
app.post('/send', requireAnyRole(['manager','admin','accountant','ops']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    const b=Send.parse(req.body);
    const status = b.scheduled_at ? 'scheduled' : 'queued';
    const scheduledAt = b.scheduled_at ? new Date(b.scheduled_at) : null;
    const r=await query(
      'INSERT INTO notifications_outbox (tenant_id, channel, recipient, template, payload, status, scheduled_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [tenantId,b.channel,b.recipient,b.template||null,b.payload||null,status,scheduledAt]
    );
    await publishEnvelope('retail.notifications.queued.v1',1,{ tenant_id:tenantId, id:r.rows[0].id, channel:b.channel });
    res.json({ success:true, notification: r.rows[0] });
  }catch(e){ next(e); }
});

// Legacy queue endpoint (for outbox)
app.get('/queue', requireAnyRole(['manager','admin','ops']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const r=await query('SELECT * FROM notifications_outbox WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 200',[tenantId]); res.json({ success:true, notifications: r.rows }); }catch(e){ next(e); }
});

// Health
app.get('/healthz', (req,res)=> res.json({ status: 'ok', service: 'notifications' }));
app.get('/readyz', (req,res)=> res.json({ status: 'ready', service: 'notifications' }));
app.get('/stats', (req,res)=> res.json({ uptime: Math.round((Date.now()-started)/1000) }));
const PORT = process.env.PORT || 8960;

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

app.listen(PORT, ()=> console.log('Notifications service listening on', PORT));
