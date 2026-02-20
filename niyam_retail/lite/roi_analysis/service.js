const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8889;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'roi_analysis', mode: 'lite' }));

// ROI Calculator
app.post('/roi/calculate', (req, res) => {
  const { investment, gain, period_months } = req.body;
  if (!investment || gain === undefined) return res.status(400).json({ success: false, error: 'investment and gain required' });
  const roi = ((gain - investment) / investment) * 100;
  const annualizedRoi = period_months ? roi * (12 / period_months) : roi;
  res.json({ success: true, result: { investment, gain, net_return: gain - investment, roi_percent: roi, annualized_roi: annualizedRoi } });
});

// Product ROI
app.get('/roi/products', (req, res) => {
  try {
    const products = query('SELECT id, name, sku, price, cost FROM products WHERE active = 1 AND cost > 0');
    const analysis = products.map(p => ({
      ...p, margin: p.price - p.cost, roi_percent: ((p.price - p.cost) / p.cost) * 100
    })).sort((a, b) => b.roi_percent - a.roi_percent);
    res.json({ success: true, products: analysis });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Campaign ROI
app.get('/roi/campaigns', (req, res) => {
  try {
    const campaigns = query('SELECT * FROM campaigns WHERE budget > 0');
    const analysis = campaigns.map(c => {
      const metrics = c.metrics ? JSON.parse(c.metrics) : {};
      const revenue = metrics.revenue || 0;
      const roi = c.budget > 0 ? ((revenue - c.budget) / c.budget) * 100 : 0;
      return { id: c.id, name: c.name, budget: c.budget, revenue, roi_percent: roi };
    });
    res.json({ success: true, campaigns: analysis });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Inventory investment
app.get('/roi/inventory', (req, res) => {
  try {
    const investment = get('SELECT SUM(p.cost * i.quantity) as total FROM inventory i JOIN products p ON i.product_id = p.id');
    const retailValue = get('SELECT SUM(p.price * i.quantity) as total FROM inventory i JOIN products p ON i.product_id = p.id');
    const potentialRoi = investment?.total > 0 ? ((retailValue?.total - investment.total) / investment.total) * 100 : 0;
    res.json({ success: true, inventory: { cost_value: investment?.total || 0, retail_value: retailValue?.total || 0, potential_roi: potentialRoi } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Overall business ROI
app.get('/roi/business', (req, res) => {
  try {
    const { period = 'month' } = req.query;
    let dateFilter = "created_at >= date('now', 'start of month')";
    if (period === 'year') dateFilter = "created_at >= date('now', 'start of year')";
    
    const revenue = get(`SELECT SUM(total) as total FROM sales WHERE ${dateFilter}`);
    const costs = get(`SELECT SUM(total) as total FROM purchase_orders WHERE status = 'received' AND ${dateFilter}`);
    const profit = (revenue?.total || 0) - (costs?.total || 0);
    const roi = costs?.total > 0 ? (profit / costs.total) * 100 : 0;
    
    res.json({ success: true, business: { period, revenue: revenue?.total || 0, costs: costs?.total || 0, profit, roi_percent: roi } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'roi_analysis', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[ROI Analysis Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
