/**
 * F&B Analytics & Insights Service - Niyam Hospitality (Max Lite)
 * Sales analytics, menu performance, waste tracking, revenue insights
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8920;
const SERVICE_NAME = 'fnb_analytics_insights';

app.use(cors());
app.use(express.json());

// Serve UI
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) {
  app.use(express.static(uiPath));
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: SERVICE_NAME, mode: 'lite' });
});

// ============================================
// ADDITIONAL TABLES
// ============================================

async function ensureTables() {
  const db = await initDb();
  
  // Daily sales summary
  db.run(`
    CREATE TABLE IF NOT EXISTS fnb_daily_sales (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL UNIQUE,
      outlet_id TEXT,
      total_orders INTEGER DEFAULT 0,
      total_covers INTEGER DEFAULT 0,
      gross_revenue REAL DEFAULT 0,
      discounts REAL DEFAULT 0,
      net_revenue REAL DEFAULT 0,
      food_revenue REAL DEFAULT 0,
      beverage_revenue REAL DEFAULT 0,
      other_revenue REAL DEFAULT 0,
      avg_check REAL DEFAULT 0,
      peak_hour INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Item sales tracking
  db.run(`
    CREATE TABLE IF NOT EXISTS fnb_item_sales (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      item_id TEXT NOT NULL,
      item_name TEXT,
      category TEXT,
      quantity_sold INTEGER DEFAULT 0,
      gross_revenue REAL DEFAULT 0,
      cost_of_goods REAL DEFAULT 0,
      profit REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(date, item_id)
    )
  `);
  
  // Waste tracking
  db.run(`
    CREATE TABLE IF NOT EXISTS fnb_waste_log (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      item_id TEXT,
      item_name TEXT NOT NULL,
      category TEXT,
      quantity REAL DEFAULT 0,
      unit TEXT DEFAULT 'portions',
      cost REAL DEFAULT 0,
      waste_type TEXT DEFAULT 'production',
      reason TEXT,
      recorded_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Hourly sales data
  db.run(`
    CREATE TABLE IF NOT EXISTS fnb_hourly_sales (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      hour INTEGER NOT NULL,
      outlet_id TEXT,
      orders INTEGER DEFAULT 0,
      revenue REAL DEFAULT 0,
      covers INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(date, hour, outlet_id)
    )
  `);
  
  // Menu performance metrics
  db.run(`
    CREATE TABLE IF NOT EXISTS fnb_menu_performance (
      id TEXT PRIMARY KEY,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      item_id TEXT NOT NULL,
      item_name TEXT,
      category TEXT,
      total_sold INTEGER DEFAULT 0,
      total_revenue REAL DEFAULT 0,
      total_cost REAL DEFAULT 0,
      profit_margin REAL DEFAULT 0,
      popularity_rank INTEGER,
      profitability_rank INTEGER,
      menu_mix_percent REAL DEFAULT 0,
      classification TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Alerts and anomalies
  db.run(`
    CREATE TABLE IF NOT EXISTS fnb_alerts (
      id TEXT PRIMARY KEY,
      alert_type TEXT NOT NULL,
      severity TEXT DEFAULT 'info',
      title TEXT NOT NULL,
      message TEXT,
      metric_name TEXT,
      metric_value REAL,
      threshold_value REAL,
      acknowledged INTEGER DEFAULT 0,
      acknowledged_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  return db;
}

// ============================================
// DASHBOARD / OVERVIEW
// ============================================

app.get('/dashboard', async (req, res) => {
  try {
    await ensureTables();
    const { start_date, end_date } = req.query;
    
    const today = new Date().toISOString().split('T')[0];
    const startDate = start_date || today;
    const endDate = end_date || today;
    
    // Today's sales
    const todaySales = get(`
      SELECT 
        SUM(total_orders) as orders,
        SUM(total_covers) as covers,
        SUM(net_revenue) as revenue,
        AVG(avg_check) as avg_check
      FROM fnb_daily_sales
      WHERE date = ?
    `, [today]);
    
    // Period comparison
    const periodSales = get(`
      SELECT 
        SUM(total_orders) as orders,
        SUM(total_covers) as covers,
        SUM(net_revenue) as revenue,
        SUM(food_revenue) as food,
        SUM(beverage_revenue) as beverage,
        AVG(avg_check) as avg_check
      FROM fnb_daily_sales
      WHERE date BETWEEN ? AND ?
    `, [startDate, endDate]);
    
    // Top sellers today
    const topSellers = query(`
      SELECT item_name, SUM(quantity_sold) as qty, SUM(gross_revenue) as revenue
      FROM fnb_item_sales
      WHERE date = ?
      GROUP BY item_id
      ORDER BY qty DESC
      LIMIT 5
    `, [today]);
    
    // Today's waste
    const todayWaste = get(`
      SELECT COUNT(*) as incidents, SUM(cost) as cost
      FROM fnb_waste_log
      WHERE date = ?
    `, [today]);
    
    // Active alerts
    const alerts = query(`
      SELECT * FROM fnb_alerts 
      WHERE acknowledged = 0 
      ORDER BY severity DESC, created_at DESC 
      LIMIT 5
    `);
    
    res.json({
      success: true,
      dashboard: {
        today: {
          orders: todaySales?.orders || 0,
          covers: todaySales?.covers || 0,
          revenue: todaySales?.revenue || 0,
          avg_check: Math.round((todaySales?.avg_check || 0) * 100) / 100
        },
        period: {
          start_date: startDate,
          end_date: endDate,
          orders: periodSales?.orders || 0,
          covers: periodSales?.covers || 0,
          revenue: periodSales?.revenue || 0,
          food_revenue: periodSales?.food || 0,
          beverage_revenue: periodSales?.beverage || 0,
          avg_check: Math.round((periodSales?.avg_check || 0) * 100) / 100
        },
        top_sellers: topSellers,
        waste: {
          incidents: todayWaste?.incidents || 0,
          cost: todayWaste?.cost || 0
        },
        alerts
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// SALES ANALYTICS
// ============================================

app.get('/sales/daily', async (req, res) => {
  try {
    await ensureTables();
    const { start_date, end_date, outlet_id } = req.query;
    
    let sql = `SELECT * FROM fnb_daily_sales WHERE 1=1`;
    const params = [];
    
    if (start_date) {
      sql += ` AND date >= ?`;
      params.push(start_date);
    }
    if (end_date) {
      sql += ` AND date <= ?`;
      params.push(end_date);
    }
    if (outlet_id) {
      sql += ` AND outlet_id = ?`;
      params.push(outlet_id);
    }
    
    sql += ` ORDER BY date DESC`;
    
    const sales = query(sql, params);
    res.json({ success: true, sales });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/sales/hourly', async (req, res) => {
  try {
    await ensureTables();
    const { date, outlet_id } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    let sql = `SELECT * FROM fnb_hourly_sales WHERE date = ?`;
    const params = [targetDate];
    
    if (outlet_id) {
      sql += ` AND outlet_id = ?`;
      params.push(outlet_id);
    }
    
    sql += ` ORDER BY hour ASC`;
    
    const hourly = query(sql, params);
    
    // Fill in missing hours
    const fullDay = Array.from({ length: 24 }, (_, i) => {
      const existing = hourly.find(h => h.hour === i);
      return existing || { hour: i, orders: 0, revenue: 0, covers: 0 };
    });
    
    res.json({ success: true, hourly: fullDay, date: targetDate });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/sales/trends', async (req, res) => {
  try {
    await ensureTables();
    const { days = 30 } = req.query;
    
    const trends = query(`
      SELECT date, net_revenue as revenue, total_orders as orders, avg_check
      FROM fnb_daily_sales
      WHERE date >= date('now', '-${parseInt(days)} days')
      ORDER BY date ASC
    `);
    
    // Calculate moving average
    const movingAvg = [];
    for (let i = 0; i < trends.length; i++) {
      const window = trends.slice(Math.max(0, i - 6), i + 1);
      const avg = window.reduce((sum, d) => sum + (d.revenue || 0), 0) / window.length;
      movingAvg.push({ date: trends[i].date, revenue: trends[i].revenue, moving_avg: Math.round(avg * 100) / 100 });
    }
    
    res.json({ success: true, trends: movingAvg });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// MENU ANALYTICS
// ============================================

app.get('/menu/performance', async (req, res) => {
  try {
    await ensureTables();
    const { start_date, end_date, category } = req.query;
    
    const today = new Date().toISOString().split('T')[0];
    const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = end_date || today;
    
    let sql = `
      SELECT 
        item_id, item_name, category,
        SUM(quantity_sold) as total_sold,
        SUM(gross_revenue) as total_revenue,
        SUM(cost_of_goods) as total_cost,
        SUM(profit) as total_profit,
        AVG(profit / NULLIF(gross_revenue, 0) * 100) as avg_margin
      FROM fnb_item_sales
      WHERE date BETWEEN ? AND ?
    `;
    const params = [startDate, endDate];
    
    if (category) {
      sql += ` AND category = ?`;
      params.push(category);
    }
    
    sql += ` GROUP BY item_id ORDER BY total_sold DESC`;
    
    const items = query(sql, params);
    
    // Calculate totals for menu mix
    const totalSold = items.reduce((sum, i) => sum + (i.total_sold || 0), 0);
    const totalRevenue = items.reduce((sum, i) => sum + (i.total_revenue || 0), 0);
    
    // Classify items (Stars, Puzzles, Plowhorses, Dogs)
    const avgSold = totalSold / items.length;
    const avgMargin = items.reduce((sum, i) => sum + (i.avg_margin || 0), 0) / items.length;
    
    const classified = items.map(item => {
      const highPopularity = (item.total_sold || 0) >= avgSold;
      const highProfitability = (item.avg_margin || 0) >= avgMargin;
      
      let classification;
      if (highPopularity && highProfitability) classification = 'Star';
      else if (!highPopularity && highProfitability) classification = 'Puzzle';
      else if (highPopularity && !highProfitability) classification = 'Plowhorse';
      else classification = 'Dog';
      
      return {
        ...item,
        menu_mix_percent: totalSold > 0 ? Math.round((item.total_sold / totalSold) * 1000) / 10 : 0,
        revenue_contribution: totalRevenue > 0 ? Math.round((item.total_revenue / totalRevenue) * 1000) / 10 : 0,
        avg_margin: Math.round((item.avg_margin || 0) * 10) / 10,
        classification
      };
    });
    
    // Summary by classification
    const summary = {
      stars: classified.filter(i => i.classification === 'Star').length,
      puzzles: classified.filter(i => i.classification === 'Puzzle').length,
      plowhorses: classified.filter(i => i.classification === 'Plowhorse').length,
      dogs: classified.filter(i => i.classification === 'Dog').length
    };
    
    res.json({ success: true, items: classified, summary, period: { start: startDate, end: endDate } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/menu/categories', async (req, res) => {
  try {
    await ensureTables();
    const { start_date, end_date } = req.query;
    
    const today = new Date().toISOString().split('T')[0];
    const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = end_date || today;
    
    const categories = query(`
      SELECT 
        category,
        SUM(quantity_sold) as total_sold,
        SUM(gross_revenue) as total_revenue,
        SUM(profit) as total_profit,
        COUNT(DISTINCT item_id) as item_count
      FROM fnb_item_sales
      WHERE date BETWEEN ? AND ?
      GROUP BY category
      ORDER BY total_revenue DESC
    `, [startDate, endDate]);
    
    res.json({ success: true, categories });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// WASTE TRACKING
// ============================================

app.get('/waste', async (req, res) => {
  try {
    await ensureTables();
    const { start_date, end_date, waste_type } = req.query;
    
    let sql = `SELECT * FROM fnb_waste_log WHERE 1=1`;
    const params = [];
    
    if (start_date) {
      sql += ` AND date >= ?`;
      params.push(start_date);
    }
    if (end_date) {
      sql += ` AND date <= ?`;
      params.push(end_date);
    }
    if (waste_type) {
      sql += ` AND waste_type = ?`;
      params.push(waste_type);
    }
    
    sql += ` ORDER BY created_at DESC`;
    
    const waste = query(sql, params);
    res.json({ success: true, waste });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/waste', async (req, res) => {
  try {
    await ensureTables();
    const { item_id, item_name, category, quantity, unit, cost, waste_type, reason, recorded_by } = req.body;
    
    if (!item_name || !quantity) {
      return res.status(400).json({ success: false, error: 'Item name and quantity required' });
    }
    
    const id = generateId();
    const today = new Date().toISOString().split('T')[0];
    
    run(`
      INSERT INTO fnb_waste_log (id, date, item_id, item_name, category, quantity, unit, cost, waste_type, reason, recorded_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, today, item_id, item_name, category, quantity, unit || 'portions', cost || 0, waste_type || 'production', reason, recorded_by, timestamp()]);
    
    // Check if waste exceeds threshold and create alert
    const dailyWaste = get(`SELECT SUM(cost) as total FROM fnb_waste_log WHERE date = ?`, [today]);
    if ((dailyWaste?.total || 0) > 500) { // Alert threshold
      run(`
        INSERT INTO fnb_alerts (id, alert_type, severity, title, message, metric_name, metric_value, threshold_value, created_at)
        VALUES (?, 'waste_threshold', 'warning', 'High Daily Waste', 'Daily waste cost has exceeded threshold', 'daily_waste_cost', ?, 500, ?)
      `, [generateId(), dailyWaste.total, timestamp()]);
    }
    
    res.json({ success: true, waste: { id, item_name, quantity, cost } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/waste/summary', async (req, res) => {
  try {
    await ensureTables();
    const { days = 30 } = req.query;
    
    const summary = query(`
      SELECT 
        waste_type,
        COUNT(*) as incidents,
        SUM(quantity) as total_quantity,
        SUM(cost) as total_cost
      FROM fnb_waste_log
      WHERE date >= date('now', '-${parseInt(days)} days')
      GROUP BY waste_type
    `);
    
    const byCategory = query(`
      SELECT 
        category,
        SUM(cost) as total_cost,
        COUNT(*) as incidents
      FROM fnb_waste_log
      WHERE date >= date('now', '-${parseInt(days)} days')
      GROUP BY category
      ORDER BY total_cost DESC
    `);
    
    const daily = query(`
      SELECT date, SUM(cost) as cost, COUNT(*) as incidents
      FROM fnb_waste_log
      WHERE date >= date('now', '-${parseInt(days)} days')
      GROUP BY date
      ORDER BY date ASC
    `);
    
    res.json({ success: true, summary: { by_type: summary, by_category: byCategory, daily } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// ALERTS
// ============================================

app.get('/alerts', async (req, res) => {
  try {
    await ensureTables();
    const { acknowledged } = req.query;
    
    let sql = `SELECT * FROM fnb_alerts`;
    const params = [];
    
    if (acknowledged !== undefined) {
      sql += ` WHERE acknowledged = ?`;
      params.push(acknowledged === 'true' ? 1 : 0);
    }
    
    sql += ` ORDER BY created_at DESC LIMIT 50`;
    
    const alerts = query(sql, params);
    res.json({ success: true, alerts });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/alerts/:id/acknowledge', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { acknowledged_by } = req.body;
    
    run(`UPDATE fnb_alerts SET acknowledged = 1, acknowledged_by = ? WHERE id = ?`, [acknowledged_by, id]);
    res.json({ success: true, message: 'Alert acknowledged' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// DATA INGESTION (for syncing from POS)
// ============================================

app.post('/ingest/daily-sales', async (req, res) => {
  try {
    await ensureTables();
    const { date, outlet_id, total_orders, total_covers, gross_revenue, discounts, food_revenue, beverage_revenue, other_revenue, peak_hour } = req.body;
    
    const netRevenue = (gross_revenue || 0) - (discounts || 0);
    const avgCheck = total_covers > 0 ? netRevenue / total_covers : 0;
    
    run(`
      INSERT OR REPLACE INTO fnb_daily_sales (id, date, outlet_id, total_orders, total_covers, gross_revenue, discounts, net_revenue, food_revenue, beverage_revenue, other_revenue, avg_check, peak_hour, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [generateId(), date, outlet_id, total_orders, total_covers, gross_revenue, discounts, netRevenue, food_revenue, beverage_revenue, other_revenue, avgCheck, peak_hour, timestamp()]);
    
    res.json({ success: true, message: 'Daily sales ingested' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/ingest/item-sales', async (req, res) => {
  try {
    await ensureTables();
    const { date, items } = req.body;
    
    for (const item of items || []) {
      const profit = (item.gross_revenue || 0) - (item.cost_of_goods || 0);
      
      run(`
        INSERT OR REPLACE INTO fnb_item_sales (id, date, item_id, item_name, category, quantity_sold, gross_revenue, cost_of_goods, profit, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [generateId(), date, item.item_id, item.item_name, item.category, item.quantity_sold, item.gross_revenue, item.cost_of_goods, profit, timestamp()]);
    }
    
    res.json({ success: true, message: `${items?.length || 0} item sales ingested` });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// REPORTS
// ============================================

app.get('/reports/summary', async (req, res) => {
  try {
    await ensureTables();
    const { start_date, end_date } = req.query;
    
    const today = new Date().toISOString().split('T')[0];
    const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = end_date || today;
    
    const sales = get(`
      SELECT 
        SUM(total_orders) as total_orders,
        SUM(total_covers) as total_covers,
        SUM(net_revenue) as total_revenue,
        SUM(food_revenue) as food_revenue,
        SUM(beverage_revenue) as beverage_revenue,
        AVG(avg_check) as avg_check,
        MAX(net_revenue) as best_day_revenue,
        MIN(net_revenue) as worst_day_revenue
      FROM fnb_daily_sales
      WHERE date BETWEEN ? AND ?
    `, [startDate, endDate]);
    
    const waste = get(`
      SELECT SUM(cost) as total_cost, COUNT(*) as incidents
      FROM fnb_waste_log
      WHERE date BETWEEN ? AND ?
    `, [startDate, endDate]);
    
    const topItems = query(`
      SELECT item_name, SUM(quantity_sold) as qty, SUM(gross_revenue) as revenue
      FROM fnb_item_sales
      WHERE date BETWEEN ? AND ?
      GROUP BY item_id
      ORDER BY revenue DESC
      LIMIT 10
    `, [startDate, endDate]);
    
    res.json({
      success: true,
      report: {
        period: { start: startDate, end: endDate },
        sales: {
          total_orders: sales?.total_orders || 0,
          total_covers: sales?.total_covers || 0,
          total_revenue: Math.round((sales?.total_revenue || 0) * 100) / 100,
          food_revenue: Math.round((sales?.food_revenue || 0) * 100) / 100,
          beverage_revenue: Math.round((sales?.beverage_revenue || 0) * 100) / 100,
          food_percent: sales?.total_revenue ? Math.round((sales.food_revenue / sales.total_revenue) * 1000) / 10 : 0,
          beverage_percent: sales?.total_revenue ? Math.round((sales.beverage_revenue / sales.total_revenue) * 1000) / 10 : 0,
          avg_check: Math.round((sales?.avg_check || 0) * 100) / 100,
          best_day: sales?.best_day_revenue || 0,
          worst_day: sales?.worst_day_revenue || 0
        },
        waste: {
          total_cost: waste?.total_cost || 0,
          incidents: waste?.incidents || 0,
          waste_percent: sales?.total_revenue ? Math.round((waste?.total_cost || 0) / sales.total_revenue * 1000) / 10 : 0
        },
        top_items: topItems
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// STARTUP
// ============================================

async function start() {
  await ensureTables();
  
  app.get('*', (req, res) => {
    if (fs.existsSync(path.join(uiPath, 'index.html'))) {
      res.sendFile(path.join(uiPath, 'index.html'));
    } else {
      res.json({ service: SERVICE_NAME, mode: 'lite', status: 'running' });
    }
  });
  
  app.listen(PORT, () => {
    console.log(`✅ ${SERVICE_NAME} (Lite) running on port ${PORT}`);
  });
}

start();
