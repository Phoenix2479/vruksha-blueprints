/**
 * Revenue Management Service - Niyam Hospitality (Max Lite)
 * Demand forecasting, dynamic pricing, KPIs, yield optimization
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8943;
const SERVICE_NAME = 'revenue_management';

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) { app.use(express.static(uiPath)); }

app.get('/health', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME, mode: 'lite' }));

async function ensureTables() {
  const db = await initDb();
  
  db.run(`CREATE TABLE IF NOT EXISTS pricing_rules (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, rule_type TEXT NOT NULL,
    conditions TEXT NOT NULL, action_type TEXT NOT NULL, action_value REAL NOT NULL,
    priority INTEGER DEFAULT 100, is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS demand_forecast (
    id TEXT PRIMARY KEY, forecast_date TEXT NOT NULL, room_type TEXT,
    predicted_demand INTEGER, demand_level TEXT, confidence REAL,
    suggested_rate REAL, actual_demand INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(forecast_date, room_type)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS rate_recommendations (
    id TEXT PRIMARY KEY, room_type TEXT NOT NULL, recommendation_date TEXT NOT NULL,
    current_rate REAL, suggested_rate REAL, action TEXT, reason TEXT,
    applied INTEGER DEFAULT 0, applied_at TEXT, applied_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS revenue_snapshots (
    id TEXT PRIMARY KEY, snapshot_date TEXT NOT NULL, room_nights_sold INTEGER,
    room_nights_available INTEGER, revenue REAL, adr REAL, revpar REAL,
    occupancy REAL, total_rooms INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(snapshot_date)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS budget_targets (
    id TEXT PRIMARY KEY, target_month TEXT NOT NULL, revenue_target REAL,
    occupancy_target REAL, adr_target REAL, revpar_target REAL,
    room_nights_target INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(target_month)
  )`);
  
  return db;
}

// DEMAND FORECASTING
app.get('/forecast', async (req, res) => {
  try {
    await ensureTables();
    const { from_date, to_date, room_type } = req.query;
    const start = from_date || new Date().toISOString().split('T')[0];
    const end = to_date || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    
    // Get historical booking patterns
    const historical = query(`
      SELECT strftime('%w', check_in_date) as day_of_week, COUNT(*) as bookings,
             AVG(room_rate) as avg_rate
      FROM reservations
      WHERE status IN ('confirmed', 'checked_in', 'checked_out')
        AND check_in_date >= date('now', '-365 days')
      GROUP BY strftime('%w', check_in_date)
    `);
    
    const dayAvg = {};
    for (const h of historical) {
      dayAvg[h.day_of_week] = { bookings: h.bookings / 52, avg_rate: h.avg_rate || 100 };
    }
    
    // Get existing forecasts
    const existing = query(`SELECT * FROM demand_forecast WHERE forecast_date BETWEEN ? AND ?`, [start, end]);
    const existingMap = {};
    for (const e of existing) { existingMap[e.forecast_date] = e; }
    
    // Generate forecasts
    const forecast = [];
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const dow = d.getDay().toString();
      
      if (existingMap[dateStr]) {
        forecast.push(existingMap[dateStr]);
        continue;
      }
      
      const avg = dayAvg[dow] || { bookings: 5, avg_rate: 100 };
      const variance = 0.2;
      const demand = Math.round(avg.bookings * (1 + (Math.random() - 0.5) * variance));
      
      let demandLevel = 'normal';
      if (demand > avg.bookings * 1.2) demandLevel = 'high';
      else if (demand < avg.bookings * 0.8) demandLevel = 'low';
      
      let suggestedRate = avg.avg_rate;
      if (demandLevel === 'high') suggestedRate = Math.round(avg.avg_rate * 1.15);
      else if (demandLevel === 'low') suggestedRate = Math.round(avg.avg_rate * 0.9);
      
      const confidence = 0.65 + Math.random() * 0.2;
      
      forecast.push({
        forecast_date: dateStr,
        room_type: room_type || 'all',
        predicted_demand: demand,
        demand_level: demandLevel,
        confidence: Math.round(confidence * 100) / 100,
        suggested_rate: suggestedRate
      });
    }
    
    res.json({ success: true, forecast });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/forecast/save', async (req, res) => {
  try {
    await ensureTables();
    const { forecasts } = req.body;
    
    let count = 0;
    for (const f of forecasts || []) {
      run(`INSERT INTO demand_forecast (id, forecast_date, room_type, predicted_demand, demand_level, confidence, suggested_rate, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(forecast_date, room_type) DO UPDATE SET predicted_demand = ?, demand_level = ?, confidence = ?, suggested_rate = ?`,
        [generateId(), f.forecast_date, f.room_type || 'all', f.predicted_demand, f.demand_level, f.confidence, f.suggested_rate, timestamp(), f.predicted_demand, f.demand_level, f.confidence, f.suggested_rate]);
      count++;
    }
    
    res.json({ success: true, saved: count });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// RATE RECOMMENDATIONS
app.get('/recommendations', async (req, res) => {
  try {
    await ensureTables();
    const { date, room_type } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    // Get room types
    const roomTypes = room_type ? [{ code: room_type }] : query(`SELECT code FROM room_types WHERE is_active = 1`);
    
    const recommendations = [];
    
    for (const rt of roomTypes) {
      // Current rate
      const rateCalendar = get(`SELECT price FROM rate_calendar WHERE room_type = ? AND rate_date = ?`, [rt.code, targetDate]);
      const barRate = get(`SELECT single_rate FROM bar_rates WHERE room_type = ? AND is_active = 1 ORDER BY effective_from DESC LIMIT 1`, [rt.code]);
      const currentRate = rateCalendar?.price || barRate?.single_rate || 0;
      
      // Occupancy
      const occupied = get(`SELECT COUNT(*) as count FROM reservations r JOIN rooms rm ON r.room_id = rm.id JOIN room_types rtype ON rm.room_type_id = rtype.id WHERE rtype.code = ? AND r.status IN ('confirmed', 'checked_in') AND r.check_in_date <= ? AND r.check_out_date > ?`, [rt.code, targetDate, targetDate]);
      const totalRooms = get(`SELECT COUNT(*) as count FROM rooms rm JOIN room_types rtype ON rm.room_type_id = rtype.id WHERE rtype.code = ? AND rm.status != 'out_of_order'`, [rt.code]);
      const occupancy = totalRooms?.count > 0 ? (occupied?.count || 0) / totalRooms.count * 100 : 0;
      
      // Competitor average
      const compAvg = get(`SELECT AVG(rate) as avg FROM competitor_rates WHERE rate_date = ? AND room_type = ?`, [targetDate, rt.code]);
      
      // Historical ADR
      const histAdr = get(`SELECT AVG(room_rate) as avg FROM reservations WHERE status = 'checked_out' AND check_out_date > date('now', '-30 days')`);
      
      // Calculate recommendation
      let action = 'maintain';
      let suggestedRate = currentRate;
      let reason = 'Current rate is optimal';
      
      if (occupancy > 85) {
        action = 'increase';
        suggestedRate = Math.round(currentRate * 1.15);
        reason = 'High occupancy indicates strong demand';
      } else if (occupancy < 40) {
        action = 'decrease';
        suggestedRate = Math.round(currentRate * 0.9);
        reason = 'Low occupancy - stimulate demand with lower rates';
      }
      
      if (compAvg?.avg && currentRate > compAvg.avg * 1.2) {
        if (occupancy < 70) {
          action = 'decrease';
          suggestedRate = Math.round(compAvg.avg * 1.1);
          reason = 'Rate significantly above market average with moderate occupancy';
        }
      } else if (compAvg?.avg && currentRate < compAvg.avg * 0.8) {
        action = 'increase';
        suggestedRate = Math.round(compAvg.avg * 0.95);
        reason = 'Opportunity to increase rates closer to market';
      }
      
      recommendations.push({
        room_type: rt.code,
        date: targetDate,
        current_rate: currentRate,
        suggested_rate: suggestedRate,
        action,
        reason,
        metrics: {
          occupancy: Math.round(occupancy),
          competitor_avg: Math.round(compAvg?.avg || 0),
          historical_adr: Math.round(histAdr?.avg || 0)
        }
      });
    }
    
    res.json({ success: true, date: targetDate, recommendations });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/recommendations/apply', async (req, res) => {
  try {
    await ensureTables();
    const { recommendations, applied_by } = req.body;
    
    let applied = 0;
    for (const rec of recommendations || []) {
      // Update rate calendar
      run(`INSERT INTO rate_calendar (id, room_type, rate_date, price, rate_type, created_at) VALUES (?, ?, ?, ?, 'dynamic', ?) ON CONFLICT(room_type, rate_date) DO UPDATE SET price = ?, rate_type = 'dynamic'`,
        [generateId(), rec.room_type, rec.date, rec.new_rate || rec.suggested_rate, timestamp(), rec.new_rate || rec.suggested_rate]);
      
      // Log the recommendation
      run(`INSERT INTO rate_recommendations (id, room_type, recommendation_date, current_rate, suggested_rate, action, reason, applied, applied_at, applied_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        [generateId(), rec.room_type, rec.date, rec.current_rate, rec.suggested_rate, rec.action, rec.reason, timestamp(), applied_by, timestamp()]);
      
      applied++;
    }
    
    res.json({ success: true, applied });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// PRICING RULES
app.get('/rules', async (req, res) => {
  try {
    await ensureTables();
    const { active_only } = req.query;
    let sql = `SELECT * FROM pricing_rules WHERE 1=1`;
    if (active_only === 'true') sql += ` AND is_active = 1`;
    sql += ` ORDER BY priority`;
    const rules = query(sql);
    res.json({ success: true, rules: rules.map(r => ({ ...r, conditions: JSON.parse(r.conditions) })) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/rules', async (req, res) => {
  try {
    await ensureTables();
    const { name, rule_type, conditions, action_type, action_value, priority } = req.body;
    const id = generateId();
    run(`INSERT INTO pricing_rules (id, name, rule_type, conditions, action_type, action_value, priority, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, rule_type, JSON.stringify(conditions), action_type, action_value, priority || 100, timestamp()]);
    res.json({ success: true, rule: { id, name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/rules/:id', async (req, res) => {
  try {
    await ensureTables();
    const { name, conditions, action_type, action_value, priority, is_active } = req.body;
    run(`UPDATE pricing_rules SET name = COALESCE(?, name), conditions = COALESCE(?, conditions), action_type = COALESCE(?, action_type), action_value = COALESCE(?, action_value), priority = COALESCE(?, priority), is_active = COALESCE(?, is_active) WHERE id = ?`,
      [name, conditions ? JSON.stringify(conditions) : null, action_type, action_value, priority, is_active, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete('/rules/:id', async (req, res) => {
  try {
    await ensureTables();
    run(`DELETE FROM pricing_rules WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// PERFORMANCE ANALYTICS
app.get('/performance', async (req, res) => {
  try {
    await ensureTables();
    const { period = 30 } = req.query;
    
    const totalRooms = get(`SELECT COUNT(*) as count FROM rooms WHERE status != 'out_of_order'`);
    const roomCount = totalRooms?.count || 1;
    
    const daily = query(`
      SELECT DATE(check_in_date) as date,
             COUNT(*) as room_nights,
             SUM(total_amount) as revenue,
             AVG(room_rate) as adr
      FROM reservations
      WHERE status IN ('checked_in', 'checked_out')
        AND check_in_date >= date('now', '-${parseInt(period)} days')
      GROUP BY DATE(check_in_date)
      ORDER BY date
    `);
    
    const performance = daily.map(d => ({
      date: d.date,
      room_nights: d.room_nights,
      revenue: d.revenue,
      adr: Math.round(d.adr || 0),
      occupancy: Math.round((d.room_nights / roomCount) * 100),
      revpar: Math.round((d.revenue || 0) / roomCount)
    }));
    
    res.json({ success: true, performance });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// KPIs
app.get('/kpis', async (req, res) => {
  try {
    await ensureTables();
    
    const totalRooms = get(`SELECT COUNT(*) as count FROM rooms WHERE status != 'out_of_order'`);
    const roomCount = totalRooms?.count || 1;
    const daysInMonth = new Date().getDate();
    const availableRoomNights = roomCount * daysInMonth;
    
    // MTD
    const mtd = get(`
      SELECT COUNT(*) as room_nights, COALESCE(SUM(total_amount), 0) as revenue,
             AVG(room_rate) as adr
      FROM reservations
      WHERE status IN ('checked_in', 'checked_out')
        AND check_in_date >= date('now', 'start of month')
    `);
    
    // Last month
    const lastMonth = get(`
      SELECT COUNT(*) as room_nights, COALESCE(SUM(total_amount), 0) as revenue
      FROM reservations
      WHERE status IN ('checked_in', 'checked_out')
        AND check_in_date >= date('now', 'start of month', '-1 month')
        AND check_in_date < date('now', 'start of month')
    `);
    
    const mtdRevenue = mtd?.revenue || 0;
    const lastMonthRevenue = lastMonth?.revenue || 0;
    const revenueChange = lastMonthRevenue > 0 ? Math.round(((mtdRevenue - lastMonthRevenue) / lastMonthRevenue) * 100) : 0;
    
    const roomNights = mtd?.room_nights || 0;
    const occupancy = Math.round((roomNights / availableRoomNights) * 100);
    const adr = Math.round(mtd?.adr || 0);
    const revpar = Math.round(mtdRevenue / availableRoomNights);
    
    // Today
    const today = get(`
      SELECT COUNT(*) as count FROM reservations
      WHERE status = 'checked_in'
        AND check_in_date <= date('now')
        AND check_out_date > date('now')
    `);
    const todayOccupancy = Math.round(((today?.count || 0) / roomCount) * 100);
    
    res.json({
      success: true,
      kpis: {
        occupancy_mtd: occupancy,
        occupancy_today: todayOccupancy,
        adr: adr,
        revpar: revpar,
        revenue_mtd: mtdRevenue,
        revenue_change: revenueChange,
        room_nights_sold: roomNights,
        available_room_nights: availableRoomNights
      }
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// BUDGET TARGETS
app.get('/budget', async (req, res) => {
  try {
    await ensureTables();
    const { year } = req.query;
    const targetYear = year || new Date().getFullYear();
    const targets = query(`SELECT * FROM budget_targets WHERE target_month LIKE ? ORDER BY target_month`, [`${targetYear}%`]);
    res.json({ success: true, targets });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/budget', async (req, res) => {
  try {
    await ensureTables();
    const { target_month, revenue_target, occupancy_target, adr_target, revpar_target, room_nights_target } = req.body;
    const id = generateId();
    run(`INSERT INTO budget_targets (id, target_month, revenue_target, occupancy_target, adr_target, revpar_target, room_nights_target, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(target_month) DO UPDATE SET revenue_target = ?, occupancy_target = ?, adr_target = ?, revpar_target = ?, room_nights_target = ?`,
      [id, target_month, revenue_target, occupancy_target, adr_target, revpar_target, room_nights_target, timestamp(), revenue_target, occupancy_target, adr_target, revpar_target, room_nights_target]);
    res.json({ success: true, target: { id, target_month } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/budget/vs-actual', async (req, res) => {
  try {
    await ensureTables();
    const month = new Date().toISOString().slice(0, 7);
    
    const target = get(`SELECT * FROM budget_targets WHERE target_month = ?`, [month]);
    
    const totalRooms = get(`SELECT COUNT(*) as count FROM rooms WHERE status != 'out_of_order'`);
    const roomCount = totalRooms?.count || 1;
    const daysInMonth = new Date().getDate();
    const availableRoomNights = roomCount * daysInMonth;
    
    const actual = get(`
      SELECT COUNT(*) as room_nights, COALESCE(SUM(total_amount), 0) as revenue,
             AVG(room_rate) as adr
      FROM reservations
      WHERE status IN ('checked_in', 'checked_out')
        AND check_in_date >= date('now', 'start of month')
    `);
    
    const actualRevenue = actual?.revenue || 0;
    const actualOccupancy = Math.round(((actual?.room_nights || 0) / availableRoomNights) * 100);
    const actualAdr = Math.round(actual?.adr || 0);
    const actualRevpar = Math.round(actualRevenue / availableRoomNights);
    
    res.json({
      success: true,
      month,
      comparison: {
        revenue: { target: target?.revenue_target || 0, actual: actualRevenue, variance: target?.revenue_target ? actualRevenue - target.revenue_target : 0 },
        occupancy: { target: target?.occupancy_target || 0, actual: actualOccupancy, variance: target?.occupancy_target ? actualOccupancy - target.occupancy_target : 0 },
        adr: { target: target?.adr_target || 0, actual: actualAdr, variance: target?.adr_target ? actualAdr - target.adr_target : 0 },
        revpar: { target: target?.revpar_target || 0, actual: actualRevpar, variance: target?.revpar_target ? actualRevpar - target.revpar_target : 0 }
      }
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// STATS
app.get('/stats', async (req, res) => {
  try {
    await ensureTables();
    const rules = get(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = 1) as active FROM pricing_rules`);
    const recommendations = get(`SELECT COUNT(*) as count FROM rate_recommendations WHERE created_at > datetime('now', '-7 days')`);
    const applied = get(`SELECT COUNT(*) as count FROM rate_recommendations WHERE applied = 1 AND created_at > datetime('now', '-7 days')`);
    
    res.json({
      success: true,
      stats: {
        total_rules: rules?.total || 0,
        active_rules: rules?.active || 0,
        recommendations_week: recommendations?.count || 0,
        applied_week: applied?.count || 0
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
