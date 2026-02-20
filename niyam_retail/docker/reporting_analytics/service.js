// Reporting & Analytics — revenue, AR, and audit listing
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

const Range=z.object({ from: z.coerce.date(), to: z.coerce.date() });

// Dashboard summary stats
app.get('/dashboard', requireAnyRole(['accountant','manager','admin']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    // Today's stats
    const today = new Date();
    const startOfDay = new Date(today.setHours(0,0,0,0));
    
    const salesR = await query(`SELECT COUNT(*)::int AS count, COALESCE(SUM(total),0)::numeric AS total FROM pos_transactions WHERE tenant_id = $1 AND created_at >= $2`,[tenantId, startOfDay]);
    const invoicesR = await query(`SELECT COUNT(*)::int AS count, COALESCE(SUM(total),0)::numeric AS total FROM invoices WHERE tenant_id = $1 AND issue_date >= $2`,[tenantId, startOfDay]);
    const customersR = await query(`SELECT COUNT(*)::int AS count FROM customers WHERE tenant_id = $1 AND created_at >= $2`,[tenantId, startOfDay]);
    const pendingOrdersR = await query(`SELECT COUNT(*)::int AS count FROM incoming_orders WHERE tenant_id = $1 AND status = 'pending'`,[tenantId]);
    
    res.json({
      success: true,
      today_sales: { count: salesR.rows[0]?.count || 0, total: parseFloat(salesR.rows[0]?.total) || 0 },
      today_invoices: { count: invoicesR.rows[0]?.count || 0, total: parseFloat(invoicesR.rows[0]?.total) || 0 },
      new_customers: customersR.rows[0]?.count || 0,
      pending_orders: pendingOrdersR.rows[0]?.count || 0
    });
  }catch(e){ next(e); }
});

// Revenue reports
app.get('/reports/revenue', requireAnyRole(['accountant','manager','admin']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const q=Range.parse(req.query); const r=await query(`SELECT status, COUNT(*)::int AS count, COALESCE(SUM(total),0)::numeric AS total, COALESCE(SUM(amount_paid),0)::numeric AS paid FROM invoices WHERE tenant_id = $1 AND issue_date BETWEEN $2 AND $3 GROUP BY status`,[tenantId,q.from,q.to]); res.json({ success:true, from:q.from, to:q.to, by_status:r.rows }); }catch(e){ next(e); }
});

// Sales reports by period
app.get('/reports/sales', requireAnyRole(['accountant','manager','admin']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    const q=Range.parse(req.query);
    const period = req.query.period || 'day'; // day, week, month
    
    let dateFormat;
    if (period === 'month') dateFormat = 'YYYY-MM';
    else if (period === 'week') dateFormat = 'IYYY-IW';
    else dateFormat = 'YYYY-MM-DD';
    
    const r = await query(`
      SELECT TO_CHAR(created_at, $4) AS period,
             COUNT(*)::int AS transactions,
             COALESCE(SUM(total),0)::numeric AS revenue,
             COALESCE(AVG(total),0)::numeric AS avg_transaction
      FROM pos_transactions 
      WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
      GROUP BY TO_CHAR(created_at, $4)
      ORDER BY period
    `,[tenantId, q.from, q.to, dateFormat]);
    
    res.json({ success:true, from:q.from, to:q.to, period, data: r.rows });
  }catch(e){ next(e); }
});

// Top products report
app.get('/reports/top-products', requireAnyRole(['accountant','manager','admin']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    const q=Range.parse(req.query);
    const limit = Math.min(parseInt(req.query.limit||'10',10), 100);
    
    const r = await query(`
      SELECT p.sku, p.name, 
             COALESCE(SUM((item->>'quantity')::int),0)::int AS quantity_sold,
             COALESCE(SUM((item->>'quantity')::int * (item->>'price')::numeric),0)::numeric AS revenue
      FROM pos_transactions t,
           LATERAL jsonb_array_elements(t.items) AS item
      JOIN products p ON p.sku = item->>'sku' AND p.tenant_id = t.tenant_id
      WHERE t.tenant_id = $1 AND t.created_at BETWEEN $2 AND $3
      GROUP BY p.sku, p.name
      ORDER BY revenue DESC
      LIMIT $4
    `,[tenantId, q.from, q.to, limit]);
    
    res.json({ success:true, from:q.from, to:q.to, products: r.rows });
  }catch(e){ next(e); }
});

// Accounts receivable aging
app.get('/reports/ar-aging', requireAnyRole(['accountant','manager','admin']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    const r = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE due_date >= CURRENT_DATE)::int AS current,
        COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - 30)::int AS days_1_30,
        COUNT(*) FILTER (WHERE due_date < CURRENT_DATE - 30 AND due_date >= CURRENT_DATE - 60)::int AS days_31_60,
        COUNT(*) FILTER (WHERE due_date < CURRENT_DATE - 60 AND due_date >= CURRENT_DATE - 90)::int AS days_61_90,
        COUNT(*) FILTER (WHERE due_date < CURRENT_DATE - 90)::int AS over_90,
        COALESCE(SUM(total - amount_paid) FILTER (WHERE status != 'paid'),0)::numeric AS total_outstanding
      FROM invoices WHERE tenant_id = $1 AND status != 'paid'
    `,[tenantId]);
    
    res.json({ success:true, aging: r.rows[0] });
  }catch(e){ next(e); }
});

// Inventory value report
app.get('/reports/inventory-value', requireAnyRole(['accountant','manager','admin']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    const r = await query(`
      SELECT 
        COUNT(*)::int AS total_products,
        COALESCE(SUM(i.quantity),0)::int AS total_units,
        COALESCE(SUM(i.quantity * p.cost_price),0)::numeric AS total_cost_value,
        COALESCE(SUM(i.quantity * p.price),0)::numeric AS total_retail_value
      FROM inventory i
      JOIN products p ON p.id = i.product_id AND p.tenant_id = i.tenant_id
      WHERE i.tenant_id = $1
    `,[tenantId]);
    
    res.json({ success:true, inventory: r.rows[0] });
  }catch(e){ next(e); }
});

// Export report data
app.get('/reports/export', requireAnyRole(['accountant','manager','admin']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    const q=Range.parse(req.query);
    const reportType = req.query.type || 'sales';
    
    let data;
    if (reportType === 'sales') {
      const r = await query(`SELECT * FROM pos_transactions WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3 ORDER BY created_at`,[tenantId, q.from, q.to]);
      data = r.rows;
    } else if (reportType === 'invoices') {
      const r = await query(`SELECT * FROM invoices WHERE tenant_id = $1 AND issue_date BETWEEN $2 AND $3 ORDER BY issue_date`,[tenantId, q.from, q.to]);
      data = r.rows;
    } else {
      return res.status(400).json({ error: 'Invalid report type' });
    }
    
    res.json({ success:true, type: reportType, from:q.from, to:q.to, count: data.length, data });
  }catch(e){ next(e); }
});

// Audit log
app.get('/audit', requireAnyRole(['manager','admin','ops','accountant']), async (req,res,next)=>{
  try{ 
    const tenantId=getTenantId(req);
    const limit = Math.min(parseInt(req.query.limit||'100',10), 500); 
    const action = req.query.action;
    const entity = req.query.entity;
    
    let sql = 'SELECT * FROM audit_log WHERE 1=1';
    const params = [];
    
    if (action) { params.push(action); sql += ` AND action = $${params.length}`; }
    if (entity) { params.push(entity); sql += ` AND entity_type = $${params.length}`; }
    
    params.push(limit);
    sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;
    
    const r=await query(sql, params); 
    res.json({ success:true, audit: r.rows }); 
  }catch(e){ next(e); }
});

// Audit stats
app.get('/audit/stats', requireAnyRole(['manager','admin','ops','accountant']), async (req,res,next)=>{
  try{
    const r = await query(`
      SELECT action, COUNT(*)::int AS count 
      FROM audit_log 
      WHERE created_at >= CURRENT_DATE - 30
      GROUP BY action
      ORDER BY count DESC
    `);
    res.json({ success:true, by_action: r.rows });
  }catch(e){ next(e); }
});

app.get('/healthz', (req,res)=> res.json({ status:'ok', service:'reporting_analytics' }));
app.get('/readyz', (req,res)=> res.json({ status:'ready', service:'reporting_analytics' }));
app.get('/stats', (req,res)=> res.json({ uptime: Math.round((Date.now()-started)/1000) }));
const PORT = process.env.PORT || 8814;

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

app.listen(PORT, ()=> console.log('Reporting & Analytics listening on', PORT));
