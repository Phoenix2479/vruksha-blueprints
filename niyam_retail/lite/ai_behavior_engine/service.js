const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8894;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'ai_behavior_engine', mode: 'lite' }));

// Customer behavior analysis
app.get('/behavior/customer/:customer_id', (req, res) => {
  try {
    const customer = get('SELECT * FROM customers WHERE id = ?', [req.params.customer_id]);
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });
    
    const purchases = query('SELECT * FROM sales WHERE customer_id = ? ORDER BY created_at DESC LIMIT 20', [req.params.customer_id]);
    const totalSpent = purchases.reduce((sum, p) => sum + (p.total || 0), 0);
    const avgOrder = purchases.length > 0 ? totalSpent / purchases.length : 0;
    
    // Simple behavior classification
    let segment = 'casual';
    if (purchases.length >= 10 && avgOrder > 100) segment = 'vip';
    else if (purchases.length >= 5) segment = 'regular';
    else if (purchases.length === 0) segment = 'new';
    
    res.json({
      success: true,
      customer_id: req.params.customer_id,
      behavior: {
        segment,
        total_purchases: purchases.length,
        total_spent: totalSpent,
        average_order: avgOrder,
        loyalty_points: customer.loyalty_points || 0
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Product recommendations (simple collaborative filtering mock)
app.get('/behavior/recommendations/:customer_id', (req, res) => {
  try {
    // Get customer's purchase history
    const purchases = query('SELECT items FROM sales WHERE customer_id = ?', [req.params.customer_id]);
    const purchasedIds = new Set();
    purchases.forEach(p => {
      const items = JSON.parse(p.items || '[]');
      items.forEach(i => purchasedIds.add(i.product_id));
    });
    
    // Recommend products not yet purchased (simple)
    const recommended = query(`SELECT id, name, price, category FROM products 
      WHERE active = 1 AND id NOT IN (${[...purchasedIds].map(() => '?').join(',') || "''"}) 
      ORDER BY RANDOM() LIMIT 5`, [...purchasedIds]);
    
    res.json({ success: true, recommendations: recommended });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Sales patterns
app.get('/behavior/patterns', (req, res) => {
  try {
    const hourly = query(`SELECT strftime('%H', created_at) as hour, COUNT(*) as count, SUM(total) as total 
      FROM sales GROUP BY hour ORDER BY hour`);
    const daily = query(`SELECT strftime('%w', created_at) as day, COUNT(*) as count, SUM(total) as total 
      FROM sales GROUP BY day ORDER BY day`);
    res.json({ success: true, patterns: { hourly, daily } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Churn risk (simplified)
app.get('/behavior/churn-risk', (req, res) => {
  try {
    const atRisk = query(`SELECT c.id, c.name, c.email, MAX(s.created_at) as last_purchase,
      julianday('now') - julianday(MAX(s.created_at)) as days_since
      FROM customers c LEFT JOIN sales s ON c.id = s.customer_id
      GROUP BY c.id HAVING days_since > 60 OR days_since IS NULL ORDER BY days_since DESC LIMIT 20`);
    res.json({ success: true, at_risk_customers: atRisk });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'ai_behavior_engine', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[AI Behavior Engine Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
