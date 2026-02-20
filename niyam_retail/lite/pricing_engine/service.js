const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8876;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'pricing_engine', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'pricing_engine' }));

// Get price rules
app.get('/price-rules', (req, res) => {
  try {
    const { active = '1', product_id, category } = req.query;
    let sql = 'SELECT * FROM price_rules WHERE active = ?';
    const params = [parseInt(active)];
    if (product_id) { sql += ' AND product_id = ?'; params.push(product_id); }
    if (category) { sql += ' AND category = ?'; params.push(category); }
    sql += ' ORDER BY priority DESC, created_at DESC';
    res.json({ success: true, rules: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/price-rules', (req, res) => {
  try {
    const { name, product_id, category, rule_type, value, min_quantity, customer_group, start_date, end_date, priority } = req.body;
    if (!name || !rule_type) return res.status(400).json({ success: false, error: 'Name and rule_type required' });
    const id = uuidv4();
    run(`INSERT INTO price_rules (id, name, product_id, category, rule_type, value, min_quantity, customer_group, start_date, end_date, priority) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, product_id, category, rule_type, value, min_quantity, customer_group, start_date, end_date, priority || 0]);
    res.json({ success: true, rule: { id, name } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/price-rules/:id', (req, res) => {
  try {
    const { name, value, min_quantity, start_date, end_date, priority, active } = req.body;
    run(`UPDATE price_rules SET name = COALESCE(?, name), value = COALESCE(?, value), min_quantity = COALESCE(?, min_quantity),
         start_date = COALESCE(?, start_date), end_date = COALESCE(?, end_date), priority = COALESCE(?, priority), active = COALESCE(?, active) WHERE id = ?`,
      [name, value, min_quantity, start_date, end_date, priority, active, req.params.id]);
    res.json({ success: true, message: 'Rule updated' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/price-rules/:id', (req, res) => {
  try {
    run('DELETE FROM price_rules WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Rule deleted' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Calculate price for product
app.post('/pricing/calculate', (req, res) => {
  try {
    const { product_id, quantity = 1, customer_group } = req.body;
    if (!product_id) return res.status(400).json({ success: false, error: 'product_id required' });
    
    const product = get('SELECT * FROM products WHERE id = ?', [product_id]);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
    
    let finalPrice = product.price;
    const appliedRules = [];
    const now = new Date().toISOString();
    
    // Get applicable rules (ordered by priority)
    const rules = query(`SELECT * FROM price_rules WHERE active = 1 
      AND (product_id = ? OR product_id IS NULL)
      AND (category = ? OR category IS NULL)
      AND (min_quantity IS NULL OR min_quantity <= ?)
      AND (customer_group = ? OR customer_group IS NULL)
      AND (start_date IS NULL OR start_date <= ?)
      AND (end_date IS NULL OR end_date >= ?)
      ORDER BY priority DESC`,
      [product_id, product.category, quantity, customer_group, now, now]);
    
    for (const rule of rules) {
      let discount = 0;
      if (rule.rule_type === 'percentage') {
        discount = finalPrice * (rule.value / 100);
      } else if (rule.rule_type === 'fixed') {
        discount = rule.value;
      } else if (rule.rule_type === 'fixed_price') {
        finalPrice = rule.value;
        appliedRules.push({ rule: rule.name, type: 'fixed_price', new_price: rule.value });
        break;
      }
      if (discount > 0) {
        finalPrice -= discount;
        appliedRules.push({ rule: rule.name, type: rule.rule_type, discount });
      }
    }
    
    finalPrice = Math.max(0, finalPrice);
    
    res.json({
      success: true,
      product_id,
      original_price: product.price,
      final_price: finalPrice,
      quantity,
      line_total: finalPrice * quantity,
      applied_rules: appliedRules
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Bulk price update
app.post('/pricing/bulk-update', (req, res) => {
  try {
    const { category, adjustment_type, adjustment_value } = req.body;
    if (!adjustment_type || adjustment_value === undefined) {
      return res.status(400).json({ success: false, error: 'adjustment_type and adjustment_value required' });
    }
    
    let sql = 'SELECT * FROM products WHERE active = 1';
    const params = [];
    if (category) { sql += ' AND category = ?'; params.push(category); }
    const products = query(sql, params);
    
    let updated = 0;
    for (const product of products) {
      let newPrice = product.price;
      if (adjustment_type === 'percentage') {
        newPrice = product.price * (1 + adjustment_value / 100);
      } else if (adjustment_type === 'fixed') {
        newPrice = product.price + adjustment_value;
      }
      newPrice = Math.max(0, newPrice);
      run('UPDATE products SET price = ?, updated_at = ? WHERE id = ?', [newPrice, new Date().toISOString(), product.id]);
      updated++;
    }
    
    res.json({ success: true, updated });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Margin analysis
app.get('/pricing/margins', (req, res) => {
  try {
    const products = query('SELECT id, name, sku, price, cost FROM products WHERE active = 1 AND cost > 0');
    const analysis = products.map(p => ({
      ...p,
      margin: p.price - p.cost,
      margin_percent: ((p.price - p.cost) / p.price) * 100
    })).sort((a, b) => a.margin_percent - b.margin_percent);
    res.json({ success: true, products: analysis });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'pricing_engine', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Pricing Engine Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
