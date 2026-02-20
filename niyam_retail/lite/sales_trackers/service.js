const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8880;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'sales_trackers', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'sales_trackers' }));

// Today's sales
app.get('/sales/today', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const sales = query(`SELECT * FROM sales WHERE date(created_at) = date(?) ORDER BY created_at DESC`, [today]);
    const summary = get(`SELECT COUNT(*) as count, SUM(total) as total, SUM(tax) as tax FROM sales WHERE date(created_at) = date(?)`, [today]);
    res.json({ success: true, sales, summary: summary || {} });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// This week's sales
app.get('/sales/week', (req, res) => {
  try {
    const sales = query(`SELECT date(created_at) as date, COUNT(*) as count, SUM(total) as total 
      FROM sales WHERE created_at >= date('now', '-7 days') GROUP BY date(created_at) ORDER BY date DESC`);
    const summary = get(`SELECT COUNT(*) as count, SUM(total) as total FROM sales WHERE created_at >= date('now', '-7 days')`);
    res.json({ success: true, daily: sales, summary: summary || {} });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// This month's sales
app.get('/sales/month', (req, res) => {
  try {
    const sales = query(`SELECT date(created_at) as date, COUNT(*) as count, SUM(total) as total 
      FROM sales WHERE created_at >= date('now', 'start of month') GROUP BY date(created_at) ORDER BY date DESC`);
    const summary = get(`SELECT COUNT(*) as count, SUM(total) as total FROM sales WHERE created_at >= date('now', 'start of month')`);
    res.json({ success: true, daily: sales, summary: summary || {} });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Hourly breakdown
app.get('/sales/hourly', (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    const sales = query(`SELECT strftime('%H', created_at) as hour, COUNT(*) as count, SUM(total) as total 
      FROM sales WHERE date(created_at) = date(?) GROUP BY hour ORDER BY hour`, [targetDate]);
    res.json({ success: true, hourly: sales, date: targetDate });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Sales by payment method
app.get('/sales/by-payment', (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    let sql = 'SELECT payment_method, COUNT(*) as count, SUM(total) as total FROM sales WHERE 1=1';
    const params = [];
    if (from_date) { sql += ' AND created_at >= ?'; params.push(from_date); }
    if (to_date) { sql += ' AND created_at <= ?'; params.push(to_date); }
    sql += ' GROUP BY payment_method ORDER BY total DESC';
    res.json({ success: true, breakdown: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Top selling products
app.get('/sales/top-products', (req, res) => {
  try {
    const { limit = 10, from_date, to_date } = req.query;
    // Note: This is simplified - would need to parse items JSON for accurate counts
    const products = query(`SELECT p.id, p.name, p.sku, COUNT(s.id) as sale_count 
      FROM products p LEFT JOIN sales s ON s.items LIKE '%' || p.id || '%'
      WHERE p.active = 1 GROUP BY p.id ORDER BY sale_count DESC LIMIT ?`, [parseInt(limit)]);
    res.json({ success: true, products });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Sales targets (simple implementation)
app.get('/sales/targets', (req, res) => {
  try {
    const monthTarget = 100000; // Would be configurable
    const dailyTarget = monthTarget / 30;
    
    const today = get(`SELECT SUM(total) as total FROM sales WHERE date(created_at) = date('now')`);
    const month = get(`SELECT SUM(total) as total FROM sales WHERE created_at >= date('now', 'start of month')`);
    
    res.json({
      success: true,
      targets: {
        daily: { target: dailyTarget, actual: today?.total || 0, percent: ((today?.total || 0) / dailyTarget) * 100 },
        monthly: { target: monthTarget, actual: month?.total || 0, percent: ((month?.total || 0) / monthTarget) * 100 }
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Live sales feed (recent)
app.get('/sales/live', (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const sales = query(`SELECT s.*, c.name as customer_name FROM sales s 
      LEFT JOIN customers c ON s.customer_id = c.id ORDER BY s.created_at DESC LIMIT ?`, [parseInt(limit)]);
    res.json({ success: true, sales });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Comparison (today vs yesterday, this week vs last week)
app.get('/sales/compare', (req, res) => {
  try {
    const todayTotal = get(`SELECT SUM(total) as total FROM sales WHERE date(created_at) = date('now')`);
    const yesterdayTotal = get(`SELECT SUM(total) as total FROM sales WHERE date(created_at) = date('now', '-1 day')`);
    const thisWeek = get(`SELECT SUM(total) as total FROM sales WHERE created_at >= date('now', '-7 days')`);
    const lastWeek = get(`SELECT SUM(total) as total FROM sales WHERE created_at >= date('now', '-14 days') AND created_at < date('now', '-7 days')`);
    
    res.json({
      success: true,
      comparison: {
        today: todayTotal?.total || 0,
        yesterday: yesterdayTotal?.total || 0,
        today_vs_yesterday: yesterdayTotal?.total ? (((todayTotal?.total || 0) - yesterdayTotal.total) / yesterdayTotal.total * 100) : 0,
        this_week: thisWeek?.total || 0,
        last_week: lastWeek?.total || 0,
        week_vs_week: lastWeek?.total ? (((thisWeek?.total || 0) - lastWeek.total) / lastWeek.total * 100) : 0
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'sales_trackers', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Sales Trackers Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
