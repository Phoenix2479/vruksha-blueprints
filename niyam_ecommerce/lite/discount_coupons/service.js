const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');
const { notifyAccounting } = require('../shared/accounting-hook');

const app = express();
const PORT = process.env.PORT || 9159;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'discount_coupons', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'discount_coupons' }));
app.get('/readyz', (req, res) => res.json({ status: 'ok', service: 'discount_coupons', ready: true }));

// ── Coupons ─────────────────────────────────────────────────────

// List coupons
app.get('/coupons', (req, res) => {
  try {
    const { active_only, search, limit = 100 } = req.query;
    let sql = 'SELECT * FROM coupons WHERE 1=1';
    const params = [];
    if (active_only === 'true') { sql += ' AND is_active = 1'; }
    if (search) { sql += ' AND (code LIKE ? OR description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    const coupons = query(sql, params);
    res.json({ success: true, data: coupons });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Analytics
app.get('/coupons/analytics', (req, res) => {
  try {
    const totalCoupons = get('SELECT COUNT(*) as count FROM coupons') || { count: 0 };
    const activeCoupons = get("SELECT COUNT(*) as count FROM coupons WHERE is_active = 1") || { count: 0 };
    const totalRedemptions = get('SELECT COUNT(*) as count, COALESCE(SUM(discount_applied), 0) as total_saved FROM coupon_usage') || { count: 0, total_saved: 0 };
    const topCoupons = query(`SELECT c.id, c.code, c.discount_type, c.discount_value, c.uses_count,
      COALESCE(SUM(cu.discount_applied), 0) as total_discount_given, COUNT(cu.id) as redemption_count
      FROM coupons c LEFT JOIN coupon_usage cu ON cu.coupon_id = c.id
      GROUP BY c.id ORDER BY c.uses_count DESC LIMIT 10`);

    res.json({
      success: true,
      data: {
        total_coupons: totalCoupons.count,
        active_coupons: activeCoupons.count,
        total_redemptions: totalRedemptions.count,
        total_revenue_saved: totalRedemptions.total_saved,
        top_coupons: topCoupons
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Validate coupon
app.post('/coupons/validate', (req, res) => {
  try {
    const { code, customer_id, order_amount, product_ids, category_ids } = req.body;
    if (!code) return res.status(400).json({ success: false, error: 'Code is required' });

    const coupon = get('SELECT * FROM coupons WHERE code = ?', [code.toUpperCase()]);
    if (!coupon) return res.json({ success: true, data: { valid: false, reason: 'Coupon not found' } });
    if (!coupon.is_active) return res.json({ success: true, data: { valid: false, reason: 'Coupon is not active' } });

    const now = new Date().toISOString();
    if (coupon.starts_at && coupon.starts_at > now) return res.json({ success: true, data: { valid: false, reason: 'Coupon has not started yet' } });
    if (coupon.expires_at && coupon.expires_at < now) return res.json({ success: true, data: { valid: false, reason: 'Coupon has expired' } });
    if (coupon.max_uses !== null && coupon.uses_count >= coupon.max_uses) return res.json({ success: true, data: { valid: false, reason: 'Coupon usage limit reached' } });

    if (customer_id && coupon.max_uses_per_customer) {
      const usage = get('SELECT COUNT(*) as count FROM coupon_usage WHERE coupon_id = ? AND customer_id = ?', [coupon.id, customer_id]);
      if (usage && usage.count >= coupon.max_uses_per_customer) {
        return res.json({ success: true, data: { valid: false, reason: 'Per-customer usage limit reached' } });
      }
    }

    if (order_amount !== undefined && coupon.min_order_amount > 0 && parseFloat(order_amount) < coupon.min_order_amount) {
      return res.json({ success: true, data: { valid: false, reason: `Minimum order amount is ${coupon.min_order_amount}` } });
    }

    // Check applicable products
    const applicableProducts = JSON.parse(coupon.applicable_products || '[]');
    if (applicableProducts.length > 0 && product_ids && product_ids.length > 0) {
      const hasMatch = product_ids.some(pid => applicableProducts.includes(pid));
      if (!hasMatch) return res.json({ success: true, data: { valid: false, reason: 'Coupon does not apply to these products' } });
    }

    // Check applicable categories
    const applicableCategories = JSON.parse(coupon.applicable_categories || '[]');
    if (applicableCategories.length > 0 && category_ids && category_ids.length > 0) {
      const hasMatch = category_ids.some(cid => applicableCategories.includes(cid));
      if (!hasMatch) return res.json({ success: true, data: { valid: false, reason: 'Coupon does not apply to these categories' } });
    }

    let discountAmount = 0;
    if (order_amount !== undefined) {
      const amt = parseFloat(order_amount);
      if (coupon.discount_type === 'percentage') {
        discountAmount = Math.round(amt * coupon.discount_value / 100 * 100) / 100;
      } else if (coupon.discount_type === 'fixed') {
        discountAmount = Math.min(coupon.discount_value, amt);
      }
      if (coupon.max_discount_amount !== null && discountAmount > coupon.max_discount_amount) {
        discountAmount = coupon.max_discount_amount;
      }
    }

    res.json({
      success: true,
      data: {
        valid: true,
        coupon: { id: coupon.id, code: coupon.code, discount_type: coupon.discount_type, discount_value: coupon.discount_value },
        discount_amount: discountAmount,
        adjusted_total: order_amount !== undefined ? Math.max(0, parseFloat(order_amount) - discountAmount) : undefined
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Apply coupon
app.post('/coupons/apply', (req, res) => {
  try {
    const { code, customer_id, order_id, order_amount, product_ids, category_ids } = req.body;
    if (!code || order_amount === undefined) {
      return res.status(400).json({ success: false, error: 'code and order_amount are required' });
    }

    // Validate first (inline simplified version)
    const coupon = get('SELECT * FROM coupons WHERE code = ?', [code.toUpperCase()]);
    if (!coupon || !coupon.is_active) {
      return res.status(400).json({ success: false, error: 'Invalid or inactive coupon' });
    }

    const now = new Date().toISOString();
    if (coupon.expires_at && coupon.expires_at < now) {
      return res.status(400).json({ success: false, error: 'Coupon has expired' });
    }
    if (coupon.max_uses !== null && coupon.uses_count >= coupon.max_uses) {
      return res.status(400).json({ success: false, error: 'Coupon usage limit reached' });
    }

    let discountAmount = 0;
    const amt = parseFloat(order_amount);
    if (coupon.discount_type === 'percentage') {
      discountAmount = Math.round(amt * coupon.discount_value / 100 * 100) / 100;
    } else if (coupon.discount_type === 'fixed') {
      discountAmount = Math.min(coupon.discount_value, amt);
    }
    if (coupon.max_discount_amount !== null && discountAmount > coupon.max_discount_amount) {
      discountAmount = coupon.max_discount_amount;
    }

    const usageId = uuidv4();
    run('INSERT INTO coupon_usage (id, coupon_id, customer_id, order_id, discount_applied) VALUES (?, ?, ?, ?, ?)',
      [usageId, coupon.id, customer_id || null, order_id || null, discountAmount]);

    run('UPDATE coupons SET uses_count = uses_count + 1 WHERE id = ?', [coupon.id]);

    notifyAccounting('ecommerce', 'ecommerce.coupon.redeemed', {
      coupon_id: coupon.id, code: coupon.code, customer_id, order_id, discount_applied: discountAmount
    });

    res.json({
      success: true,
      data: {
        coupon: { id: coupon.id, code: coupon.code, discount_type: coupon.discount_type, discount_value: coupon.discount_value },
        discount_amount: discountAmount,
        adjusted_total: Math.max(0, amt - discountAmount)
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get coupon by ID
app.get('/coupons/:id', (req, res) => {
  try {
    const coupon = get('SELECT * FROM coupons WHERE id = ?', [req.params.id]);
    if (!coupon) return res.status(404).json({ success: false, error: 'Coupon not found' });
    res.json({ success: true, data: coupon });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get coupon usage history
app.get('/coupons/:id/usage', (req, res) => {
  try {
    const usage = query('SELECT * FROM coupon_usage WHERE coupon_id = ? ORDER BY used_at DESC', [req.params.id]);
    res.json({ success: true, data: usage });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Create coupon
app.post('/coupons', (req, res) => {
  try {
    const { code, description, discount_type, discount_value, min_order_amount, max_discount_amount, max_uses, max_uses_per_customer, applicable_products, applicable_categories, is_active, starts_at, expires_at } = req.body;
    if (!code || discount_value === undefined) {
      return res.status(400).json({ success: false, error: 'code and discount_value are required' });
    }

    const id = uuidv4();
    run(`INSERT INTO coupons (id, code, description, discount_type, discount_value, min_order_amount, max_discount_amount, max_uses, max_uses_per_customer, applicable_products, applicable_categories, is_active, starts_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, code.toUpperCase(), description || null, discount_type || 'percentage', discount_value,
        min_order_amount || 0, max_discount_amount || null, max_uses || null, max_uses_per_customer || 1,
        JSON.stringify(applicable_products || []), JSON.stringify(applicable_categories || []),
        is_active !== false ? 1 : 0, starts_at || null, expires_at || null
      ]);

    res.status(201).json({ success: true, data: { id, code: code.toUpperCase(), discount_type: discount_type || 'percentage', discount_value } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Update coupon
app.put('/coupons/:id', (req, res) => {
  try {
    const existing = get('SELECT * FROM coupons WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Coupon not found' });

    const { code, description, discount_type, discount_value, min_order_amount, max_discount_amount, max_uses, max_uses_per_customer, applicable_products, applicable_categories, is_active, starts_at, expires_at } = req.body;

    run(`UPDATE coupons SET code = ?, description = ?, discount_type = ?, discount_value = ?, min_order_amount = ?, max_discount_amount = ?, max_uses = ?, max_uses_per_customer = ?, applicable_products = ?, applicable_categories = ?, is_active = ?, starts_at = ?, expires_at = ? WHERE id = ?`,
      [
        code !== undefined ? code.toUpperCase() : existing.code,
        description !== undefined ? description : existing.description,
        discount_type !== undefined ? discount_type : existing.discount_type,
        discount_value !== undefined ? discount_value : existing.discount_value,
        min_order_amount !== undefined ? min_order_amount : existing.min_order_amount,
        max_discount_amount !== undefined ? max_discount_amount : existing.max_discount_amount,
        max_uses !== undefined ? max_uses : existing.max_uses,
        max_uses_per_customer !== undefined ? max_uses_per_customer : existing.max_uses_per_customer,
        applicable_products !== undefined ? JSON.stringify(applicable_products) : existing.applicable_products,
        applicable_categories !== undefined ? JSON.stringify(applicable_categories) : existing.applicable_categories,
        is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
        starts_at !== undefined ? starts_at : existing.starts_at,
        expires_at !== undefined ? expires_at : existing.expires_at,
        req.params.id
      ]);

    res.json({ success: true, data: { message: 'Coupon updated' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Delete coupon
app.delete('/coupons/:id', (req, res) => {
  try {
    const existing = get('SELECT * FROM coupons WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Coupon not found' });
    run('DELETE FROM coupon_usage WHERE coupon_id = ?', [req.params.id]);
    run('DELETE FROM coupons WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: { message: 'Coupon deleted' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'discount_coupons', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Discount Coupons Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
