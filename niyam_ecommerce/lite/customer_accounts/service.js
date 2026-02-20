const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');
const { notifyAccounting } = require('../shared/accounting-hook');

const app = express();
const PORT = process.env.PORT || 9155;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'customer_accounts', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'customer_accounts' }));
app.get('/readyz', (req, res) => res.json({ status: 'ok', service: 'customer_accounts', ready: true }));

// ── Loyalty tier calculation ─────────────────────────────────────────
function calculateLoyaltyTier(points) {
  if (points >= 5000) return 'platinum';
  if (points >= 2000) return 'gold';
  if (points >= 500) return 'silver';
  return 'bronze';
}

// ── List customers ───────────────────────────────────────────────────
app.get('/customers', (req, res) => {
  try {
    const { search, loyalty_tier, is_active, limit = 200 } = req.query;
    let sql = 'SELECT * FROM customers WHERE 1=1';
    const params = [];
    if (search) {
      sql += " AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ?)";
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    if (loyalty_tier) { sql += ' AND loyalty_tier = ?'; params.push(loyalty_tier); }
    if (is_active !== undefined) { sql += ' AND is_active = ?'; params.push(is_active === 'true' ? 1 : 0); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    const customers = query(sql, params);
    res.json({ success: true, data: customers });
  } catch (err) { res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }); }
});

// ── Get customer by ID ───────────────────────────────────────────────
app.get('/customers/:id', (req, res) => {
  try {
    const customer = get('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    if (!customer) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } });
    res.json({ success: true, data: customer });
  } catch (err) { res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }); }
});

// ── Create customer ──────────────────────────────────────────────────
app.post('/customers', (req, res) => {
  try {
    const { email, first_name, last_name, phone, loyalty_points = 0, tags = [], notes } = req.body;
    if (!email || !first_name || !last_name) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'email, first_name, and last_name are required' } });
    }
    const existing = get('SELECT id FROM customers WHERE email = ?', [email]);
    if (existing) return res.status(400).json({ success: false, error: { code: 'DUPLICATE_EMAIL', message: 'Customer with this email already exists' } });

    const id = uuidv4();
    const loyalty_tier = calculateLoyaltyTier(loyalty_points);
    run(`INSERT INTO customers (id, email, first_name, last_name, phone, loyalty_points, loyalty_tier, tags, notes, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [id, email, first_name, last_name, phone || null, loyalty_points, loyalty_tier, JSON.stringify(tags), notes || null]);

    notifyAccounting('ecommerce', 'ecommerce.customer.created', { customer_id: id, email, first_name, last_name });
    res.status(201).json({ success: true, data: { id, email, first_name, last_name, loyalty_points, loyalty_tier } });
  } catch (err) { res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }); }
});

// ── Update customer ──────────────────────────────────────────────────
app.patch('/customers/:id', (req, res) => {
  try {
    const customer = get('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    if (!customer) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } });

    const fields = [];
    const params = [];
    const allowed = ['email', 'first_name', 'last_name', 'phone', 'loyalty_points', 'total_orders', 'total_spent', 'notes', 'is_active', 'last_login_at'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(req.body[key]);
      }
    }
    if (req.body.tags !== undefined) {
      fields.push('tags = ?');
      params.push(JSON.stringify(req.body.tags));
    }
    if (req.body.loyalty_points !== undefined) {
      fields.push('loyalty_tier = ?');
      params.push(calculateLoyaltyTier(req.body.loyalty_points));
    }
    if (fields.length === 0) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } });

    fields.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(req.params.id);
    run(`UPDATE customers SET ${fields.join(', ')} WHERE id = ?`, params);

    notifyAccounting('ecommerce', 'ecommerce.customer.updated', { customer_id: req.params.id });
    const updated = get('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: updated });
  } catch (err) { res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }); }
});

// ── Deactivate customer ──────────────────────────────────────────────
app.delete('/customers/:id', (req, res) => {
  try {
    const customer = get('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    if (!customer) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } });
    run('UPDATE customers SET is_active = 0, updated_at = ? WHERE id = ?', [new Date().toISOString(), req.params.id]);
    res.json({ success: true, data: { message: 'Customer deactivated' } });
  } catch (err) { res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }); }
});

// ── List addresses ───────────────────────────────────────────────────
app.get('/customers/:customer_id/addresses', (req, res) => {
  try {
    const addresses = query('SELECT * FROM addresses WHERE customer_id = ? ORDER BY is_default DESC', [req.params.customer_id]);
    res.json({ success: true, data: addresses });
  } catch (err) { res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }); }
});

// ── Add address ──────────────────────────────────────────────────────
app.post('/customers/:customer_id/addresses', (req, res) => {
  try {
    const { type = 'shipping', is_default = false, first_name, last_name, line1, line2, city, state, postal_code, country = 'US', phone } = req.body;
    if (!line1 || !city || !postal_code) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'line1, city, and postal_code are required' } });
    }
    const id = uuidv4();
    if (is_default) {
      run('UPDATE addresses SET is_default = 0 WHERE customer_id = ? AND type = ?', [req.params.customer_id, type]);
    }
    run(`INSERT INTO addresses (id, customer_id, type, is_default, first_name, last_name, line1, line2, city, state, postal_code, country, phone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.params.customer_id, type, is_default ? 1 : 0, first_name || null, last_name || null, line1, line2 || null, city, state || null, postal_code, country, phone || null]);
    res.status(201).json({ success: true, data: { id, type, is_default, line1, city, postal_code, country } });
  } catch (err) { res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }); }
});

// ── Update address ───────────────────────────────────────────────────
app.patch('/customers/:customer_id/addresses/:address_id', (req, res) => {
  try {
    const addr = get('SELECT * FROM addresses WHERE id = ? AND customer_id = ?', [req.params.address_id, req.params.customer_id]);
    if (!addr) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Address not found' } });

    const fields = [];
    const params = [];
    const allowed = ['type', 'first_name', 'last_name', 'line1', 'line2', 'city', 'state', 'postal_code', 'country', 'phone'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) { fields.push(`${key} = ?`); params.push(req.body[key]); }
    }
    if (req.body.is_default === true) {
      run('UPDATE addresses SET is_default = 0 WHERE customer_id = ? AND type = ?', [req.params.customer_id, req.body.type || addr.type]);
      fields.push('is_default = ?');
      params.push(1);
    } else if (req.body.is_default === false) {
      fields.push('is_default = ?');
      params.push(0);
    }
    if (fields.length === 0) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } });
    params.push(req.params.address_id, req.params.customer_id);
    run(`UPDATE addresses SET ${fields.join(', ')} WHERE id = ? AND customer_id = ?`, params);
    const updated = get('SELECT * FROM addresses WHERE id = ?', [req.params.address_id]);
    res.json({ success: true, data: updated });
  } catch (err) { res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }); }
});

// ── Delete address ───────────────────────────────────────────────────
app.delete('/customers/:customer_id/addresses/:address_id', (req, res) => {
  try {
    const addr = get('SELECT * FROM addresses WHERE id = ? AND customer_id = ?', [req.params.address_id, req.params.customer_id]);
    if (!addr) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Address not found' } });
    run('DELETE FROM addresses WHERE id = ? AND customer_id = ?', [req.params.address_id, req.params.customer_id]);
    res.json({ success: true, data: { message: 'Address deleted' } });
  } catch (err) { res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }); }
});

// ── Set default address ──────────────────────────────────────────────
app.patch('/customers/:customer_id/addresses/:address_id/default', (req, res) => {
  try {
    const addr = get('SELECT * FROM addresses WHERE id = ? AND customer_id = ?', [req.params.address_id, req.params.customer_id]);
    if (!addr) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Address not found' } });
    run('UPDATE addresses SET is_default = 0 WHERE customer_id = ? AND type = ?', [req.params.customer_id, addr.type]);
    run('UPDATE addresses SET is_default = 1 WHERE id = ?', [req.params.address_id]);
    const updated = get('SELECT * FROM addresses WHERE id = ?', [req.params.address_id]);
    res.json({ success: true, data: updated });
  } catch (err) { res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }); }
});

// ── List wishlist ────────────────────────────────────────────────────
app.get('/customers/:customer_id/wishlists', (req, res) => {
  try {
    const items = query('SELECT * FROM wishlists WHERE customer_id = ? ORDER BY added_at DESC', [req.params.customer_id]);
    res.json({ success: true, data: items });
  } catch (err) { res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }); }
});

// ── Add to wishlist ──────────────────────────────────────────────────
app.post('/customers/:customer_id/wishlists', (req, res) => {
  try {
    const { product_id } = req.body;
    if (!product_id) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'product_id is required' } });
    const existing = get('SELECT * FROM wishlists WHERE customer_id = ? AND product_id = ?', [req.params.customer_id, product_id]);
    if (existing) return res.status(409).json({ success: false, error: { code: 'DUPLICATE_ENTRY', message: 'Product already in wishlist' } });
    const id = uuidv4();
    run('INSERT INTO wishlists (id, customer_id, product_id) VALUES (?, ?, ?)', [id, req.params.customer_id, product_id]);
    res.status(201).json({ success: true, data: { id, customer_id: req.params.customer_id, product_id } });
  } catch (err) { res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }); }
});

// ── Remove from wishlist ─────────────────────────────────────────────
app.delete('/customers/:customer_id/wishlists/:product_id', (req, res) => {
  try {
    const existing = get('SELECT * FROM wishlists WHERE customer_id = ? AND product_id = ?', [req.params.customer_id, req.params.product_id]);
    if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not in wishlist' } });
    run('DELETE FROM wishlists WHERE customer_id = ? AND product_id = ?', [req.params.customer_id, req.params.product_id]);
    res.json({ success: true, data: { message: 'Removed from wishlist' } });
  } catch (err) { res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'customer_accounts', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Customer Accounts Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
