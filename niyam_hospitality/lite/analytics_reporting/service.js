/**
 * Analytics & Reporting Service - Niyam Hospitality (Max Lite)
 * Business intelligence, KPIs, dashboards, scheduled reports
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8933;
const SERVICE_NAME = 'analytics_reporting';

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) { app.use(express.static(uiPath)); }

app.get('/health', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME, mode: 'lite' }));

async function ensureTables() {
  const db = await initDb();
  
  db.run(`CREATE TABLE IF NOT EXISTS report_definitions (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, report_type TEXT,
    category TEXT, query_config TEXT, filters TEXT, columns TEXT,
    is_system INTEGER DEFAULT 0, created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS scheduled_reports (
    id TEXT PRIMARY KEY, report_id TEXT NOT NULL, name TEXT, schedule TEXT NOT NULL,
    recipients TEXT, format TEXT DEFAULT 'pdf', last_run TEXT, next_run TEXT,
    is_active INTEGER DEFAULT 1, created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS report_runs (
    id TEXT PRIMARY KEY, report_id TEXT, scheduled_id TEXT, parameters TEXT,
    status TEXT DEFAULT 'pending', started_at TEXT, completed_at TEXT,
    row_count INTEGER, file_path TEXT, error TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS saved_dashboards (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
    widgets TEXT NOT NULL, layout TEXT, is_default INTEGER DEFAULT 0,
    created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  return db;
}

// KPI DASHBOARD
app.get('/kpis', async (req, res) => {
  try {
    await ensureTables();
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    const yesterday = new Date(new Date(targetDate).getTime() - 86400000).toISOString().split('T')[0];
    
    // Occupancy
    const totalRooms = get(`SELECT COUNT(*) as count FROM rooms WHERE status != 'out_of_order'`);
    const occupiedRooms = get(`SELECT COUNT(DISTINCT room_id) as count FROM reservations WHERE status = 'checked_in' AND DATE(check_in_date) <= ? AND DATE(check_out_date) > ?`, [targetDate, targetDate]);
    const occupancyRate = totalRooms?.count > 0 ? Math.round((occupiedRooms?.count / totalRooms.count) * 100) : 0;
    
    // Revenue
    const todayRevenue = get(`SELECT SUM(total_amount) as amount FROM reservations WHERE DATE(check_in_date) = ? OR DATE(check_out_date) = ?`, [targetDate, targetDate]);
    const yesterdayRevenue = get(`SELECT SUM(total_amount) as amount FROM reservations WHERE DATE(check_in_date) = ? OR DATE(check_out_date) = ?`, [yesterday, yesterday]);
    
    // ADR (Average Daily Rate)
    const adr = occupiedRooms?.count > 0 ? (todayRevenue?.amount || 0) / occupiedRooms.count : 0;
    
    // RevPAR
    const revpar = totalRooms?.count > 0 ? (todayRevenue?.amount || 0) / totalRooms.count : 0;
    
    // Arrivals & Departures
    const arrivals = get(`SELECT COUNT(*) as count FROM reservations WHERE DATE(check_in_date) = ? AND status IN ('confirmed', 'checked_in')`, [targetDate]);
    const departures = get(`SELECT COUNT(*) as count FROM reservations WHERE DATE(check_out_date) = ? AND status = 'checked_in'`, [targetDate]);
    
    // F&B Revenue (from restaurant_orders)
    const fnbRevenue = get(`SELECT SUM(total) as amount FROM restaurant_orders WHERE DATE(created_at) = ? AND status = 'served'`, [targetDate]);
    
    res.json({
      success: true,
      date: targetDate,
      kpis: {
        occupancy: { value: occupancyRate, unit: '%', label: 'Occupancy Rate' },
        rooms_sold: { value: occupiedRooms?.count || 0, total: totalRooms?.count || 0, label: 'Rooms Sold' },
        adr: { value: Math.round(adr), unit: '₹', label: 'ADR' },
        revpar: { value: Math.round(revpar), unit: '₹', label: 'RevPAR' },
        room_revenue: { value: todayRevenue?.amount || 0, change: (todayRevenue?.amount || 0) - (yesterdayRevenue?.amount || 0), label: 'Room Revenue' },
        fnb_revenue: { value: fnbRevenue?.amount || 0, label: 'F&B Revenue' },
        arrivals: { value: arrivals?.count || 0, label: 'Arrivals' },
        departures: { value: departures?.count || 0, label: 'Departures' }
      }
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// OCCUPANCY TREND
app.get('/occupancy/trend', async (req, res) => {
  try {
    await ensureTables();
    const { days = 30 } = req.query;
    const totalRooms = get(`SELECT COUNT(*) as count FROM rooms WHERE status != 'out_of_order'`);
    const total = totalRooms?.count || 1;
    
    const trend = [];
    for (let i = parseInt(days) - 1; i >= 0; i--) {
      const date = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
      const occupied = get(`SELECT COUNT(DISTINCT room_id) as count FROM reservations WHERE status IN ('checked_in', 'checked_out') AND DATE(check_in_date) <= ? AND DATE(check_out_date) > ?`, [date, date]);
      trend.push({ date, occupancy: Math.round((occupied?.count || 0) / total * 100), rooms_sold: occupied?.count || 0 });
    }
    
    res.json({ success: true, trend, total_rooms: total });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// REVENUE BREAKDOWN
app.get('/revenue/breakdown', async (req, res) => {
  try {
    await ensureTables();
    const { from_date, to_date } = req.query;
    const start = from_date || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const end = to_date || new Date().toISOString().split('T')[0];
    
    const roomRevenue = get(`SELECT SUM(total_amount) as amount FROM reservations WHERE DATE(check_in_date) BETWEEN ? AND ?`, [start, end]);
    const fnbRevenue = get(`SELECT SUM(total) as amount FROM restaurant_orders WHERE DATE(created_at) BETWEEN ? AND ? AND status = 'served'`, [start, end]);
    const otherRevenue = get(`SELECT SUM(total_amount) as amount FROM guest_folios WHERE DATE(posted_at) BETWEEN ? AND ? AND item_type NOT IN ('room', 'restaurant')`, [start, end]);
    
    const total = (roomRevenue?.amount || 0) + (fnbRevenue?.amount || 0) + (otherRevenue?.amount || 0);
    
    res.json({
      success: true,
      period: { from: start, to: end },
      breakdown: {
        rooms: { amount: roomRevenue?.amount || 0, percent: total > 0 ? Math.round((roomRevenue?.amount || 0) / total * 100) : 0 },
        fnb: { amount: fnbRevenue?.amount || 0, percent: total > 0 ? Math.round((fnbRevenue?.amount || 0) / total * 100) : 0 },
        other: { amount: otherRevenue?.amount || 0, percent: total > 0 ? Math.round((otherRevenue?.amount || 0) / total * 100) : 0 },
        total
      }
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// BOOKING SOURCE ANALYSIS
app.get('/bookings/sources', async (req, res) => {
  try {
    await ensureTables();
    const { days = 30 } = req.query;
    const sources = query(`
      SELECT source, COUNT(*) as count, SUM(total_amount) as revenue
      FROM reservations WHERE created_at > datetime('now', '-${parseInt(days)} days')
      GROUP BY source ORDER BY count DESC
    `);
    res.json({ success: true, sources });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ROOM TYPE PERFORMANCE
app.get('/rooms/performance', async (req, res) => {
  try {
    await ensureTables();
    const { days = 30 } = req.query;
    const performance = query(`
      SELECT rt.name as room_type, COUNT(r.id) as bookings, SUM(r.total_amount) as revenue,
             AVG(r.room_rate) as avg_rate
      FROM reservations r
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      WHERE r.created_at > datetime('now', '-${parseInt(days)} days')
      GROUP BY r.room_type_id ORDER BY revenue DESC
    `);
    res.json({ success: true, performance });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// REPORT DEFINITIONS
app.get('/reports', async (req, res) => {
  try {
    await ensureTables();
    const { category } = req.query;
    let sql = `SELECT * FROM report_definitions WHERE 1=1`;
    const params = [];
    if (category) { sql += ` AND category = ?`; params.push(category); }
    sql += ` ORDER BY name`;
    res.json({ success: true, reports: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/reports', async (req, res) => {
  try {
    await ensureTables();
    const { name, description, report_type, category, query_config, filters, columns, created_by } = req.body;
    const id = generateId();
    run(`INSERT INTO report_definitions (id, name, description, report_type, category, query_config, filters, columns, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, description, report_type, category, JSON.stringify(query_config), JSON.stringify(filters), JSON.stringify(columns), created_by, timestamp()]);
    res.json({ success: true, report: { id, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// RUN REPORT
app.post('/reports/:id/run', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { parameters } = req.body;
    
    const report = get(`SELECT * FROM report_definitions WHERE id = ?`, [id]);
    if (!report) return res.status(404).json({ success: false, error: 'Report not found' });
    
    const runId = generateId();
    run(`INSERT INTO report_runs (id, report_id, parameters, status, started_at, created_at) VALUES (?, ?, ?, 'running', ?, ?)`,
      [runId, id, JSON.stringify(parameters || {}), timestamp(), timestamp()]);
    
    // Execute report based on type (simplified for lite)
    let results = [];
    const config = JSON.parse(report.query_config || '{}');
    
    // This is a simplified execution - in production would have proper query builder
    if (config.table === 'reservations') {
      results = query(`SELECT * FROM reservations ORDER BY created_at DESC LIMIT 1000`);
    } else if (config.table === 'guests') {
      results = query(`SELECT * FROM guests ORDER BY created_at DESC LIMIT 1000`);
    }
    
    run(`UPDATE report_runs SET status = 'completed', completed_at = ?, row_count = ? WHERE id = ?`,
      [timestamp(), results.length, runId]);
    
    res.json({ success: true, run_id: runId, row_count: results.length, data: results.slice(0, 100) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// SCHEDULED REPORTS
app.get('/scheduled', async (req, res) => {
  try {
    await ensureTables();
    const scheduled = query(`SELECT sr.*, rd.name as report_name FROM scheduled_reports sr LEFT JOIN report_definitions rd ON sr.report_id = rd.id ORDER BY sr.name`);
    res.json({ success: true, scheduled });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/scheduled', async (req, res) => {
  try {
    await ensureTables();
    const { report_id, name, schedule, recipients, format, created_by } = req.body;
    const id = generateId();
    run(`INSERT INTO scheduled_reports (id, report_id, name, schedule, recipients, format, is_active, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, report_id, name, schedule, JSON.stringify(recipients || []), format || 'pdf', created_by, timestamp()]);
    res.json({ success: true, scheduled: { id, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// DASHBOARDS
app.get('/dashboards', async (req, res) => {
  try {
    await ensureTables();
    res.json({ success: true, dashboards: query(`SELECT * FROM saved_dashboards ORDER BY is_default DESC, name`) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/dashboards', async (req, res) => {
  try {
    await ensureTables();
    const { name, description, widgets, layout, is_default, created_by } = req.body;
    const id = generateId();
    if (is_default) run(`UPDATE saved_dashboards SET is_default = 0`);
    run(`INSERT INTO saved_dashboards (id, name, description, widgets, layout, is_default, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, description, JSON.stringify(widgets), JSON.stringify(layout), is_default ? 1 : 0, created_by, timestamp()]);
    res.json({ success: true, dashboard: { id, name } });
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
