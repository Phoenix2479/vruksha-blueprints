const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8871;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'reporting_analytics', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'reporting_analytics' }));

// Sales report
app.get('/reports/sales', (req, res) => {
  try {
    const { from_date, to_date, group_by = 'day' } = req.query;
    let sql = 'SELECT date(created_at) as date, COUNT(*) as transactions, SUM(total) as revenue, SUM(tax) as tax FROM sales WHERE 1=1';
    const params = [];
    if (from_date) { sql += ' AND created_at >= ?'; params.push(from_date); }
    if (to_date) { sql += ' AND created_at <= ?'; params.push(to_date); }
    sql += ' GROUP BY date(created_at) ORDER BY date DESC';
    const data = query(sql, params);
    const totals = get(`SELECT COUNT(*) as transactions, SUM(total) as revenue, SUM(tax) as tax FROM sales WHERE 1=1${from_date ? ' AND created_at >= ?' : ''}${to_date ? ' AND created_at <= ?' : ''}`, params);
    res.json({ success: true, data, totals: totals || {} });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Product performance
app.get('/reports/products', (req, res) => {
  try {
    const { from_date, to_date, limit = 50 } = req.query;
    // Aggregate from sales items (simplified)
    const products = query('SELECT p.id, p.name, p.sku, SUM(i.quantity) as sold FROM products p LEFT JOIN inventory i ON p.id = i.product_id GROUP BY p.id ORDER BY sold DESC LIMIT ?', [parseInt(limit)]);
    res.json({ success: true, products });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Customer report
app.get('/reports/customers', (req, res) => {
  try {
    const { from_date, to_date, limit = 50 } = req.query;
    const customers = query(`SELECT c.id, c.name, c.email, COUNT(s.id) as orders, SUM(s.total) as total_spent 
      FROM customers c LEFT JOIN sales s ON c.id = s.customer_id GROUP BY c.id ORDER BY total_spent DESC LIMIT ?`, [parseInt(limit)]);
    res.json({ success: true, customers });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Inventory report
app.get('/reports/inventory', (req, res) => {
  try {
    const { low_stock_only } = req.query;
    let sql = 'SELECT p.id, p.name, p.sku, i.quantity, i.min_quantity, i.location FROM products p LEFT JOIN inventory i ON p.id = i.product_id WHERE p.active = 1';
    if (low_stock_only === 'true') sql += ' AND i.quantity <= i.min_quantity';
    sql += ' ORDER BY i.quantity ASC';
    res.json({ success: true, inventory: query(sql, []) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Financial summary
app.get('/reports/financial', (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    const params = [];
    let dateFilter = '';
    if (from_date) { dateFilter += ' AND created_at >= ?'; params.push(from_date); }
    if (to_date) { dateFilter += ' AND created_at <= ?'; params.push(to_date); }
    
    const sales = get(`SELECT SUM(total) as revenue, SUM(tax) as tax_collected FROM sales WHERE 1=1${dateFilter}`, params);
    const invoices = get(`SELECT SUM(total) as invoiced, SUM(amount_paid) as collected FROM invoices WHERE 1=1${dateFilter.replace('created_at', 'issue_date')}`, params);
    const refunds = get(`SELECT SUM(refund_amount) as refunds FROM returns WHERE status = 'refunded'${dateFilter}`, params);
    
    res.json({ success: true, financial: { sales: sales || {}, invoices: invoices || {}, refunds: refunds?.refunds || 0 } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Dashboard summary
app.get('/reports/dashboard', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const todaySales = get(`SELECT COUNT(*) as count, SUM(total) as total FROM sales WHERE date(created_at) = date(?)`, [today]);
    const totalCustomers = get('SELECT COUNT(*) as count FROM customers');
    const totalProducts = get('SELECT COUNT(*) as count FROM products WHERE active = 1');
    const lowStock = get('SELECT COUNT(*) as count FROM inventory WHERE quantity <= min_quantity');
    const pendingOrders = get("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'");
    
    res.json({
      success: true,
      dashboard: {
        today_sales: todaySales?.total || 0,
        today_transactions: todaySales?.count || 0,
        total_customers: totalCustomers?.count || 0,
        total_products: totalProducts?.count || 0,
        low_stock_items: lowStock?.count || 0,
        pending_orders: pendingOrders?.count || 0
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Save/generate report
app.post('/reports/generate', (req, res) => {
  try {
    const { name, type, parameters } = req.body;
    const id = uuidv4();
    run('INSERT INTO reports (id, name, type, parameters, generated_at) VALUES (?, ?, ?, ?, ?)',
      [id, name, type, JSON.stringify(parameters || {}), new Date().toISOString()]);
    res.json({ success: true, report: { id, name, type } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// List saved reports
app.get('/reports/saved', (req, res) => {
  try {
    const reports = query('SELECT * FROM reports ORDER BY generated_at DESC LIMIT 100');
    res.json({ success: true, reports });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'reporting_analytics', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Reporting Analytics Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
