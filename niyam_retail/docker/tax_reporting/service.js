// Tax Reporting — summaries by period and rate
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

const Range=z.object({ from: z.coerce.date(), to: z.coerce.date(), include_unpaid: z.coerce.boolean().optional() });

// Dashboard stats for tax
app.get('/dashboard', requireAnyRole(['accountant','manager','admin']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear, 11, 31);
    
    // YTD tax collected
    const ytdR = await query(`
      SELECT COALESCE(SUM(tax),0)::numeric AS total_tax, COUNT(*)::int AS invoice_count
      FROM invoices WHERE tenant_id = $1 AND issue_date BETWEEN $2 AND $3 AND status = 'paid'
    `,[tenantId, yearStart, yearEnd]);
    
    // Current quarter
    const quarter = Math.floor(new Date().getMonth() / 3);
    const qStart = new Date(currentYear, quarter * 3, 1);
    const qEnd = new Date(currentYear, quarter * 3 + 3, 0);
    const qtrR = await query(`
      SELECT COALESCE(SUM(tax),0)::numeric AS total_tax
      FROM invoices WHERE tenant_id = $1 AND issue_date BETWEEN $2 AND $3 AND status = 'paid'
    `,[tenantId, qStart, qEnd]);
    
    // Pending tax (unpaid invoices)
    const pendingR = await query(`
      SELECT COALESCE(SUM(tax),0)::numeric AS pending_tax
      FROM invoices WHERE tenant_id = $1 AND status IN ('draft','sent','overdue')
    `,[tenantId]);
    
    res.json({
      success: true,
      ytd_tax: parseFloat(ytdR.rows[0]?.total_tax) || 0,
      ytd_invoices: ytdR.rows[0]?.invoice_count || 0,
      quarter_tax: parseFloat(qtrR.rows[0]?.total_tax) || 0,
      pending_tax: parseFloat(pendingR.rows[0]?.pending_tax) || 0,
      current_quarter: quarter + 1,
      current_year: currentYear
    });
  }catch(e){ next(e); }
});

// Tax summary for date range
app.get('/tax/summary', requireAnyRole(['accountant','manager','admin']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const q=Range.parse({ ...req.query, include_unpaid: req.query.include_unpaid==='true' }); const statuses=q.include_unpaid? ['draft','sent','paid','overdue'] : ['paid']; const r=await query(`SELECT COALESCE(SUM(subtotal),0)::numeric AS subtotal, COALESCE(SUM(tax),0)::numeric AS tax, COALESCE(SUM(total),0)::numeric AS total, COUNT(*)::int AS count FROM invoices WHERE tenant_id = $1 AND issue_date BETWEEN $2 AND $3 AND status = ANY($4)`,[tenantId,q.from,q.to,statuses]); res.json({ success:true, from:q.from, to:q.to, include_unpaid:!!q.include_unpaid, summary:r.rows[0] }); }catch(e){ next(e); }
});

// Tax breakdown by rate
app.get('/tax/by_rate', requireAnyRole(['accountant','manager','admin']), async (req,res,next)=>{
  try{ const tenantId=getTenantId(req); const q=Range.parse({ ...req.query, include_unpaid: req.query.include_unpaid==='true' }); const statuses=q.include_unpaid? ['draft','sent','paid','overdue'] : ['paid']; const r=await query(`SELECT p.tax_rate::numeric AS tax_rate, COALESCE(SUM((it->>'quantity')::int * (it->>'price')::numeric * (p.tax_rate/100.0)),0)::numeric AS tax_amount FROM invoices i, LATERAL jsonb_array_elements(i.items) it JOIN products p ON p.sku = it->>'sku' AND p.tenant_id = i.tenant_id WHERE i.tenant_id = $1 AND i.issue_date BETWEEN $2 AND $3 AND i.status = ANY($4) GROUP BY p.tax_rate ORDER BY p.tax_rate`,[tenantId,q.from,q.to,statuses]); res.json({ success:true, from:q.from, to:q.to, by_rate:r.rows }); }catch(e){ next(e); }
});

// Monthly tax report
app.get('/tax/monthly', requireAnyRole(['accountant','manager','admin']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    const year = parseInt(req.query.year) || new Date().getFullYear();
    
    const r = await query(`
      SELECT 
        EXTRACT(MONTH FROM issue_date)::int AS month,
        COALESCE(SUM(subtotal),0)::numeric AS subtotal,
        COALESCE(SUM(tax),0)::numeric AS tax,
        COALESCE(SUM(total),0)::numeric AS total,
        COUNT(*)::int AS invoice_count
      FROM invoices 
      WHERE tenant_id = $1 AND EXTRACT(YEAR FROM issue_date) = $2 AND status = 'paid'
      GROUP BY EXTRACT(MONTH FROM issue_date)
      ORDER BY month
    `,[tenantId, year]);
    
    res.json({ success:true, year, monthly: r.rows });
  }catch(e){ next(e); }
});

// Quarterly tax report
app.get('/tax/quarterly', requireAnyRole(['accountant','manager','admin']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    const year = parseInt(req.query.year) || new Date().getFullYear();
    
    const r = await query(`
      SELECT 
        EXTRACT(QUARTER FROM issue_date)::int AS quarter,
        COALESCE(SUM(subtotal),0)::numeric AS subtotal,
        COALESCE(SUM(tax),0)::numeric AS tax,
        COALESCE(SUM(total),0)::numeric AS total,
        COUNT(*)::int AS invoice_count
      FROM invoices 
      WHERE tenant_id = $1 AND EXTRACT(YEAR FROM issue_date) = $2 AND status = 'paid'
      GROUP BY EXTRACT(QUARTER FROM issue_date)
      ORDER BY quarter
    `,[tenantId, year]);
    
    res.json({ success:true, year, quarterly: r.rows });
  }catch(e){ next(e); }
});

// Tax liability report (what's owed)
app.get('/tax/liability', requireAnyRole(['accountant','manager','admin']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    
    // Collected but not yet remitted (assuming all collected tax is liability)
    const collectedR = await query(`
      SELECT 
        COALESCE(SUM(tax) FILTER (WHERE status = 'paid'),0)::numeric AS collected,
        COALESCE(SUM(tax) FILTER (WHERE status IN ('draft','sent','overdue')),0)::numeric AS pending
      FROM invoices WHERE tenant_id = $1
    `,[tenantId]);
    
    res.json({ 
      success:true, 
      collected: parseFloat(collectedR.rows[0]?.collected) || 0,
      pending: parseFloat(collectedR.rows[0]?.pending) || 0,
      total_liability: parseFloat(collectedR.rows[0]?.collected) || 0 // In practice, this would subtract what's been remitted
    });
  }catch(e){ next(e); }
});

// Export tax data for filing
app.get('/tax/export', requireAnyRole(['accountant','manager','admin']), async (req,res,next)=>{
  try{
    const tenantId=getTenantId(req);
    const q=Range.parse(req.query);
    
    const r = await query(`
      SELECT 
        invoice_number, issue_date, due_date, customer_id,
        subtotal, tax, total, status
      FROM invoices 
      WHERE tenant_id = $1 AND issue_date BETWEEN $2 AND $3 AND status = 'paid'
      ORDER BY issue_date
    `,[tenantId, q.from, q.to]);
    
    const totalR = await query(`
      SELECT COALESCE(SUM(subtotal),0)::numeric AS subtotal, COALESCE(SUM(tax),0)::numeric AS tax, COALESCE(SUM(total),0)::numeric AS total
      FROM invoices WHERE tenant_id = $1 AND issue_date BETWEEN $2 AND $3 AND status = 'paid'
    `,[tenantId, q.from, q.to]);
    
    res.json({ 
      success:true, 
      from: q.from, 
      to: q.to, 
      count: r.rows.length,
      totals: totalR.rows[0],
      invoices: r.rows 
    });
  }catch(e){ next(e); }
});

app.get('/healthz', (req,res)=> res.json({ status:'ok', service:'tax_reporting' }));
app.get('/readyz', (req,res)=> res.json({ status:'ready', service:'tax_reporting' }));
app.get('/stats', (req,res)=> res.json({ uptime: Math.round((Date.now()-started)/1000) }));
const PORT = process.env.PORT || 8973;

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

app.listen(PORT, ()=> console.log('Tax Reporting listening on', PORT));
