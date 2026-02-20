const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8881;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'analytical_dashboard', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'analytical_dashboard' }));

// Main dashboard
app.get('/dashboard', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Sales metrics
    const todaySales = get(`SELECT COUNT(*) as count, SUM(total) as total, SUM(tax) as tax FROM sales WHERE date(created_at) = date(?)`, [today]);
    const monthSales = get(`SELECT COUNT(*) as count, SUM(total) as total FROM sales WHERE created_at >= date('now', 'start of month')`);
    
    // Inventory metrics
    const inventoryValue = get('SELECT SUM(p.price * i.quantity) as value FROM inventory i JOIN products p ON i.product_id = p.id');
    const lowStock = get('SELECT COUNT(*) as count FROM inventory WHERE quantity <= min_quantity AND min_quantity > 0');
    
    // Customer metrics
    const totalCustomers = get('SELECT COUNT(*) as count FROM customers');
    const newCustomers = get(`SELECT COUNT(*) as count FROM customers WHERE created_at >= date('now', 'start of month')`);
    
    // Order metrics
    const pendingOrders = get("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'");
    
    res.json({
      success: true,
      dashboard: {
        sales: {
          today: todaySales?.total || 0,
          today_count: todaySales?.count || 0,
          month: monthSales?.total || 0,
          month_count: monthSales?.count || 0
        },
        inventory: {
          total_value: inventoryValue?.value || 0,
          low_stock_items: lowStock?.count || 0
        },
        customers: {
          total: totalCustomers?.count || 0,
          new_this_month: newCustomers?.count || 0
        },
        orders: {
          pending: pendingOrders?.count || 0
        }
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Sales trend
app.get('/analytics/sales-trend', (req, res) => {
  try {
    const { days = 30 } = req.query;
    const trend = query(`SELECT date(created_at) as date, COUNT(*) as count, SUM(total) as total 
      FROM sales WHERE created_at >= date('now', '-${parseInt(days)} days') 
      GROUP BY date(created_at) ORDER BY date`);
    res.json({ success: true, trend });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Category performance
app.get('/analytics/categories', (req, res) => {
  try {
    const categories = query(`SELECT p.category, COUNT(DISTINCT p.id) as products, SUM(i.quantity) as total_stock
      FROM products p LEFT JOIN inventory i ON p.id = i.product_id WHERE p.active = 1 AND p.category IS NOT NULL
      GROUP BY p.category ORDER BY total_stock DESC`);
    res.json({ success: true, categories });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Customer insights
app.get('/analytics/customers', (req, res) => {
  try {
    const topCustomers = query(`SELECT c.id, c.name, c.email, COUNT(s.id) as orders, SUM(s.total) as total_spent
      FROM customers c LEFT JOIN sales s ON c.id = s.customer_id GROUP BY c.id ORDER BY total_spent DESC LIMIT 10`);
    const loyaltyDist = query(`SELECT 
      CASE WHEN loyalty_points >= 10000 THEN 'Platinum'
           WHEN loyalty_points >= 5000 THEN 'Gold'
           WHEN loyalty_points >= 1000 THEN 'Silver'
           ELSE 'Bronze' END as tier, COUNT(*) as count
      FROM customers GROUP BY tier`);
    res.json({ success: true, top_customers: topCustomers, loyalty_distribution: loyaltyDist });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Inventory insights
app.get('/analytics/inventory', (req, res) => {
  try {
    const stockLevels = query(`SELECT 
      CASE WHEN i.quantity = 0 THEN 'Out of Stock'
           WHEN i.quantity <= i.min_quantity THEN 'Low Stock'
           WHEN i.quantity >= i.max_quantity THEN 'Overstock'
           ELSE 'Normal' END as status, COUNT(*) as count
      FROM inventory i WHERE i.min_quantity > 0 GROUP BY status`);
    const topValue = query(`SELECT p.id, p.name, p.sku, i.quantity, p.price, (p.price * i.quantity) as value
      FROM products p JOIN inventory i ON p.id = i.product_id ORDER BY value DESC LIMIT 10`);
    res.json({ success: true, stock_levels: stockLevels, highest_value: topValue });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Revenue breakdown
app.get('/analytics/revenue', (req, res) => {
  try {
    const { period = 'month' } = req.query;
    let dateFilter = "created_at >= date('now', 'start of month')";
    if (period === 'week') dateFilter = "created_at >= date('now', '-7 days')";
    else if (period === 'year') dateFilter = "created_at >= date('now', 'start of year')";
    
    const revenue = get(`SELECT SUM(total) as gross, SUM(tax) as tax, SUM(discount) as discounts FROM sales WHERE ${dateFilter}`);
    const byPayment = query(`SELECT payment_method, SUM(total) as total FROM sales WHERE ${dateFilter} GROUP BY payment_method`);
    
    res.json({
      success: true,
      revenue: {
        gross: revenue?.gross || 0,
        tax: revenue?.tax || 0,
        discounts: revenue?.discounts || 0,
        net: (revenue?.gross || 0) - (revenue?.discounts || 0)
      },
      by_payment_method: byPayment
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// KPIs
app.get('/analytics/kpis', (req, res) => {
  try {
    const avgOrderValue = get('SELECT AVG(total) as avg FROM sales');
    const avgItemsPerOrder = get('SELECT AVG(json_array_length(items)) as avg FROM sales WHERE items IS NOT NULL');
    const returnRate = get(`SELECT 
      (SELECT COUNT(*) FROM returns) * 100.0 / NULLIF((SELECT COUNT(*) FROM sales), 0) as rate`);
    
    res.json({
      success: true,
      kpis: {
        average_order_value: avgOrderValue?.avg || 0,
        average_items_per_order: avgItemsPerOrder?.avg || 0,
        return_rate: returnRate?.rate || 0
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'analytical_dashboard', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Analytical Dashboard Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
