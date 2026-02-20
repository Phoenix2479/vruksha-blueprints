const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');
const { notifyAccounting } = require('../shared/accounting-hook');

const app = express();
const PORT = process.env.PORT || 9152;
const ABANDONMENT_HOURS = parseInt(process.env.CART_ABANDONMENT_HOURS) || 24;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'shopping_cart', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'shopping_cart' }));
app.get('/readyz', (req, res) => res.json({ status: 'ok', service: 'shopping_cart', ready: true }));

// ── Helper: recalculate cart totals ─────────────────────────────────
function recalculateCart(cartId) {
  // Recalculate each item total
  const items = query('SELECT * FROM cart_items WHERE cart_id = ?', [cartId]);
  for (const item of items) {
    const totalPrice = item.quantity * item.unit_price;
    run('UPDATE cart_items SET total_price = ? WHERE id = ?', [totalPrice, item.id]);
  }
  // Aggregate
  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  const cart = get('SELECT * FROM carts WHERE id = ?', [cartId]);
  const discount = cart ? (cart.discount_amount || 0) : 0;
  const tax = subtotal * 0.1; // Default 10% tax
  const total = subtotal + tax - discount;
  run("UPDATE carts SET subtotal = ?, tax = ?, total = ?, updated_at = datetime('now') WHERE id = ?",
    [subtotal, tax, Math.max(total, 0), cartId]);
}

// ── Helper: get cart with items ─────────────────────────────────────
function getCartWithItems(cartId) {
  const cart = get('SELECT * FROM carts WHERE id = ?', [cartId]);
  if (!cart) return null;
  const items = query('SELECT * FROM cart_items WHERE cart_id = ? ORDER BY rowid ASC', [cartId]);
  cart.items = items;
  return cart;
}

// ══════════════════════════════════════════════════════════════════════
// CART ENDPOINTS
// ══════════════════════════════════════════════════════════════════════

// Create cart
app.post('/carts', (req, res) => {
  try {
    const { customer_id, session_id, currency, notes } = req.body;
    const id = uuidv4();
    run(`INSERT INTO carts (id, customer_id, session_id, currency, notes) VALUES (?, ?, ?, ?, ?)`,
      [id, customer_id || null, session_id || null, currency || 'USD', notes || null]);
    const cart = getCartWithItems(id);
    res.status(201).json({ success: true, data: cart });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get cart by ID
app.get('/carts/:id', (req, res) => {
  try {
    const cart = getCartWithItems(req.params.id);
    if (!cart) return res.status(404).json({ success: false, error: 'Cart not found' });
    res.json({ success: true, data: cart });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get cart by customer ID
app.get('/carts/customer/:customer_id', (req, res) => {
  try {
    const cart = get("SELECT * FROM carts WHERE customer_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1", [req.params.customer_id]);
    if (!cart) return res.status(404).json({ success: false, error: 'No active cart found' });
    const items = query('SELECT * FROM cart_items WHERE cart_id = ? ORDER BY rowid ASC', [cart.id]);
    cart.items = items;
    res.json({ success: true, data: cart });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Add item to cart
app.post('/carts/:id/items', (req, res) => {
  try {
    const cart = get('SELECT * FROM carts WHERE id = ?', [req.params.id]);
    if (!cart) return res.status(404).json({ success: false, error: 'Cart not found' });
    if (cart.status !== 'active') return res.status(400).json({ success: false, error: 'Cart is not active' });
    const { product_id, variant_id, quantity, unit_price } = req.body;
    if (!product_id || !unit_price) return res.status(400).json({ success: false, error: 'product_id and unit_price are required' });

    // Check if item exists (same product + variant)
    let existing;
    if (variant_id) {
      existing = get('SELECT * FROM cart_items WHERE cart_id = ? AND product_id = ? AND variant_id = ?', [req.params.id, product_id, variant_id]);
    } else {
      existing = get('SELECT * FROM cart_items WHERE cart_id = ? AND product_id = ? AND variant_id IS NULL', [req.params.id, product_id]);
    }

    if (existing) {
      const newQty = existing.quantity + (quantity || 1);
      run('UPDATE cart_items SET quantity = ?, total_price = ? WHERE id = ?', [newQty, newQty * unit_price, existing.id]);
    } else {
      const itemId = uuidv4();
      const qty = quantity || 1;
      run(`INSERT INTO cart_items (id, cart_id, product_id, variant_id, quantity, unit_price, total_price) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [itemId, req.params.id, product_id, variant_id || null, qty, unit_price, qty * unit_price]);
    }

    recalculateCart(req.params.id);
    const updatedCart = getCartWithItems(req.params.id);
    notifyAccounting('ecommerce', 'ecommerce.cart.updated', { cart_id: req.params.id, total: updatedCart.total });
    res.json({ success: true, data: updatedCart });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Update item quantity
app.patch('/carts/:id/items/:item_id', (req, res) => {
  try {
    const item = get('SELECT * FROM cart_items WHERE id = ? AND cart_id = ?', [req.params.item_id, req.params.id]);
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });
    const { quantity } = req.body;
    if (!quantity || quantity < 1) return res.status(400).json({ success: false, error: 'Quantity must be at least 1' });
    run('UPDATE cart_items SET quantity = ?, total_price = ? WHERE id = ?', [quantity, quantity * item.unit_price, req.params.item_id]);
    recalculateCart(req.params.id);
    const cart = getCartWithItems(req.params.id);
    res.json({ success: true, data: cart });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Remove item from cart
app.delete('/carts/:id/items/:item_id', (req, res) => {
  try {
    const item = get('SELECT * FROM cart_items WHERE id = ? AND cart_id = ?', [req.params.item_id, req.params.id]);
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });
    run('DELETE FROM cart_items WHERE id = ?', [req.params.item_id]);
    recalculateCart(req.params.id);
    const cart = getCartWithItems(req.params.id);
    res.json({ success: true, data: cart });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Apply coupon
app.post('/carts/:id/coupon', (req, res) => {
  try {
    const cart = get('SELECT * FROM carts WHERE id = ?', [req.params.id]);
    if (!cart) return res.status(404).json({ success: false, error: 'Cart not found' });
    const { coupon_code, discount_amount } = req.body;
    if (!coupon_code || discount_amount == null) return res.status(400).json({ success: false, error: 'coupon_code and discount_amount are required' });
    run("UPDATE carts SET coupon_code = ?, discount_amount = ?, updated_at = datetime('now') WHERE id = ?",
      [coupon_code, discount_amount, req.params.id]);
    recalculateCart(req.params.id);
    const updatedCart = getCartWithItems(req.params.id);
    res.json({ success: true, data: updatedCart });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Remove coupon
app.delete('/carts/:id/coupon', (req, res) => {
  try {
    run("UPDATE carts SET coupon_code = NULL, discount_amount = 0, updated_at = datetime('now') WHERE id = ?", [req.params.id]);
    recalculateCart(req.params.id);
    const cart = getCartWithItems(req.params.id);
    if (!cart) return res.status(404).json({ success: false, error: 'Cart not found' });
    res.json({ success: true, data: cart });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get cart totals
app.get('/carts/:id/totals', (req, res) => {
  try {
    const cart = get('SELECT subtotal, tax, discount_amount, coupon_code, total, currency FROM carts WHERE id = ?', [req.params.id]);
    if (!cart) return res.status(404).json({ success: false, error: 'Cart not found' });
    const itemCount = query('SELECT SUM(quantity) as count FROM cart_items WHERE cart_id = ?', [req.params.id]);
    cart.item_count = itemCount[0] ? itemCount[0].count : 0;
    res.json({ success: true, data: cart });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Clear cart items
app.delete('/carts/:id/items', (req, res) => {
  try {
    run('DELETE FROM cart_items WHERE cart_id = ?', [req.params.id]);
    run("UPDATE carts SET subtotal = 0, tax = 0, total = 0, discount_amount = 0, coupon_code = NULL, updated_at = datetime('now') WHERE id = ?", [req.params.id]);
    const cart = getCartWithItems(req.params.id);
    if (!cart) return res.status(404).json({ success: false, error: 'Cart not found' });
    res.json({ success: true, data: cart });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Delete cart
app.delete('/carts/:id', (req, res) => {
  try {
    const cart = get('SELECT * FROM carts WHERE id = ?', [req.params.id]);
    if (!cart) return res.status(404).json({ success: false, error: 'Cart not found' });
    run('DELETE FROM cart_items WHERE cart_id = ?', [req.params.id]);
    run('DELETE FROM carts WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: { message: 'Cart deleted' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Scan for abandoned carts
app.post('/carts/abandoned/scan', (req, res) => {
  try {
    const cutoffDate = new Date(Date.now() - ABANDONMENT_HOURS * 60 * 60 * 1000).toISOString();
    const abandoned = query(
      "SELECT id, customer_id, total FROM carts WHERE status = 'active' AND updated_at < ? ORDER BY updated_at ASC",
      [cutoffDate]
    );
    for (const cart of abandoned) {
      run("UPDATE carts SET status = 'abandoned', abandoned_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", [cart.id]);
    }
    notifyAccounting('ecommerce', 'ecommerce.cart.abandoned.scan', { count: abandoned.length });
    res.json({ success: true, data: { abandoned_count: abandoned.length, carts: abandoned } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// SPA fallback
app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'shopping_cart', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Shopping Cart Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
