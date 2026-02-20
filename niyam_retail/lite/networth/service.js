const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8890;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'networth', mode: 'lite' }));

// Business net worth calculation
app.get('/networth/summary', (req, res) => {
  try {
    // Assets
    const inventoryValue = get('SELECT SUM(p.price * i.quantity) as total FROM inventory i JOIN products p ON i.product_id = p.id');
    const assetValue = get('SELECT SUM(current_value) as total FROM assets WHERE status = "active"');
    const receivables = get("SELECT SUM(total - amount_paid) as total FROM invoices WHERE status NOT IN ('paid', 'cancelled')");
    
    // Liabilities (simplified - outstanding to suppliers)
    const payables = get("SELECT SUM(total) as total FROM purchase_orders WHERE status IN ('draft', 'sent', 'confirmed')");
    
    const totalAssets = (inventoryValue?.total || 0) + (assetValue?.total || 0) + (receivables?.total || 0);
    const totalLiabilities = payables?.total || 0;
    const netWorth = totalAssets - totalLiabilities;
    
    res.json({
      success: true,
      networth: {
        assets: {
          inventory: inventoryValue?.total || 0,
          fixed_assets: assetValue?.total || 0,
          receivables: receivables?.total || 0,
          total: totalAssets
        },
        liabilities: {
          payables: totalLiabilities,
          total: totalLiabilities
        },
        net_worth: netWorth
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Assets breakdown
app.get('/networth/assets', (req, res) => {
  try {
    const inventory = get('SELECT SUM(p.price * i.quantity) as retail, SUM(p.cost * i.quantity) as cost FROM inventory i JOIN products p ON i.product_id = p.id');
    const assets = query('SELECT type, SUM(current_value) as value, COUNT(*) as count FROM assets WHERE status = "active" GROUP BY type');
    res.json({ success: true, assets: { inventory: { retail_value: inventory?.retail || 0, cost_value: inventory?.cost || 0 }, fixed_assets: assets } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Liabilities breakdown
app.get('/networth/liabilities', (req, res) => {
  try {
    const pendingPO = get("SELECT COUNT(*) as count, SUM(total) as total FROM purchase_orders WHERE status IN ('draft', 'sent', 'confirmed')");
    res.json({ success: true, liabilities: { pending_purchase_orders: { count: pendingPO?.count || 0, total: pendingPO?.total || 0 } } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Cash flow summary
app.get('/networth/cashflow', (req, res) => {
  try {
    const { period = 'month' } = req.query;
    let dateFilter = "created_at >= date('now', 'start of month')";
    if (period === 'week') dateFilter = "created_at >= date('now', '-7 days')";
    
    const inflow = get(`SELECT SUM(total) as total FROM sales WHERE ${dateFilter}`);
    const outflow = get(`SELECT SUM(total) as total FROM purchase_orders WHERE status = 'received' AND ${dateFilter}`);
    
    res.json({
      success: true,
      cashflow: {
        period,
        inflow: inflow?.total || 0,
        outflow: outflow?.total || 0,
        net: (inflow?.total || 0) - (outflow?.total || 0)
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'networth', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Networth Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
