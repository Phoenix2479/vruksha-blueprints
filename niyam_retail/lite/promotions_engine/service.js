const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8863;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'promotions_engine', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'promotions_engine' }));

// List promotions
app.get('/promotions', (req, res) => {
  try {
    const { active, type, limit = 100 } = req.query;
    let sql = 'SELECT * FROM promotions WHERE 1=1';
    const params = [];
    if (active !== undefined) { sql += ' AND active = ?'; params.push(parseInt(active)); }
    if (type) { sql += ' AND type = ?'; params.push(type); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    const promotions = query(sql, params);
    res.json({ success: true, promotions });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/promotions/:id', (req, res) => {
  try {
    const promo = get('SELECT * FROM promotions WHERE id = ?', [req.params.id]);
    if (!promo) return res.status(404).json({ success: false, error: 'Promotion not found' });
    res.json({ success: true, promotion: { ...promo, conditions: JSON.parse(promo.conditions || '{}') } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/promotions', (req, res) => {
  try {
    const { name, code, type, discount_type, discount_value, min_purchase, max_uses, start_date, end_date, conditions } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Name required' });
    const id = uuidv4();
    const promoCode = code || `PROMO-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
    run(`INSERT INTO promotions (id, name, code, type, discount_type, discount_value, min_purchase, max_uses, start_date, end_date, conditions) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, promoCode, type || 'coupon', discount_type || 'percentage', discount_value || 0, min_purchase || 0, max_uses, start_date, end_date, JSON.stringify(conditions || {})]);
    res.json({ success: true, promotion: { id, name, code: promoCode } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/promotions/:id', (req, res) => {
  try {
    const { name, discount_type, discount_value, min_purchase, max_uses, start_date, end_date, active, conditions } = req.body;
    run(`UPDATE promotions SET name = COALESCE(?, name), discount_type = COALESCE(?, discount_type), 
         discount_value = COALESCE(?, discount_value), min_purchase = COALESCE(?, min_purchase), max_uses = COALESCE(?, max_uses),
         start_date = COALESCE(?, start_date), end_date = COALESCE(?, end_date), active = COALESCE(?, active),
         conditions = COALESCE(?, conditions) WHERE id = ?`,
      [name, discount_type, discount_value, min_purchase, max_uses, start_date, end_date, active, conditions ? JSON.stringify(conditions) : null, req.params.id]);
    res.json({ success: true, message: 'Promotion updated' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Validate promo code
app.post('/promotions/validate', (req, res) => {
  try {
    const { code, cart_total, customer_id } = req.body;
    if (!code) return res.status(400).json({ success: false, error: 'Code required' });
    
    const promo = get('SELECT * FROM promotions WHERE code = ? AND active = 1', [code]);
    if (!promo) return res.status(404).json({ success: false, error: 'Invalid promo code' });
    
    const now = new Date().toISOString();
    if (promo.start_date && now < promo.start_date) return res.status(400).json({ success: false, error: 'Promotion not yet active' });
    if (promo.end_date && now > promo.end_date) return res.status(400).json({ success: false, error: 'Promotion expired' });
    if (promo.max_uses && promo.uses_count >= promo.max_uses) return res.status(400).json({ success: false, error: 'Promotion limit reached' });
    if (promo.min_purchase && cart_total < promo.min_purchase) return res.status(400).json({ success: false, error: `Minimum purchase of ${promo.min_purchase} required` });
    
    let discount = 0;
    if (promo.discount_type === 'percentage') discount = (cart_total * promo.discount_value) / 100;
    else if (promo.discount_type === 'fixed') discount = promo.discount_value;
    
    res.json({ success: true, valid: true, promotion: promo, discount, new_total: cart_total - discount });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Apply promo (increment usage)
app.post('/promotions/:id/apply', (req, res) => {
  try {
    run('UPDATE promotions SET uses_count = uses_count + 1 WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Promotion applied' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get active promotions
app.get('/promotions/active', (req, res) => {
  try {
    const now = new Date().toISOString();
    const promos = query(`SELECT * FROM promotions WHERE active = 1 AND (start_date IS NULL OR start_date <= ?) AND (end_date IS NULL OR end_date >= ?)`, [now, now]);
    res.json({ success: true, promotions: promos });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Toggle promotion
app.patch('/promotions/:id/toggle', (req, res) => {
  try {
    const promo = get('SELECT active FROM promotions WHERE id = ?', [req.params.id]);
    if (!promo) return res.status(404).json({ success: false, error: 'Promotion not found' });
    run('UPDATE promotions SET active = ? WHERE id = ?', [promo.active ? 0 : 1, req.params.id]);
    res.json({ success: true, active: !promo.active });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'promotions_engine', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Promotions Engine Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
