const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8951;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'customer_loyalty', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'customer_loyalty' }));
app.get('/status', (req, res) => res.json({ success: true, service: 'customer_loyalty', ready: true }));

// Get loyalty summary for customer
app.get('/loyalty/:customer_id/summary', (req, res) => {
  try {
    const customer = get('SELECT id, name, email, loyalty_points FROM customers WHERE id = ?', [req.params.customer_id]);
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });
    const transactions = query('SELECT * FROM loyalty_transactions WHERE customer_id = ? ORDER BY created_at DESC LIMIT 100', [req.params.customer_id]);
    
    // Calculate tier
    const points = customer.loyalty_points || 0;
    let tier = 'Bronze';
    if (points >= 10000) tier = 'Platinum';
    else if (points >= 5000) tier = 'Gold';
    else if (points >= 1000) tier = 'Silver';
    
    res.json({ success: true, customer: { ...customer, loyalty_tier: tier }, transactions });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Earn points
app.post('/loyalty/earn', (req, res) => {
  try {
    const { customer_id, points, reason } = req.body;
    if (!customer_id || !points || points <= 0) return res.status(400).json({ success: false, error: 'customer_id and positive points required' });
    
    const customer = get('SELECT id, loyalty_points FROM customers WHERE id = ?', [customer_id]);
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });
    
    const before = customer.loyalty_points || 0;
    const after = before + points;
    
    run('UPDATE customers SET loyalty_points = ?, updated_at = ? WHERE id = ?', [after, new Date().toISOString(), customer_id]);
    run('INSERT INTO loyalty_transactions (id, customer_id, transaction_type, points, balance_before, balance_after, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), customer_id, 'earned', points, before, after, reason || 'purchase']);
    
    res.json({ success: true, balance: after, earned: points });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Redeem points
app.post('/loyalty/redeem', (req, res) => {
  try {
    const { customer_id, points, reason } = req.body;
    if (!customer_id || !points || points <= 0) return res.status(400).json({ success: false, error: 'customer_id and positive points required' });
    
    const customer = get('SELECT id, loyalty_points FROM customers WHERE id = ?', [customer_id]);
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });
    
    const before = customer.loyalty_points || 0;
    if (before < points) return res.status(400).json({ success: false, error: 'Insufficient points', available: before });
    
    const after = before - points;
    
    run('UPDATE customers SET loyalty_points = ?, updated_at = ? WHERE id = ?', [after, new Date().toISOString(), customer_id]);
    run('INSERT INTO loyalty_transactions (id, customer_id, transaction_type, points, balance_before, balance_after, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), customer_id, 'redeemed', points, before, after, reason || 'redeem']);
    
    res.json({ success: true, balance: after, redeemed: points });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get transaction history
app.get('/loyalty/:customer_id/transactions', (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const transactions = query('SELECT * FROM loyalty_transactions WHERE customer_id = ? ORDER BY created_at DESC LIMIT ?', [req.params.customer_id, parseInt(limit)]);
    res.json({ success: true, transactions });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// List all loyalty members
app.get('/loyalty/members', (req, res) => {
  try {
    const members = query('SELECT id, name, email, loyalty_points FROM customers WHERE loyalty_points > 0 ORDER BY loyalty_points DESC');
    res.json({ success: true, members });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Adjust points (admin)
app.post('/loyalty/adjust', (req, res) => {
  try {
    const { customer_id, points, reason } = req.body;
    if (!customer_id || points === undefined) return res.status(400).json({ success: false, error: 'customer_id and points required' });
    
    const customer = get('SELECT id, loyalty_points FROM customers WHERE id = ?', [customer_id]);
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });
    
    const before = customer.loyalty_points || 0;
    const after = Math.max(0, before + points);
    const type = points >= 0 ? 'adjustment_credit' : 'adjustment_debit';
    
    run('UPDATE customers SET loyalty_points = ?, updated_at = ? WHERE id = ?', [after, new Date().toISOString(), customer_id]);
    run('INSERT INTO loyalty_transactions (id, customer_id, transaction_type, points, balance_before, balance_after, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), customer_id, type, Math.abs(points), before, after, reason || 'admin adjustment']);
    
    res.json({ success: true, balance: after });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'customer_loyalty', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Customer Loyalty Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
