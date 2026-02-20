const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, get } = require('../shared/db');
const { notifyAccounting } = require('../shared/accounting-hook');

const app = express();
const PORT = process.env.PORT || 9162;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'sales_analytics', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'sales_analytics' }));
app.get('/readyz', (req, res) => res.json({ status: 'ok', service: 'sales_analytics', ready: true }));

// ── Dashboard KPIs ───────────────────────────────────────────────────
app.get('/dashboard/kpis', (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    // Revenue and order metrics from orders table
    let orderSql = "SELECT COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total ELSE 0 END), 0) as total_revenue, COUNT(*) as total_orders, COALESCE(AVG(CASE WHEN payment_status = 'paid' THEN total ELSE NULL END), 0) as avg_order_value FROM orders WHERE 1=1";
    const orderParams = [];
    if (start_date) { orderSql += ' AND created_at >= ?'; orderParams.push(start_date); }
    if (end_date) { orderSql += ' AND created_at <= ?'; orderParams.push(end_date); }
    const orderRow = get(orderSql, orderParams);

    // Refunds
    let refundSql = "SELECT COALESCE(SUM(amount), 0) as total_refunds FROM refunds WHERE status = 'processed'";
    const refundParams = [];
    if (start_date) { refundSql += ' AND created_at >= ?'; refundParams.push(start_date); }
    if (end_date) { refundSql += ' AND created_at <= ?'; refundParams.push(end_date); }
    const refundRow = get(refundSql, refundParams) || { total_refunds: 0 };

    // New customers
    let custSql = 'SELECT COUNT(*) as new_customers FROM customers WHERE 1=1';
    const custParams = [];
    if (start_date) { custSql += ' AND created_at >= ?'; custParams.push(start_date); }
    if (end_date) { custSql += ' AND created_at <= ?'; custParams.push(end_date); }
    const custRow = get(custSql, custParams) || { new_customers: 0 };

    const totalRevenue = orderRow ? orderRow.total_revenue : 0;
    const totalRefunds = refundRow.total_refunds;

    res.json({
      success: true,
      data: {
        total_revenue: totalRevenue,
        total_orders: orderRow ? orderRow.total_orders : 0,
        avg_order_value: orderRow ? parseFloat(parseFloat(orderRow.avg_order_value).toFixed(2)) : 0,
        total_refunds: totalRefunds,
        net_revenue: parseFloat((totalRevenue - totalRefunds).toFixed(2)),
        new_customers: custRow.new_customers
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Top products ─────────────────────────────────────────────────────
app.get('/analytics/products/top', (req, res) => {
  try {
    const { sort_by = 'revenue', limit = 10, start_date, end_date } = req.query;
    const orderBy = sort_by === 'units' ? 'units_sold DESC' : 'revenue DESC';

    let sql = `SELECT oi.product_id, COALESCE(oi.name, 'Unknown') as product_name, COALESCE(oi.sku, '') as sku,
               SUM(oi.quantity) as units_sold, SUM(oi.total_price) as revenue
               FROM order_items oi
               JOIN orders o ON o.id = oi.order_id
               WHERE o.payment_status = 'paid'`;
    const params = [];
    if (start_date) { sql += ' AND o.created_at >= ?'; params.push(start_date); }
    if (end_date) { sql += ' AND o.created_at <= ?'; params.push(end_date); }
    sql += ` GROUP BY oi.product_id, oi.name, oi.sku ORDER BY ${orderBy} LIMIT ?`;
    params.push(Math.min(parseInt(limit), 100));

    const products = query(sql, params).map(row => ({
      product_id: row.product_id,
      product_name: row.product_name,
      sku: row.sku,
      units_sold: row.units_sold,
      revenue: parseFloat(parseFloat(row.revenue).toFixed(2))
    }));

    res.json({ success: true, data: products });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Trends ───────────────────────────────────────────────────────────
app.get('/analytics/trends', (req, res) => {
  try {
    const { group_by = 'day', start_date, end_date } = req.query;

    let dateExpr;
    switch (group_by) {
      case 'week':
        dateExpr = "strftime('%Y-W%W', created_at)";
        break;
      case 'month':
        dateExpr = "strftime('%Y-%m', created_at)";
        break;
      default:
        dateExpr = "date(created_at)";
    }

    let sql = `SELECT ${dateExpr} as date, SUM(total) as revenue, COUNT(*) as orders, AVG(total) as avg_value
               FROM orders WHERE payment_status = 'paid'`;
    const params = [];
    if (start_date) { sql += ' AND created_at >= ?'; params.push(start_date); }
    if (end_date) { sql += ' AND created_at <= ?'; params.push(end_date); }
    sql += ' GROUP BY 1 ORDER BY 1 ASC';

    const trends = query(sql, params).map(row => ({
      date: row.date,
      revenue: parseFloat(parseFloat(row.revenue).toFixed(2)),
      orders: row.orders,
      avg_value: parseFloat(parseFloat(row.avg_value).toFixed(2))
    }));

    res.json({ success: true, data: trends });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'sales_analytics', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Sales Analytics Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
