/**
 * Reports & BI Service - Niyam Hospitality (Max Lite)
 * Consolidated reporting, scheduled reports, data exports
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8947;
const SERVICE_NAME = 'reports_bi';

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) { app.use(express.static(uiPath)); }

app.get('/health', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME, mode: 'lite' }));

async function ensureTables() {
  const db = await initDb();
  
  db.run(`CREATE TABLE IF NOT EXISTS report_templates (
    id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
    description TEXT, category TEXT, report_type TEXT DEFAULT 'standard',
    query_config TEXT, columns TEXT, filters TEXT, default_period TEXT,
    is_system INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1,
    created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS scheduled_reports (
    id TEXT PRIMARY KEY, template_id TEXT NOT NULL, name TEXT NOT NULL,
    schedule TEXT NOT NULL, recipients TEXT, format TEXT DEFAULT 'pdf',
    parameters TEXT, last_run_at TEXT, next_run_at TEXT, last_status TEXT,
    is_active INTEGER DEFAULT 1, created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS report_runs (
    id TEXT PRIMARY KEY, template_id TEXT, scheduled_id TEXT, report_name TEXT,
    parameters TEXT, status TEXT DEFAULT 'pending', started_at TEXT, completed_at TEXT,
    row_count INTEGER, file_path TEXT, file_size INTEGER, error TEXT,
    run_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS saved_reports (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, template_id TEXT,
    parameters TEXT, filters TEXT, is_favorite INTEGER DEFAULT 0,
    created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS dashboards (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
    layout TEXT, widgets TEXT, is_default INTEGER DEFAULT 0,
    created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  // Seed default report templates
  const existing = get(`SELECT COUNT(*) as count FROM report_templates WHERE is_system = 1`);
  if (!existing || existing.count === 0) {
    const templates = [
      { code: 'DAILY_REVENUE', name: 'Daily Revenue Report', category: 'revenue', description: 'Daily revenue breakdown by source' },
      { code: 'OCCUPANCY_REPORT', name: 'Occupancy Report', category: 'operations', description: 'Room occupancy analysis' },
      { code: 'ARRIVALS_DEPARTURES', name: 'Arrivals & Departures', category: 'operations', description: 'Expected arrivals and departures' },
      { code: 'GUEST_HISTORY', name: 'Guest History Report', category: 'guest', description: 'Guest stay history and preferences' },
      { code: 'NIGHT_AUDIT', name: 'Night Audit Summary', category: 'audit', description: 'End of day audit summary' },
      { code: 'AR_AGING', name: 'AR Aging Report', category: 'finance', description: 'Accounts receivable aging analysis' },
      { code: 'HOUSEKEEPING_STATUS', name: 'Housekeeping Status', category: 'operations', description: 'Room cleaning status' },
      { code: 'FNB_SALES', name: 'F&B Sales Report', category: 'fnb', description: 'Food & beverage sales analysis' },
      { code: 'CHANNEL_PERFORMANCE', name: 'Channel Performance', category: 'revenue', description: 'Booking channel analysis' },
      { code: 'RATE_ANALYSIS', name: 'Rate Analysis', category: 'revenue', description: 'ADR and rate trends' }
    ];
    for (const t of templates) {
      run(`INSERT INTO report_templates (id, code, name, description, category, is_system, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)`,
        [generateId(), t.code, t.name, t.description, t.category, timestamp()]);
    }
  }
  
  return db;
}

// REPORT TEMPLATES
app.get('/templates', async (req, res) => {
  try {
    await ensureTables();
    const { category, active_only } = req.query;
    let sql = `SELECT * FROM report_templates WHERE 1=1`;
    const params = [];
    if (category) { sql += ` AND category = ?`; params.push(category); }
    if (active_only === 'true') { sql += ` AND is_active = 1`; }
    sql += ` ORDER BY category, name`;
    res.json({ success: true, templates: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/templates', async (req, res) => {
  try {
    await ensureTables();
    const { code, name, description, category, report_type, query_config, columns, filters, default_period, created_by } = req.body;
    const id = generateId();
    run(`INSERT INTO report_templates (id, code, name, description, category, report_type, query_config, columns, filters, default_period, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, code, name, description, category, report_type || 'standard', JSON.stringify(query_config), JSON.stringify(columns), JSON.stringify(filters), default_period, created_by, timestamp()]);
    res.json({ success: true, template: { id, code, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// RUN REPORTS
app.post('/run/:templateCode', async (req, res) => {
  try {
    await ensureTables();
    const { templateCode } = req.params;
    const { from_date, to_date, filters, run_by } = req.body;
    
    const template = get(`SELECT * FROM report_templates WHERE code = ?`, [templateCode]);
    if (!template) return res.status(404).json({ success: false, error: 'Template not found' });
    
    const runId = generateId();
    const start = from_date || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const end = to_date || new Date().toISOString().split('T')[0];
    
    run(`INSERT INTO report_runs (id, template_id, report_name, parameters, status, started_at, run_by, created_at) VALUES (?, ?, ?, ?, 'running', ?, ?, ?)`,
      [runId, template.id, template.name, JSON.stringify({ from_date: start, to_date: end, filters }), timestamp(), run_by, timestamp()]);
    
    // Execute report based on template code
    let data = [];
    let columns = [];
    
    switch (templateCode) {
      case 'DAILY_REVENUE':
        columns = ['Date', 'Room Revenue', 'F&B Revenue', 'Other Revenue', 'Total Revenue'];
        data = query(`
          SELECT DATE(check_in_date) as date, 
                 SUM(CASE WHEN source != 'fnb' THEN total_amount ELSE 0 END) as room_revenue,
                 SUM(CASE WHEN source = 'fnb' THEN total_amount ELSE 0 END) as fnb_revenue,
                 0 as other_revenue,
                 SUM(total_amount) as total_revenue
          FROM reservations
          WHERE check_in_date BETWEEN ? AND ? AND status IN ('checked_in', 'checked_out')
          GROUP BY DATE(check_in_date) ORDER BY date
        `, [start, end]);
        break;
        
      case 'OCCUPANCY_REPORT':
        columns = ['Date', 'Total Rooms', 'Rooms Sold', 'Occupancy %', 'ADR', 'RevPAR'];
        const totalRooms = get(`SELECT COUNT(*) as count FROM rooms WHERE status != 'out_of_order'`);
        const roomCount = totalRooms?.count || 1;
        data = query(`
          SELECT DATE(check_in_date) as date, ${roomCount} as total_rooms,
                 COUNT(*) as rooms_sold,
                 ROUND(COUNT(*) * 100.0 / ${roomCount}, 1) as occupancy,
                 ROUND(AVG(room_rate), 2) as adr,
                 ROUND(SUM(room_rate) / ${roomCount}, 2) as revpar
          FROM reservations
          WHERE check_in_date BETWEEN ? AND ? AND status IN ('confirmed', 'checked_in', 'checked_out')
          GROUP BY DATE(check_in_date) ORDER BY date
        `, [start, end]);
        break;
        
      case 'ARRIVALS_DEPARTURES':
        columns = ['Date', 'Arrivals', 'Departures', 'In-House'];
        data = query(`
          SELECT d.date,
                 (SELECT COUNT(*) FROM reservations WHERE DATE(check_in_date) = d.date AND status IN ('confirmed', 'checked_in')) as arrivals,
                 (SELECT COUNT(*) FROM reservations WHERE DATE(check_out_date) = d.date AND status IN ('checked_in', 'checked_out')) as departures,
                 (SELECT COUNT(*) FROM reservations WHERE d.date >= DATE(check_in_date) AND d.date < DATE(check_out_date) AND status = 'checked_in') as in_house
          FROM (
            SELECT DATE(check_in_date) as date FROM reservations WHERE check_in_date BETWEEN ? AND ?
            UNION SELECT DATE(check_out_date) FROM reservations WHERE check_out_date BETWEEN ? AND ?
          ) d ORDER BY d.date
        `, [start, end, start, end]);
        break;
        
      case 'GUEST_HISTORY':
        columns = ['Guest Name', 'Email', 'Total Stays', 'Total Revenue', 'Last Stay', 'VIP Level'];
        data = query(`
          SELECT g.name, g.email, COUNT(r.id) as total_stays, 
                 COALESCE(SUM(r.total_amount), 0) as total_revenue,
                 MAX(r.check_out_date) as last_stay, g.vip_level
          FROM guests g
          LEFT JOIN reservations r ON g.id = r.guest_id AND r.status = 'checked_out'
          GROUP BY g.id ORDER BY total_revenue DESC LIMIT 100
        `);
        break;
        
      case 'NIGHT_AUDIT':
        columns = ['Metric', 'Value'];
        const today = new Date().toISOString().split('T')[0];
        const arrivals = get(`SELECT COUNT(*) as count FROM reservations WHERE DATE(check_in_date) = ? AND status IN ('confirmed', 'checked_in')`, [today]);
        const departures = get(`SELECT COUNT(*) as count FROM reservations WHERE DATE(check_out_date) = ? AND status = 'checked_in'`, [today]);
        const revenue = get(`SELECT SUM(total_amount) as amount FROM reservations WHERE DATE(check_in_date) = ? OR DATE(check_out_date) = ?`, [today, today]);
        const inHouse = get(`SELECT COUNT(*) as count FROM reservations WHERE DATE(check_in_date) <= ? AND DATE(check_out_date) > ? AND status = 'checked_in'`, [today, today]);
        data = [
          { metric: 'Date', value: today },
          { metric: 'Arrivals', value: arrivals?.count || 0 },
          { metric: 'Departures', value: departures?.count || 0 },
          { metric: 'In-House', value: inHouse?.count || 0 },
          { metric: 'Revenue', value: revenue?.amount || 0 }
        ];
        break;
        
      case 'HOUSEKEEPING_STATUS':
        columns = ['Room', 'Floor', 'Type', 'Status', 'Assigned To', 'Last Cleaned'];
        data = query(`
          SELECT r.room_number, r.floor, rt.name as room_type, r.housekeeping_status as status,
                 '' as assigned_to, '' as last_cleaned
          FROM rooms r
          LEFT JOIN room_types rt ON r.room_type_id = rt.id
          ORDER BY r.floor, r.room_number
        `);
        break;
        
      case 'FNB_SALES':
        columns = ['Date', 'Outlet', 'Covers', 'Revenue', 'Avg Check'];
        data = query(`
          SELECT DATE(created_at) as date, outlet_name, COUNT(DISTINCT table_number) as covers,
                 SUM(total) as revenue, ROUND(AVG(total), 2) as avg_check
          FROM restaurant_orders
          WHERE created_at BETWEEN ? AND ? AND status = 'served'
          GROUP BY DATE(created_at), outlet_name ORDER BY date, outlet_name
        `, [start, end]);
        break;
        
      case 'CHANNEL_PERFORMANCE':
        columns = ['Channel', 'Bookings', 'Room Nights', 'Revenue', 'ADR', 'Share %'];
        const totalRevenue = get(`SELECT SUM(total_amount) as total FROM reservations WHERE check_in_date BETWEEN ? AND ?`, [start, end]);
        const total = totalRevenue?.total || 1;
        data = query(`
          SELECT COALESCE(source, 'Direct') as channel, COUNT(*) as bookings,
                 COUNT(*) as room_nights, SUM(total_amount) as revenue,
                 ROUND(AVG(room_rate), 2) as adr,
                 ROUND(SUM(total_amount) * 100.0 / ${total}, 1) as share_pct
          FROM reservations
          WHERE check_in_date BETWEEN ? AND ?
          GROUP BY source ORDER BY revenue DESC
        `, [start, end]);
        break;
        
      case 'RATE_ANALYSIS':
        columns = ['Date', 'Room Type', 'BAR Rate', 'Actual ADR', 'Variance'];
        data = query(`
          SELECT DATE(r.check_in_date) as date, rt.name as room_type,
                 rt.base_price as bar_rate, ROUND(AVG(r.room_rate), 2) as actual_adr,
                 ROUND(AVG(r.room_rate) - rt.base_price, 2) as variance
          FROM reservations r
          JOIN rooms rm ON r.room_id = rm.id
          JOIN room_types rt ON rm.room_type_id = rt.id
          WHERE r.check_in_date BETWEEN ? AND ? AND r.status IN ('confirmed', 'checked_in', 'checked_out')
          GROUP BY DATE(r.check_in_date), rt.id ORDER BY date, room_type
        `, [start, end]);
        break;
        
      default:
        data = [];
    }
    
    run(`UPDATE report_runs SET status = 'completed', completed_at = ?, row_count = ? WHERE id = ?`,
      [timestamp(), data.length, runId]);
    
    res.json({ success: true, run_id: runId, template: template.name, period: { from: start, to: end }, columns, data, row_count: data.length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// SCHEDULED REPORTS
app.get('/scheduled', async (req, res) => {
  try {
    await ensureTables();
    const { active_only } = req.query;
    let sql = `SELECT sr.*, rt.name as template_name, rt.code as template_code FROM scheduled_reports sr LEFT JOIN report_templates rt ON sr.template_id = rt.id WHERE 1=1`;
    if (active_only === 'true') sql += ` AND sr.is_active = 1`;
    sql += ` ORDER BY sr.name`;
    res.json({ success: true, scheduled: query(sql).map(s => ({ ...s, recipients: JSON.parse(s.recipients || '[]'), parameters: JSON.parse(s.parameters || '{}') })) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/scheduled', async (req, res) => {
  try {
    await ensureTables();
    const { template_id, name, schedule, recipients, format, parameters, created_by } = req.body;
    const id = generateId();
    run(`INSERT INTO scheduled_reports (id, template_id, name, schedule, recipients, format, parameters, is_active, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, template_id, name, schedule, JSON.stringify(recipients || []), format || 'pdf', JSON.stringify(parameters || {}), created_by, timestamp()]);
    res.json({ success: true, scheduled: { id, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/scheduled/:id', async (req, res) => {
  try {
    await ensureTables();
    const { name, schedule, recipients, format, parameters, is_active } = req.body;
    run(`UPDATE scheduled_reports SET name = COALESCE(?, name), schedule = COALESCE(?, schedule), recipients = COALESCE(?, recipients), format = COALESCE(?, format), parameters = COALESCE(?, parameters), is_active = COALESCE(?, is_active) WHERE id = ?`,
      [name, schedule, recipients ? JSON.stringify(recipients) : null, format, parameters ? JSON.stringify(parameters) : null, is_active, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// REPORT RUNS
app.get('/runs', async (req, res) => {
  try {
    await ensureTables();
    const { template_id, limit = 50 } = req.query;
    let sql = `SELECT rr.*, rt.name as template_name FROM report_runs rr LEFT JOIN report_templates rt ON rr.template_id = rt.id WHERE 1=1`;
    const params = [];
    if (template_id) { sql += ` AND rr.template_id = ?`; params.push(template_id); }
    sql += ` ORDER BY rr.created_at DESC LIMIT ?`;
    params.push(parseInt(limit));
    res.json({ success: true, runs: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// SAVED REPORTS
app.get('/saved', async (req, res) => {
  try {
    await ensureTables();
    const { created_by, favorites_only } = req.query;
    let sql = `SELECT sr.*, rt.name as template_name FROM saved_reports sr LEFT JOIN report_templates rt ON sr.template_id = rt.id WHERE 1=1`;
    const params = [];
    if (created_by) { sql += ` AND sr.created_by = ?`; params.push(created_by); }
    if (favorites_only === 'true') { sql += ` AND sr.is_favorite = 1`; }
    sql += ` ORDER BY sr.is_favorite DESC, sr.name`;
    res.json({ success: true, saved: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/saved', async (req, res) => {
  try {
    await ensureTables();
    const { name, description, template_id, parameters, filters, created_by } = req.body;
    const id = generateId();
    run(`INSERT INTO saved_reports (id, name, description, template_id, parameters, filters, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, description, template_id, JSON.stringify(parameters || {}), JSON.stringify(filters || {}), created_by, timestamp()]);
    res.json({ success: true, saved: { id, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/saved/:id/favorite', async (req, res) => {
  try {
    await ensureTables();
    const { is_favorite } = req.body;
    run(`UPDATE saved_reports SET is_favorite = ? WHERE id = ?`, [is_favorite ? 1 : 0, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// DASHBOARDS
app.get('/dashboards', async (req, res) => {
  try {
    await ensureTables();
    const dashboards = query(`SELECT * FROM dashboards ORDER BY is_default DESC, name`);
    res.json({ success: true, dashboards: dashboards.map(d => ({ ...d, layout: JSON.parse(d.layout || '{}'), widgets: JSON.parse(d.widgets || '[]') })) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/dashboards', async (req, res) => {
  try {
    await ensureTables();
    const { name, description, layout, widgets, is_default, created_by } = req.body;
    const id = generateId();
    if (is_default) run(`UPDATE dashboards SET is_default = 0`);
    run(`INSERT INTO dashboards (id, name, description, layout, widgets, is_default, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, description, JSON.stringify(layout || {}), JSON.stringify(widgets || []), is_default ? 1 : 0, created_by, timestamp()]);
    res.json({ success: true, dashboard: { id, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// EXPORT
app.get('/export/:runId', async (req, res) => {
  try {
    await ensureTables();
    const { format = 'csv' } = req.query;
    const runRecord = get(`SELECT * FROM report_runs WHERE id = ?`, [req.params.runId]);
    if (!runRecord) return res.status(404).json({ success: false, error: 'Run not found' });
    
    // For CSV export, we'd regenerate the data
    // In a full implementation, we'd have the data stored
    res.json({ success: true, message: 'Export functionality - file_path would be returned' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// STATS
app.get('/stats', async (req, res) => {
  try {
    await ensureTables();
    const templates = get(`SELECT COUNT(*) as count FROM report_templates WHERE is_active = 1`);
    const scheduled = get(`SELECT COUNT(*) as count FROM scheduled_reports WHERE is_active = 1`);
    const runsToday = get(`SELECT COUNT(*) as count FROM report_runs WHERE DATE(created_at) = DATE('now')`);
    const savedReports = get(`SELECT COUNT(*) as count FROM saved_reports`);
    
    res.json({
      success: true,
      stats: {
        active_templates: templates?.count || 0,
        scheduled_reports: scheduled?.count || 0,
        runs_today: runsToday?.count || 0,
        saved_reports: savedReports?.count || 0
      }
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

async function start() {
  await ensureTables();
  app.get('*', (req, res) => {
    if (fs.existsSync(path.join(uiPath, 'index.html'))) res.sendFile(path.join(uiPath, 'index.html'));
    else res.json({ service: SERVICE_NAME, mode: 'lite', status: 'running' });
  });
  app.listen(PORT, () => console.log(`✅ ${SERVICE_NAME} (Lite) running on port ${PORT}`));
}

start();
