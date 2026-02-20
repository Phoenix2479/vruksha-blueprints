const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8886;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'business_tools', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'business_tools' }));

// Calculator endpoints
app.post('/tools/margin-calculator', (req, res) => {
  const { cost, price, markup_percent, margin_percent } = req.body;
  let result = {};
  if (cost && price) {
    result = { cost, price, margin: price - cost, margin_percent: ((price - cost) / price) * 100, markup_percent: ((price - cost) / cost) * 100 };
  } else if (cost && markup_percent) {
    const calcPrice = cost * (1 + markup_percent / 100);
    result = { cost, price: calcPrice, margin: calcPrice - cost, margin_percent: ((calcPrice - cost) / calcPrice) * 100, markup_percent };
  } else if (cost && margin_percent) {
    const calcPrice = cost / (1 - margin_percent / 100);
    result = { cost, price: calcPrice, margin: calcPrice - cost, margin_percent, markup_percent: ((calcPrice - cost) / cost) * 100 };
  }
  res.json({ success: true, result });
});

app.post('/tools/break-even', (req, res) => {
  const { fixed_costs, price_per_unit, variable_cost_per_unit } = req.body;
  if (!fixed_costs || !price_per_unit || variable_cost_per_unit === undefined) {
    return res.status(400).json({ success: false, error: 'fixed_costs, price_per_unit, variable_cost_per_unit required' });
  }
  const contribution = price_per_unit - variable_cost_per_unit;
  const breakEvenUnits = contribution > 0 ? Math.ceil(fixed_costs / contribution) : Infinity;
  const breakEvenRevenue = breakEvenUnits * price_per_unit;
  res.json({ success: true, result: { break_even_units: breakEvenUnits, break_even_revenue: breakEvenRevenue, contribution_per_unit: contribution } });
});

app.post('/tools/discount-calculator', (req, res) => {
  const { original_price, discount_percent, discount_amount } = req.body;
  let result = {};
  if (original_price && discount_percent) {
    const discounted = original_price * (1 - discount_percent / 100);
    result = { original_price, discount_percent, discount_amount: original_price - discounted, final_price: discounted };
  } else if (original_price && discount_amount) {
    const discounted = original_price - discount_amount;
    result = { original_price, discount_amount, discount_percent: (discount_amount / original_price) * 100, final_price: discounted };
  }
  res.json({ success: true, result });
});

app.post('/tools/tax-calculator', (req, res) => {
  const { amount, tax_rate, include_tax } = req.body;
  if (!amount || !tax_rate) return res.status(400).json({ success: false, error: 'amount and tax_rate required' });
  let result;
  if (include_tax) {
    const taxAmount = amount - (amount / (1 + tax_rate / 100));
    result = { amount_with_tax: amount, tax_amount: taxAmount, amount_without_tax: amount - taxAmount, tax_rate };
  } else {
    const taxAmount = amount * (tax_rate / 100);
    result = { amount_without_tax: amount, tax_amount: taxAmount, amount_with_tax: amount + taxAmount, tax_rate };
  }
  res.json({ success: true, result });
});

// Quick business stats
app.get('/tools/quick-stats', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const sales = get(`SELECT COUNT(*) as count, SUM(total) as total FROM sales WHERE date(created_at) = date(?)`, [today]);
    const inventory = get('SELECT SUM(p.price * i.quantity) as value FROM inventory i JOIN products p ON i.product_id = p.id');
    const customers = get('SELECT COUNT(*) as count FROM customers');
    res.json({ success: true, stats: { today_sales: sales?.total || 0, inventory_value: inventory?.value || 0, total_customers: customers?.count || 0 } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'business_tools', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Business Tools Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
