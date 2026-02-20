// Reports & BI Dashboard Service - Niyam Hospitality
// Business intelligence with custom reports and KPI dashboards

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const promClient = require('prom-client');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');

let db, sdk, kvStore;
try {
  db = require('../../../../db/postgres');
  sdk = require('../../../../platform/sdk/node');
  kvStore = require('../../../../platform/nats/kv_store');
} catch (_) {
  db = { query: async () => ({ rows: [] }), getClient: async () => ({ query: async () => ({ rows: [], rowCount: 0 }), release: () => {} }) };
  sdk = { publishEnvelope: async () => {} };
  kvStore = { connect: async () => {} };
}

const { query } = db;
const { publishEnvelope } = sdk;

const app = express();
const SERVICE_NAME = 'reports_bi';
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
app.get('/metrics', async (req, res) => { res.set('Content-Type', registry.contentType); res.end(await registry.metrics()); });

const SKIP_AUTH = (process.env.SKIP_AUTH || 'true').toLowerCase() === 'true';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

app.use((req, res, next) => {
  if (SKIP_AUTH) return next();
  const token = req.headers.authorization?.split(' ')[1];
  if (token) { try { req.user = jwt.verify(token, JWT_SECRET); } catch (e) {} }
  next();
});

function getTenantId(req) { return req.headers['x-tenant-id'] || req.user?.tenant_id || DEFAULT_TENANT_ID; }

let natsReady = false;
(async () => { try { await kvStore.connect(); natsReady = true; } catch (e) {} })();

// ============================================
// EXECUTIVE DASHBOARD KPIs
// ============================================

app.get('/dashboard/executive', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { from_date, to_date } = req.query;
    const fromDate = from_date || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
    const toDate = to_date || new Date().toISOString().split('T')[0];
    
    const [occupancy, revenue, adr, revpar, bookings, guests] = await Promise.all([
      // Occupancy Rate
      query(`
        SELECT 
          DATE(d) as date,
          COALESCE(COUNT(DISTINCT b.room_id)::float / NULLIF((SELECT COUNT(*) FROM hotel_rooms WHERE tenant_id = $1), 0) * 100, 0) as occupancy
        FROM generate_series($2::date, $3::date, '1 day') d
        LEFT JOIN hotel_bookings b ON DATE(b.check_in_date) <= d AND DATE(b.check_out_date) > d 
          AND b.tenant_id = $1 AND b.status IN ('confirmed', 'checked_in', 'checked_out')
        GROUP BY DATE(d)
        ORDER BY date
      `, [tenantId, fromDate, toDate]),
      
      // Total Revenue
      query(`
        SELECT SUM(total_amount) as total, SUM(paid_amount) as collected
        FROM hotel_bookings
        WHERE tenant_id = $1 AND check_in_date >= $2 AND check_in_date <= $3 AND status IN ('checked_in', 'checked_out')
      `, [tenantId, fromDate, toDate]),
      
      // ADR (Average Daily Rate)
      query(`
        SELECT AVG(total_amount / GREATEST(1, EXTRACT(DAY FROM check_out_date - check_in_date))) as adr
        FROM hotel_bookings
        WHERE tenant_id = $1 AND check_in_date >= $2 AND check_in_date <= $3 AND status IN ('checked_in', 'checked_out')
      `, [tenantId, fromDate, toDate]),
      
      // RevPAR (Revenue Per Available Room)
      query(`
        SELECT 
          COALESCE(SUM(b.total_amount) / NULLIF((SELECT COUNT(*) FROM hotel_rooms WHERE tenant_id = $1) * ($3::date - $2::date + 1), 0), 0) as revpar
        FROM hotel_bookings b
        WHERE b.tenant_id = $1 AND b.check_in_date >= $2 AND b.check_in_date <= $3 AND b.status IN ('checked_in', 'checked_out')
      `, [tenantId, fromDate, toDate]),
      
      // Booking Stats
      query(`
        SELECT 
          COUNT(*) as total_bookings,
          COUNT(*) FILTER (WHERE source = 'booking_engine') as direct_bookings,
          COUNT(*) FILTER (WHERE source = 'travel_agent') as agent_bookings,
          COUNT(*) FILTER (WHERE source IN ('ota', 'channel_manager')) as ota_bookings
        FROM hotel_bookings
        WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3
      `, [tenantId, fromDate, toDate]),
      
      // Guest Stats
      query(`
        SELECT 
          COUNT(DISTINCT guest_id) as unique_guests,
          COUNT(DISTINCT guest_id) FILTER (WHERE guest_id IN (
            SELECT guest_id FROM hotel_bookings WHERE tenant_id = $1 GROUP BY guest_id HAVING COUNT(*) > 1
          )) as repeat_guests
        FROM hotel_bookings
        WHERE tenant_id = $1 AND check_in_date >= $2 AND check_in_date <= $3
      `, [tenantId, fromDate, toDate])
    ]);
    
    res.json({
      success: true,
      dashboard: {
        period: { from: fromDate, to: toDate },
        kpis: {
          avg_occupancy: Math.round(occupancy.rows.reduce((sum, r) => sum + parseFloat(r.occupancy || 0), 0) / occupancy.rows.length),
          total_revenue: parseFloat(revenue.rows[0]?.total || 0),
          collected_revenue: parseFloat(revenue.rows[0]?.collected || 0),
          adr: parseFloat(adr.rows[0]?.adr || 0),
          revpar: parseFloat(revpar.rows[0]?.revpar || 0),
          total_bookings: parseInt(bookings.rows[0]?.total_bookings || 0),
          direct_ratio: bookings.rows[0]?.total_bookings > 0 
            ? Math.round(bookings.rows[0].direct_bookings / bookings.rows[0].total_bookings * 100) 
            : 0,
          unique_guests: parseInt(guests.rows[0]?.unique_guests || 0),
          repeat_guest_ratio: guests.rows[0]?.unique_guests > 0 
            ? Math.round(guests.rows[0].repeat_guests / guests.rows[0].unique_guests * 100) 
            : 0
        },
        occupancy_trend: occupancy.rows
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// REVENUE REPORTS
// ============================================

app.get('/reports/revenue', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { from_date, to_date, group_by } = req.query;
    
    let groupByClause = 'DATE(check_in_date)';
    if (group_by === 'week') groupByClause = "DATE_TRUNC('week', check_in_date)";
    else if (group_by === 'month') groupByClause = "DATE_TRUNC('month', check_in_date)";
    else if (group_by === 'room_type') groupByClause = 'r.room_type';
    else if (group_by === 'source') groupByClause = 'source';
    
    const result = await query(`
      SELECT 
        ${groupByClause} as period,
        COUNT(*) as bookings,
        SUM(b.total_amount) as gross_revenue,
        SUM(b.paid_amount) as collected,
        AVG(b.total_amount / GREATEST(1, EXTRACT(DAY FROM b.check_out_date - b.check_in_date))) as adr,
        SUM(EXTRACT(DAY FROM b.check_out_date - b.check_in_date)) as room_nights
      FROM hotel_bookings b
      JOIN hotel_rooms r ON b.room_id = r.id
      WHERE b.tenant_id = $1 AND b.check_in_date >= $2 AND b.check_in_date <= $3
        AND b.status IN ('checked_in', 'checked_out')
      GROUP BY ${groupByClause}
      ORDER BY 1
    `, [tenantId, from_date, to_date]);
    
    res.json({ success: true, report: result.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// OCCUPANCY REPORTS
// ============================================

app.get('/reports/occupancy', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { from_date, to_date, room_type } = req.query;
    
    let sql = `
      WITH room_counts AS (
        SELECT room_type, COUNT(*) as total_rooms FROM hotel_rooms WHERE tenant_id = $1 GROUP BY room_type
      ),
      daily_occupancy AS (
        SELECT 
          DATE(d) as date,
          r.room_type,
          COUNT(DISTINCT b.room_id) as occupied_rooms
        FROM generate_series($2::date, $3::date, '1 day') d
        CROSS JOIN (SELECT DISTINCT room_type FROM hotel_rooms WHERE tenant_id = $1) r
        LEFT JOIN hotel_bookings b ON DATE(b.check_in_date) <= d AND DATE(b.check_out_date) > d 
          AND b.tenant_id = $1 AND b.status IN ('confirmed', 'checked_in', 'checked_out')
        LEFT JOIN hotel_rooms rm ON b.room_id = rm.id AND rm.room_type = r.room_type
        GROUP BY DATE(d), r.room_type
      )
      SELECT 
        d.date, d.room_type, d.occupied_rooms, rc.total_rooms,
        ROUND(d.occupied_rooms::numeric / NULLIF(rc.total_rooms, 0) * 100, 1) as occupancy_pct
      FROM daily_occupancy d
      JOIN room_counts rc ON d.room_type = rc.room_type
    `;
    const params = [tenantId, from_date, to_date];
    
    if (room_type) { sql += ` WHERE d.room_type = $4`; params.push(room_type); }
    sql += ' ORDER BY d.date, d.room_type';
    
    const result = await query(sql, params);
    res.json({ success: true, report: result.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// GUEST REPORTS
// ============================================

app.get('/reports/guests', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { from_date, to_date, segment } = req.query;
    
    let sql = `
      SELECT 
        g.id, g.full_name, g.email, g.country, s.segment_name,
        COUNT(b.id) as total_stays,
        SUM(b.total_amount) as lifetime_value,
        MAX(b.check_out_date) as last_stay,
        MIN(b.check_in_date) as first_stay
      FROM hotel_guests g
      LEFT JOIN hotel_guest_segments s ON g.segment_id = s.id
      LEFT JOIN hotel_bookings b ON g.id = b.guest_id AND b.status = 'checked_out'
      WHERE g.tenant_id = $1
    `;
    const params = [tenantId];
    let idx = 2;
    
    if (from_date) { sql += ` AND b.check_in_date >= $${idx++}`; params.push(from_date); }
    if (to_date) { sql += ` AND b.check_in_date <= $${idx++}`; params.push(to_date); }
    if (segment) { sql += ` AND s.segment_code = $${idx++}`; params.push(segment); }
    
    sql += ' GROUP BY g.id, s.segment_name ORDER BY lifetime_value DESC NULLS LAST LIMIT 100';
    
    const result = await query(sql, params);
    res.json({ success: true, report: result.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// SOURCE ANALYSIS
// ============================================

app.get('/reports/sources', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { from_date, to_date } = req.query;
    
    const result = await query(`
      SELECT 
        COALESCE(source, 'direct') as source,
        COUNT(*) as bookings,
        SUM(total_amount) as revenue,
        AVG(total_amount) as avg_booking_value,
        SUM(EXTRACT(DAY FROM check_out_date - check_in_date)) as room_nights,
        AVG(EXTRACT(DAY FROM check_out_date - check_in_date)) as avg_los
      FROM hotel_bookings
      WHERE tenant_id = $1 AND check_in_date >= $2 AND check_in_date <= $3
        AND status IN ('confirmed', 'checked_in', 'checked_out')
      GROUP BY COALESCE(source, 'direct')
      ORDER BY revenue DESC
    `, [tenantId, from_date, to_date]);
    
    res.json({ success: true, report: result.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// F&B REPORTS
// ============================================

app.get('/reports/fnb', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { from_date, to_date } = req.query;
    
    const [posRevenue, roomService, covers] = await Promise.all([
      query(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as orders,
          SUM(total_amount) as revenue,
          AVG(total_amount) as avg_check
        FROM hotel_pos_orders
        WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3 AND status = 'completed'
        GROUP BY DATE(created_at)
        ORDER BY date
      `, [tenantId, from_date, to_date]),
      
      query(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as orders,
          SUM(total_amount) as revenue
        FROM hotel_room_service_orders
        WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3 AND status = 'delivered'
        GROUP BY DATE(created_at)
        ORDER BY date
      `, [tenantId, from_date, to_date]),
      
      query(`
        SELECT 
          SUM((SELECT COUNT(*) FROM jsonb_array_elements(items))) as total_items_sold,
          COUNT(*) as total_orders
        FROM hotel_pos_orders
        WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3 AND status = 'completed'
      `, [tenantId, from_date, to_date])
    ]);
    
    res.json({
      success: true,
      report: {
        pos_daily: posRevenue.rows,
        room_service_daily: roomService.rows,
        summary: covers.rows[0]
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// HOUSEKEEPING REPORTS
// ============================================

app.get('/reports/housekeeping', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { from_date, to_date } = req.query;
    
    const result = await query(`
      SELECT 
        assigned_to,
        u.full_name as staff_name,
        COUNT(*) as total_tasks,
        COUNT(*) FILTER (WHERE t.status = 'completed') as completed_tasks,
        AVG(EXTRACT(EPOCH FROM (t.completed_at - t.assigned_at)) / 60) as avg_completion_minutes
      FROM hotel_housekeeping_tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.tenant_id = $1 AND t.created_at >= $2 AND t.created_at <= $3
      GROUP BY assigned_to, u.full_name
      ORDER BY completed_tasks DESC
    `, [tenantId, from_date, to_date]);
    
    res.json({ success: true, report: result.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// CUSTOM REPORT BUILDER
// ============================================

app.get('/reports/custom', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    
    const result = await query(`
      SELECT * FROM hotel_custom_reports WHERE tenant_id = $1 ORDER BY name
    `, [tenantId]);
    
    res.json({ success: true, reports: result.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/reports/custom', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { name, description, query_template, parameters, schedule } = req.body;
    
    const result = await query(`
      INSERT INTO hotel_custom_reports (tenant_id, name, description, query_template, parameters, schedule, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [tenantId, name, description, query_template, parameters, schedule, req.user?.id]);
    
    res.json({ success: true, report: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// SCHEDULED REPORTS
// ============================================

app.get('/schedules', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    
    const result = await query(`
      SELECT s.*, r.name as report_name
      FROM hotel_report_schedules s
      JOIN hotel_custom_reports r ON s.report_id = r.id
      WHERE s.tenant_id = $1
      ORDER BY s.next_run_at
    `, [tenantId]);
    
    res.json({ success: true, schedules: result.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/schedules', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { report_id, frequency, recipients, format, is_active } = req.body;
    
    const result = await query(`
      INSERT INTO hotel_report_schedules (tenant_id, report_id, frequency, recipients, format, is_active, next_run_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
    `, [tenantId, report_id, frequency, recipients, format || 'pdf', is_active !== false]);
    
    res.json({ success: true, schedule: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// EXPORT
// ============================================

app.post('/export', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { report_type, from_date, to_date, format } = req.body;
    
    // Get report data based on type
    let data = [];
    if (report_type === 'revenue') {
      const result = await query(`
        SELECT DATE(check_in_date) as date, COUNT(*) as bookings, SUM(total_amount) as revenue
        FROM hotel_bookings WHERE tenant_id = $1 AND check_in_date >= $2 AND check_in_date <= $3
        GROUP BY DATE(check_in_date) ORDER BY date
      `, [tenantId, from_date, to_date]);
      data = result.rows;
    }
    
    // For CSV format
    if (format === 'csv' && data.length > 0) {
      const headers = Object.keys(data[0]).join(',');
      const rows = data.map(row => Object.values(row).join(','));
      const csv = [headers, ...rows].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${report_type}_${from_date}_${to_date}.csv"`);
      return res.send(csv);
    }
    
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/healthz', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME }));
app.get('/readyz', (req, res) => res.json({ status: natsReady ? 'ready' : 'degraded' }));


// ============================================
// SERVE EMBEDDED UI (Auto-generated)
// ============================================

const UI_DIST = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(UI_DIST)) {
  console.log('📦 Serving embedded UI from ui/dist');
  app.use(express.static(UI_DIST));
  
  // SPA fallback - serve index.html for non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || 
        req.path.startsWith('/health') ||
        req.path.startsWith('/metrics') ||
        req.path.startsWith('/readyz')) {
      return next();
    }
    res.sendFile(path.join(UI_DIST, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('<html><body style="font-family:system-ui;text-align:center;padding:2rem;"><h1>Service Running</h1><p><a href="/healthz">Health Check</a></p></body></html>');
  });
}

const PORT = process.env.PORT || 8938;
app.listen(PORT, () => console.log(`✅ Reports & BI Dashboard Service listening on ${PORT}`));
