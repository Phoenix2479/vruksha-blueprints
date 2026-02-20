const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8892;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'advanced_pricing_optimization', mode: 'lite' }));

// Price elasticity analysis (simplified)
app.get('/pricing/elasticity/:product_id', (req, res) => {
  try {
    const product = get('SELECT * FROM products WHERE id = ?', [req.params.product_id]);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
    // Simplified: Return mock elasticity based on category
    const elasticity = product.category === 'luxury' ? -2.5 : product.category === 'essential' ? -0.5 : -1.2;
    res.json({ success: true, product_id: req.params.product_id, elasticity, interpretation: elasticity < -1 ? 'elastic' : 'inelastic' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Optimal price suggestion
app.post('/pricing/optimize', (req, res) => {
  const { product_id, cost, target_margin, competitor_price } = req.body;
  if (!cost) return res.status(400).json({ success: false, error: 'cost required' });
  
  const marginPrice = target_margin ? cost / (1 - target_margin / 100) : cost * 1.5;
  const competitivePrice = competitor_price ? competitor_price * 0.98 : marginPrice;
  const optimalPrice = Math.max(cost * 1.1, Math.min(marginPrice, competitivePrice));
  
  res.json({
    success: true,
    suggestions: {
      margin_based: marginPrice,
      competitive: competitivePrice,
      optimal: optimalPrice,
      expected_margin: ((optimalPrice - cost) / optimalPrice) * 100
    }
  });
});

// Bundle pricing
app.post('/pricing/bundle', (req, res) => {
  try {
    const { product_ids, discount_percent = 10 } = req.body;
    if (!product_ids || !Array.isArray(product_ids)) return res.status(400).json({ success: false, error: 'product_ids required' });
    
    let totalPrice = 0;
    const items = [];
    for (const id of product_ids) {
      const product = get('SELECT id, name, price FROM products WHERE id = ?', [id]);
      if (product) {
        totalPrice += product.price;
        items.push(product);
      }
    }
    
    const bundlePrice = totalPrice * (1 - discount_percent / 100);
    res.json({ success: true, bundle: { items, original_total: totalPrice, discount_percent, bundle_price: bundlePrice, savings: totalPrice - bundlePrice } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Dynamic pricing suggestion (time-based)
app.get('/pricing/dynamic/:product_id', (req, res) => {
  try {
    const product = get('SELECT * FROM products WHERE id = ?', [req.params.product_id]);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
    
    const hour = new Date().getHours();
    let multiplier = 1.0;
    if (hour >= 11 && hour <= 14) multiplier = 1.05; // Lunch rush
    else if (hour >= 17 && hour <= 20) multiplier = 1.08; // Evening rush
    else if (hour >= 22 || hour <= 6) multiplier = 0.95; // Off-peak
    
    res.json({
      success: true,
      product_id: req.params.product_id,
      base_price: product.price,
      suggested_price: product.price * multiplier,
      multiplier,
      reason: multiplier > 1 ? 'peak_demand' : multiplier < 1 ? 'off_peak' : 'normal'
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'advanced_pricing_optimization', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Advanced Pricing Optimization Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
