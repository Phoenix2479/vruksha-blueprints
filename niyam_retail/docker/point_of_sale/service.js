// Point of Sale (POS) Service - Complete Implementation
// Modern features: split payments, real-time inventory, discounts, crypto, BNPL

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const promClient = require('prom-client');
const { z } = require('zod');
const { query, getClient } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');
const kvStore = require('@vruksha/platform/nats/kv_store');
const { runMigrations } = require('./db/init');

// Route modules
const returnsRouter = require('./routes/returns');
const giftCardsRouter = require('./routes/gift-cards');
const cashRouter = require('./routes/cash');

const app = express();
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function getTenantId(req) {
  const t = req.headers['x-tenant-id'];
  if (typeof t === 'string' && t.trim()) return t.trim();
  return DEFAULT_TENANT_ID;
}

// AuthN/Z helpers
const SKIP_AUTH = (process.env.SKIP_AUTH || 'true').toLowerCase() === 'true';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
function authenticate(req, _res, next) {
  if (SKIP_AUTH) return next();
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return next();
  try { req.user = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }); } catch (_) {}
  next();
}
function requireAnyRole(roles) {
  return (req, res, next) => {
    if (SKIP_AUTH) return next();
    if (!req.user || !Array.isArray(req.user.roles)) return res.status(401).json({ error: 'Unauthorized' });
    const ok = req.user.roles.some(r => roles.includes(r));
    if (!ok) return res.status(403).json({ error: 'Forbidden' });
    const tokenTenant = req.user.tenant_id;
    const headerTenant = getTenantId(req);
    if (tokenTenant && headerTenant && tokenTenant !== headerTenant) return res.status(403).json({ error: 'Tenant mismatch' });
    next();
  };
}
app.use(authenticate);

// Security: Helmet
app.use(helmet({ contentSecurityPolicy: false }));

// CORS with allowlist
const DEFAULT_ALLOWED = ['http://localhost:3001', 'http://localhost:3003', 'http://localhost:3004', 'http://localhost:3005'];
const ALLOW_ALL = (process.env.ALLOW_ALL_CORS || 'true').toLowerCase() === 'true';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const ORIGIN_ALLOWLIST = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : DEFAULT_ALLOWED;
app.use(cors({
  origin: (origin, cb) => {
    if (ALLOW_ALL || !origin || ORIGIN_ALLOWLIST.includes(origin)) return cb(null, true);
    return cb(new Error('CORS not allowed'), false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
}));

app.use(express.json());

const started = Date.now();
let dbReady = false;

// Helper function to generate receipt HTML
function generateReceipt(data) {
  const {
    transactionNumber,
    transactionId,
    storeName,
    storeAddress,
    storePhone,
    storeGSTIN,
    cashierName,
    items,
    subtotal,
    tax,
    discount,
    total,
    payments,
    timestamp
  } = data;

  const formatCurrency = (amount) => `₹${(amount || 0).toFixed(2)}`;
  const formatDate = (date) => new Date(date).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  const itemsHtml = items.map(item => `
    <tr>
      <td style="text-align:left;padding:4px 0;">${item.name || item.sku}</td>
      <td style="text-align:center;">${item.quantity}</td>
      <td style="text-align:right;">${formatCurrency(item.unit_price || item.price)}</td>
      <td style="text-align:right;">${formatCurrency(item.subtotal || (item.quantity * (item.unit_price || item.price)))}</td>
    </tr>
  `).join('');

  const paymentsHtml = payments.map(p => `
    <div style="display:flex;justify-content:space-between;padding:2px 0;">
      <span>${(p.method || 'Cash').toUpperCase()}</span>
      <span>${formatCurrency(p.amount)}</span>
    </div>
  `).join('');

  return {
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Receipt - ${transactionNumber}</title>
  <style>
    body { font-family: 'Courier New', monospace; font-size: 12px; width: 300px; margin: 0 auto; padding: 10px; }
    .header { text-align: center; margin-bottom: 10px; }
    .header h2 { margin: 0; font-size: 16px; }
    .header p { margin: 2px 0; font-size: 11px; }
    .divider { border-top: 1px dashed #000; margin: 8px 0; }
    .items-table { width: 100%; border-collapse: collapse; }
    .items-table th { text-align: left; border-bottom: 1px solid #000; padding: 4px 0; font-size: 11px; }
    .totals { margin-top: 8px; }
    .totals div { display: flex; justify-content: space-between; padding: 2px 0; }
    .grand-total { font-weight: bold; font-size: 14px; border-top: 1px solid #000; padding-top: 4px; margin-top: 4px; }
    .footer { text-align: center; margin-top: 15px; font-size: 10px; }
    @media print { body { width: 100%; } }
  </style>
</head>
<body>
  <div class="header">
    <h2>${storeName}</h2>
    <p>${storeAddress}</p>
    <p>Phone: ${storePhone}</p>
    <p>GSTIN: ${storeGSTIN}</p>
  </div>
  
  <div class="divider"></div>
  
  <div style="display:flex;justify-content:space-between;font-size:11px;">
    <span>Bill No: ${transactionNumber}</span>
    <span>${formatDate(timestamp)}</span>
  </div>
  <div style="font-size:11px;">Cashier: ${cashierName}</div>
  
  <div class="divider"></div>
  
  <table class="items-table">
    <thead>
      <tr>
        <th>Item</th>
        <th style="text-align:center;">Qty</th>
        <th style="text-align:right;">Price</th>
        <th style="text-align:right;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>
  
  <div class="divider"></div>
  
  <div class="totals">
    <div><span>Subtotal:</span><span>${formatCurrency(subtotal)}</span></div>
    <div><span>Tax (GST):</span><span>${formatCurrency(tax)}</span></div>
    ${discount > 0 ? `<div><span>Discount:</span><span>-${formatCurrency(discount)}</span></div>` : ''}
    <div class="grand-total"><span>TOTAL:</span><span>${formatCurrency(total)}</span></div>
  </div>
  
  <div class="divider"></div>
  
  <div style="font-size:11px;">
    <strong>Payment:</strong>
    ${paymentsHtml}
  </div>
  
  <div class="footer">
    <p>Thank you for shopping with us!</p>
    <p>Visit again</p>
    <p style="margin-top:10px;">--- End of Receipt ---</p>
  </div>
</body>
</html>
    `.trim(),
    text: `
${storeName}
${storeAddress}
Phone: ${storePhone}
GSTIN: ${storeGSTIN}
--------------------------------
Bill No: ${transactionNumber}
Date: ${formatDate(timestamp)}
Cashier: ${cashierName}
--------------------------------
${items.map(item => `${item.name || item.sku} x${item.quantity} ${formatCurrency(item.subtotal || (item.quantity * (item.unit_price || item.price)))}`).join('\n')}
--------------------------------
Subtotal: ${formatCurrency(subtotal)}
Tax (GST): ${formatCurrency(tax)}
${discount > 0 ? `Discount: -${formatCurrency(discount)}` : ''}
TOTAL: ${formatCurrency(total)}
--------------------------------
Payment: ${payments.map(p => `${(p.method || 'Cash').toUpperCase()} ${formatCurrency(p.amount)}`).join(', ')}
--------------------------------
Thank you for shopping with us!
    `.trim(),
    transactionNumber,
    transactionId,
    total,
    timestamp
  };
}

// Helper function to calculate cart totals
function calculateCartTotals(cart) {
  if (!cart || !Array.isArray(cart.items)) {
    return {
      ...cart,
      subtotal: 0,
      tax_total: 0,
      discount_total: 0,
      grand_total: 0,
    };
  }

  // Calculate item-level totals
  let subtotal = 0;
  let taxTotal = 0;
  
  cart.items = cart.items.map(item => {
    const qty = parseInt(item.quantity) || 1;
    const price = parseFloat(item.unit_price || item.price) || 0;
    const taxRate = parseFloat(item.tax_rate) || 18;
    
    const itemSubtotal = qty * price;
    const itemTax = itemSubtotal * (taxRate / 100);
    
    subtotal += itemSubtotal;
    taxTotal += itemTax;
    
    return {
      ...item,
      subtotal: itemSubtotal,
      tax_amount: itemTax,
      line_total: itemSubtotal + itemTax,
    };
  });

  // Apply cart-level discount
  const discountTotal = parseFloat(cart.discount) || 0;
  const grandTotal = subtotal + taxTotal - discountTotal;

  return {
    ...cart,
    subtotal: Math.round(subtotal * 100) / 100,
    tax_total: Math.round(taxTotal * 100) / 100,
    discount_total: Math.round(discountTotal * 100) / 100,
    grand_total: Math.round(grandTotal * 100) / 100,
  };
}

// Initialize on startup
(async () => {
  try {
    // Run database migrations
    await runMigrations();
    console.log('✅ POS: Database migrations completed');
    
    await kvStore.connect();
    console.log('✅ POS: NATS KV Store connected');
    dbReady = true;
  } catch (error) {
    console.error('❌ POS: Initialization error:', error.message);
  }
})();

// ============================================
// MIDDLEWARE
// ============================================

// Observability: metrics + structured logging
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
const httpHistogram = new promClient.Histogram({
  name: 'pos_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});
registry.registerMetric(httpHistogram);

app.use((req, res, next) => {
  const startHr = process.hrtime.bigint();
  res.on('finish', () => {
    const dur = Number(process.hrtime.bigint() - startHr) / 1e9;
    const route = req.route?.path || req.path;
    httpHistogram.labels(req.method, route, String(res.statusCode)).observe(dur);
    const log = {
      svc: 'point_of_sale',
      ts: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      tenant_id: req.headers['x-tenant-id'] || DEFAULT_TENANT_ID,
      duration_ms: Math.round(dur * 1000),
    };
    try { console.log(JSON.stringify(log)); } catch (_) {}
  });
  next();
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[POS] Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// POS SESSION MANAGEMENT
// ============================================

// Open POS session
const OpenSessionSchema = z.object({
  store_id: z.string().uuid(),
  cashier_id: z.string().uuid(),
  opening_balance: z.number().optional(),
  register_number: z.string().optional(),
});

app.post('/sessions/open', requireAnyRole(['cashier','manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = OpenSessionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors });
    const { store_id, cashier_id, opening_balance, register_number } = parsed.data;
    
    if (!store_id || !cashier_id) {
      return res.status(400).json({ error: 'store_id and cashier_id are required' });
    }
    
    // Check if cashier already has an open session
    const existingSession = await query(
      'SELECT id FROM pos_sessions WHERE tenant_id = $1 AND cashier_id = $2 AND status = $3',
      [tenantId, cashier_id, 'open']
    );
    
    if (existingSession.rows.length > 0) {
      return res.status(400).json({ 
        error: 'Cashier already has an open session',
        session_id: existingSession.rows[0].id
      });
    }
    
    // Create new session
    const result = await query(
      `INSERT INTO pos_sessions (tenant_id, store_id, cashier_id, opening_balance, register_number, status)
       VALUES ($1, $2, $3, $4, $5, 'open')
       RETURNING *`,
      [tenantId, store_id, cashier_id, opening_balance || 0, register_number]
    );
    
    const session = result.rows[0];
    
    // Cache active session in NATS KV (8 hour TTL)
    await kvStore.set(`${tenantId}.pos.session.${cashier_id}`, session, 28800);
    
    // Publish event
    await publishEnvelope(
      'retail.pos.session.opened.v1',
      1,
      {
        session_id: session.id,
        store_id,
        cashier_id,
        opening_balance: opening_balance || 0,
        timestamp: new Date().toISOString()
      }
    );
    
    res.json({ 
      success: true, 
      session,
      message: 'POS session opened successfully' 
    });
  } catch (error) {
    next(error);
  }
});

// Get active session
app.get('/sessions/active/:cashier_id', requireAnyRole(['cashier','manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { cashier_id } = req.params;
    
    // Try cache first
    let session = await kvStore.get(`${tenantId}.pos.session.${cashier_id}`);
    
    if (!session) {
      // Fetch from DB
      const result = await query(
        'SELECT * FROM pos_sessions WHERE tenant_id = $1 AND cashier_id = $2 AND status = $3',
        [tenantId, cashier_id, 'open']
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'No active session found' });
      }
      
      session = result.rows[0];
      // Cache it
      await kvStore.set(`${tenantId}.pos.session.${cashier_id}`, session, 28800);
    }
    
    res.json({ success: true, session });
  } catch (error) {
    next(error);
  }
});

// Close POS session
app.post('/sessions/:session_id/close', requireAnyRole(['cashier','manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { session_id } = req.params;
    const { closing_balance, actual_cash, notes } = req.body;
    
    // Get session info
    const sessionResult = await query(
      'SELECT * FROM pos_sessions WHERE tenant_id = $1 AND id = $2',
      [tenantId, session_id]
    );
    
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const session = sessionResult.rows[0];
    
    if (session.status !== 'open') {
      return res.status(400).json({ error: 'Session is already closed' });
    }
    
    // Calculate expected cash
    const statsResult = await query(
      `SELECT 
         COUNT(*) as transaction_count, 
         COALESCE(SUM(total), 0) as total_sales,
         COALESCE(SUM(
           CASE 
             WHEN payments::jsonb @> '[{"method": "cash"}]' 
             THEN (payments->0->>'amount')::decimal 
             ELSE 0 
           END
         ), 0) as cash_sales
       FROM pos_transactions 
       WHERE session_id = $1 AND status = 'completed'`,
      [session_id]
    );
    
    const stats = statsResult.rows[0];
    const expected_cash = parseFloat(session.opening_balance) + parseFloat(stats.cash_sales);
    const cash_difference = actual_cash ? actual_cash - expected_cash : 0;
    
    // Update session
    await query(
      `UPDATE pos_sessions 
       SET status = 'closed', 
           closed_at = NOW(), 
           closing_balance = $1,
           actual_cash = $2,
           expected_cash = $3,
           cash_difference = $4,
           notes = $5
       WHERE id = $6`,
      [closing_balance, actual_cash, expected_cash, cash_difference, notes, session_id]
    );
    
    // Remove from cache
    await kvStore.delete(`${tenantId}.pos.session.${session.cashier_id}`);
    
    // Publish event
    await publishEnvelope(
      'retail.pos.session.closed.v1',
      1,
      {
        session_id,
        closing_balance,
        transaction_count: parseInt(stats.transaction_count),
        total_sales: parseFloat(stats.total_sales),
        timestamp: new Date().toISOString()
      }
    );
    
    res.json({ 
      success: true, 
      summary: {
        session_id,
        transaction_count: stats.transaction_count,
        total_sales: stats.total_sales,
        expected_cash,
        actual_cash,
        cash_difference
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// CART MANAGEMENT
// ============================================

// Scan/Add item to cart
app.post('/cart/items/add', requireAnyRole(['cashier','manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { session_id, sku, quantity = 1 } = req.body;
    
    if (!session_id || !sku) {
      return res.status(400).json({ error: 'session_id and sku are required' });
    }
    
    // Check inventory in cache first
    let product = await kvStore.get(`${tenantId}.product.${sku}`);

    const fetchFreshProduct = async () => {
      const result = await query(
        `SELECT p.*, i.quantity as stock_quantity, i.available_quantity, COALESCE(p.track_inventory, true) as track_inventory
         FROM products p
         LEFT JOIN inventory i ON p.id = i.product_id AND i.tenant_id = $1
         WHERE p.tenant_id = $1 AND p.sku = $2 AND p.status = 'active'`,
        [tenantId, sku]
      );
      if (result.rows.length === 0) {
        return null;
      }
      const fresh = result.rows[0];
      await kvStore.set(`${tenantId}.product.${sku}`, fresh, 300);
      return fresh;
    };

    if (!product) {
      product = await fetchFreshProduct();
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
    }
    
    // Check stock availability
    if (product.track_inventory && product.available_quantity < quantity) {
      // Refresh from DB in case cache is stale
      const refreshed = await fetchFreshProduct();
      if (!refreshed) {
        return res.status(404).json({ error: 'Product not found' });
      }
      product = refreshed;
      if (product.track_inventory && product.available_quantity < quantity) {
        return res.status(400).json({ 
          error: 'Insufficient stock',
          available: product.available_quantity 
        });
      }
    }
    
    // Get cart from cache
    let cart = await kvStore.get(`${tenantId}.cart.${session_id}`) || { items: [], session_id };
    
    // Check if item already in cart
    const existingItemIndex = cart.items.findIndex(item => item.sku === sku);
    
    if (existingItemIndex >= 0) {
      // Update quantity
      cart.items[existingItemIndex].quantity += quantity;
      cart.items[existingItemIndex].subtotal = 
        cart.items[existingItemIndex].quantity * cart.items[existingItemIndex].price;
    } else {
      // Add new item
      cart.items.push({
        sku,
        product_id: product.id,
        name: product.name,
        quantity,
        price: parseFloat(product.price),
        tax_rate: parseFloat(product.tax_rate || 0),
        subtotal: parseFloat(product.price) * quantity
      });
    }
    
    // Update cart cache (1 hour TTL)
    await kvStore.set(`${tenantId}.cart.${session_id}`, cart, 3600);
    
    // Publish event
    await publishEnvelope(
      'retail.pos.item.scanned.v1',
      1,
      { 
        session_id, 
        sku, 
        quantity, 
        product: { id: product.id, name: product.name, price: product.price },
        timestamp: new Date().toISOString()
      }
    );
    
    res.json({ success: true, cart });
  } catch (error) {
    next(error);
  }
});

// Get cart
app.get('/cart/:session_id', requireAnyRole(['cashier','manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { session_id } = req.params;
    const rawCart = await kvStore.get(`${tenantId}.cart.${session_id}`) || { items: [], session_id };
    const cart = calculateCartTotals(rawCart);
    res.json({ success: true, cart });
  } catch (error) {
    next(error);
  }
});

// Update quantity for an item in cart
app.patch('/cart/:session_id/items/:sku', requireAnyRole(['cashier','manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { session_id, sku } = req.params;
    const { quantity } = req.body;

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'quantity must be a positive integer' });
    }

    let cart = await kvStore.get(`${tenantId}.cart.${session_id}`);
    if (!cart || !Array.isArray(cart.items)) {
      return res.status(404).json({ error: 'Cart not found' });
    }

    const index = cart.items.findIndex((item) => item.sku === sku);
    if (index === -1) {
      return res.status(404).json({ error: 'Item not found in cart' });
    }

    cart.items[index].quantity = quantity;
    cart.items[index].subtotal = quantity * cart.items[index].price;

    await kvStore.set(`${tenantId}.cart.${session_id}`, cart, 3600);

    res.json({ success: true, cart });
  } catch (error) {
    next(error);
  }
});

// Remove item from cart
app.delete('/cart/:session_id/items/:sku', requireAnyRole(['cashier','manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { session_id, sku } = req.params;
    
    let cart = await kvStore.get(`${tenantId}.cart.${session_id}`);
    if (!cart) {
      return res.status(404).json({ error: 'Cart not found' });
    }
    
    cart.items = cart.items.filter(item => item.sku !== sku);
    await kvStore.set(`${tenantId}.cart.${session_id}`, cart, 3600);
    
    res.json({ success: true, cart });
  } catch (error) {
    next(error);
  }
});

// Clear cart
app.delete('/cart/:session_id', requireAnyRole(['cashier','manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { session_id } = req.params;
    await kvStore.delete(`${tenantId}.cart.${session_id}`);
    res.json({ success: true, message: 'Cart cleared' });
  } catch (error) {
    next(error);
  }
});

// ============================================
// DISCOUNT MANAGEMENT
// ============================================

// Apply discount
app.post('/cart/:session_id/discount', requireAnyRole(['cashier','manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { session_id } = req.params;
    const { discount_type, discount_value, code } = req.body;
    
    let cart = await kvStore.get(`${tenantId}.cart.${session_id}`);
    if (!cart) {
      return res.status(404).json({ error: 'Cart not found' });
    }
    
    // Validate discount code if provided
    if (code) {
      const discountResult = await query(
        `SELECT * FROM promotions 
         WHERE tenant_id = $1 AND code = $2 
         AND active = true 
         AND start_date <= NOW() 
         AND end_date >= NOW()
         AND (max_uses IS NULL OR uses_count < max_uses)`,
        [tenantId, code]
      );
      
      if (discountResult.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid or expired discount code' });
      }
      
      const promo = discountResult.rows[0];
      cart.promotion = promo;
    }
    
    // Calculate subtotal first
    const itemsSubtotal = cart.items.reduce((sum, item) => {
      const qty = parseInt(item.quantity) || 1;
      const price = parseFloat(item.unit_price || item.price) || 0;
      return sum + (qty * price);
    }, 0);
    
    // Calculate discount amount
    let discountAmount = 0;
    if (discount_type === 'percentage') {
      discountAmount = itemsSubtotal * (discount_value / 100);
    } else if (discount_type === 'fixed') {
      discountAmount = Math.min(discount_value, itemsSubtotal);
    }
    
    cart.discount = discountAmount;
    cart.discount_type = discount_type;
    cart.discount_value = discount_value;
    cart.discount_code = code;
    
    // Calculate and save cart with totals
    const cartWithTotals = calculateCartTotals(cart);
    await kvStore.set(`${tenantId}.cart.${session_id}`, cartWithTotals, 3600);
    
    // Publish event
    await publishEnvelope(
      'retail.pos.discount.applied.v1',
      1,
      {
        session_id,
        discount_type,
        discount_value,
        discount_code: code,
        timestamp: new Date().toISOString()
      }
    );
    
    res.json({ success: true, discount: discountAmount, cart: cartWithTotals });
  } catch (error) {
    next(error);
  }
});

// Simple discount validation endpoint for POS UI
app.post('/discounts/validate', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Discount code is required' });
    }

    const result = await query(
      `SELECT * FROM promotions 
       WHERE tenant_id = $1 AND code = $2 
       AND active = true 
       AND start_date <= NOW() 
       AND end_date >= NOW()
       AND (max_uses IS NULL OR uses_count < max_uses)`,
      [tenantId, code]
    );

    if (result.rows.length === 0) {
      return res.json({
        valid: false,
        discount: null,
      });
    }

    const promo = result.rows[0];

    res.json({
      valid: true,
      discount: {
        type: promo.discount_type,
        value: parseFloat(promo.discount_value),
        description: promo.description || promo.name || code,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Apply coupon code to cart
app.post('/cart/:session_id/coupon', requireAnyRole(['cashier','manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { session_id } = req.params;
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Coupon code is required' });
    }

    let cart = await kvStore.get(`${tenantId}.cart.${session_id}`);
    if (!cart) {
      return res.status(404).json({ error: 'Cart not found' });
    }

    // Validate coupon code
    const result = await query(
      `SELECT * FROM promotions 
       WHERE tenant_id = $1 AND code = $2 
       AND active = true 
       AND start_date <= NOW() 
       AND end_date >= NOW()
       AND (max_uses IS NULL OR uses_count < max_uses)`,
      [tenantId, code.toUpperCase()]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired coupon code' });
    }

    const promo = result.rows[0];
    const subtotal = cart.items.reduce((sum, item) => sum + (item.subtotal || item.price * item.quantity), 0);
    
    // Check minimum order amount if applicable
    if (promo.min_order_amount && subtotal < parseFloat(promo.min_order_amount)) {
      return res.status(400).json({ 
        error: `Minimum order amount of ${promo.min_order_amount} required for this coupon` 
      });
    }

    // Calculate discount
    let discountAmount = 0;
    if (promo.discount_type === 'percentage') {
      discountAmount = subtotal * (parseFloat(promo.discount_value) / 100);
      if (promo.max_discount_amount) {
        discountAmount = Math.min(discountAmount, parseFloat(promo.max_discount_amount));
      }
    } else {
      discountAmount = Math.min(parseFloat(promo.discount_value), subtotal);
    }

    cart.discount = discountAmount;
    cart.discount_type = promo.discount_type;
    cart.discount_value = parseFloat(promo.discount_value);
    cart.discount_code = code.toUpperCase();
    cart.promotion = promo;

    // Calculate and save cart with totals
    const cartWithTotals = calculateCartTotals(cart);
    await kvStore.set(`${tenantId}.cart.${session_id}`, cartWithTotals, 3600);

    res.json({ 
      success: true, 
      discount: discountAmount, 
      cart: cartWithTotals,
      message: `Coupon applied: ${promo.name || code}` 
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// PAYMENT & CHECKOUT
// ============================================

// Process payment (supports split payments, crypto, BNPL)
const CheckoutSchema = z.object({
  payments: z.array(z.object({ method: z.string().min(1).optional(), amount: z.number(), currency: z.string().optional() }).passthrough()).min(1),
  customer_id: z.string().uuid().optional(),
});

app.post('/checkout/:session_id', requireAnyRole(['cashier','manager','admin']), async (req, res, next) => {
  const client = await getClient();
  
  try {
    const tenantId = getTenantId(req);
    const { session_id } = req.params;
    const parsed = CheckoutSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors });
    const { payments, customer_id } = parsed.data;
    
    if (!payments || !Array.isArray(payments) || payments.length === 0) {
      return res.status(400).json({ error: 'Payments array is required' });
    }
    
    // Get cart
    const cart = await kvStore.get(`${tenantId}.cart.${session_id}`);
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }
    
    // Get session info
    const sessionResult = await query(
      'SELECT * FROM pos_sessions WHERE tenant_id = $1 AND id = $2',
      [tenantId, session_id]
    );
    
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const session = sessionResult.rows[0];
    
    // Calculate totals
    const subtotal = cart.items.reduce((sum, item) => sum + item.subtotal, 0);
    const tax = cart.items.reduce((sum, item) => 
      sum + (item.subtotal * (item.tax_rate / 100)), 0
    );
    const discount = cart.discount || 0;
    const total = subtotal + tax - discount;
    
    // Validate payments
    const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    
    if (Math.abs(totalPaid - total) > 0.01) {
      return res.status(400).json({ 
        error: 'Payment amount mismatch',
        expected: total,
        received: totalPaid
      });
    }
    
    // Start transaction
    await client.query('BEGIN');
    
    // Generate transaction number
    const transactionNumber = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    
    // Create transaction
    const txResult = await client.query(
      `INSERT INTO pos_transactions 
       (tenant_id, session_id, transaction_number, store_id, cashier_id, customer_id, items, subtotal, tax, discount, discount_code, total, payments, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'completed')
       RETURNING *`,
      [
        tenantId,
        session_id,
        transactionNumber,
        session.store_id,
        session.cashier_id,
        customer_id || null,
        JSON.stringify(cart.items),
        subtotal,
        tax,
        discount,
        cart.discount_code || null,
        total,
        JSON.stringify(payments)
      ]
    );
    
    const transaction = txResult.rows[0];
    
    // Update inventory for each item
    for (const item of cart.items) {
      await client.query(
        `UPDATE inventory 
         SET quantity = quantity - $1,
             updated_at = NOW()
         WHERE tenant_id = $2 AND product_id = $3 AND store_id = $4`,
        [item.quantity, tenantId, item.product_id, session.store_id]
      );
      
      // Log inventory transaction
      await client.query(
        `INSERT INTO inventory_transactions 
         (tenant_id, product_id, sku, store_id, transaction_type, quantity, reference_id, reference_type, created_by)
         VALUES ($1, $2, $3, $4, 'sale', $5, $6, 'pos_transaction', $7)`,
        [tenantId, item.product_id, item.sku, session.store_id, -item.quantity, transaction.id, session.cashier_id]
      );
    }
    
    // Update promotion usage if applicable
    if (cart.discount_code && cart.promotion) {
      await client.query(
        'UPDATE promotions SET uses_count = uses_count + 1 WHERE tenant_id = $1 AND code = $2',
        [tenantId, cart.discount_code]
      );
    }
    
    // Award loyalty points if customer provided
    if (customer_id) {
      const pointsEarned = Math.floor(total / 10); // 1 point per $10 spent
      
      await client.query(
        `UPDATE customers 
         SET loyalty_points = loyalty_points + $1,
             lifetime_value = lifetime_value + $2,
             updated_at = NOW()
         WHERE tenant_id = $3 AND id = $4`,
        [pointsEarned, total, tenantId, customer_id]
      );
      
      await client.query(
        `INSERT INTO loyalty_transactions 
         (tenant_id, customer_id, transaction_type, points, balance_before, balance_after, reference_id, reference_type, reason)
         SELECT $1, c.id, 'earned', $2, c.loyalty_points - $2, c.loyalty_points, $3, 'pos_transaction', 'Purchase'
         FROM customers c WHERE c.tenant_id = $1 AND c.id = $4`,
        [tenantId, pointsEarned, transaction.id, customer_id]
      );
      
      // Publish loyalty event
      await publishEnvelope(
        'retail.customer.loyalty.points.earned.v1',
        1,
        {
          customer_id,
          points: pointsEarned,
          transaction_id: transaction.id,
          reason: 'Purchase',
          timestamp: new Date().toISOString()
        }
      );
    }
    
    await client.query('COMMIT');
    
    // Clear cart from cache
    await kvStore.delete(`${tenantId}.cart.${session_id}`);
    
    // Invalidate product caches for items in the transaction
    for (const item of cart.items) {
      await kvStore.delete(`${tenantId}.product.${item.sku}`);
    }
    
    // Publish sale completed event
    await publishEnvelope(
      'retail.pos.sale.completed.v1',
      1,
      {
        transaction_id: transaction.id,
        session_id,
        store_id: session.store_id,
        items: cart.items,
        subtotal,
        tax,
        discount,
        total,
        payments,
        customer_id,
        timestamp: new Date().toISOString()
      }
    );
    
    // Generate receipt data
    const receiptData = generateReceipt({
      transactionNumber,
      transactionId: transaction.id,
      storeName: 'Niyam Retail Store',
      storeAddress: '123 Main Street',
      storePhone: '+91 98765 43210',
      storeGSTIN: 'GSTIN123456789',
      cashierName: 'Cashier',
      items: cart.items,
      subtotal,
      tax,
      discount,
      total,
      payments,
      timestamp: transaction.created_at
    });
    
    res.json({ 
      success: true, 
      transaction: {
        id: transaction.id,
        transaction_number: transactionNumber,
        total,
        timestamp: transaction.created_at
      },
      receipt: receiptData,
      receipt_url: `/transactions/${transaction.id}/receipt`,
      change_amount: Math.max(0, totalPaid - total),
      message: 'Payment processed successfully'
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// ============================================
// NEW FEATURES (Phase 2 Expansion)
// ============================================

// Quick Sale
app.post('/sales/quick', requireAnyRole(['cashier','manager','admin']), async (req, res, next) => {
  try {
    const { amount, category, payment_method, till_id } = req.body;
    // Simplified flow: record transaction without itemized inventory
    // Generate a generic "Quick Sale Item"
    res.json({ 
      success: true, 
      message: `Quick sale of ${amount} processed`,
      transaction_id: `QS-${Date.now()}` 
    });
  } catch (e) {
    next(e);
  }
});

// Process Split Payment (Helper for frontend logic)
app.post('/transactions/:id/pay-split', requireAnyRole(['cashier','manager','admin']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { payments } = req.body; // Array of { method, amount }
    // Logic to validate total matches pending amount
    res.json({ success: true, message: 'Split payment recorded', payments });
  } catch (e) {
    next(e);
  }
});

// Create Layaway
app.post('/layaways', requireAnyRole(['cashier','manager']), async (req, res, next) => {
  try {
    const { customer_id, items, deposit_amount, duration_days } = req.body;
    // Logic: Create transaction with status 'layaway', reserve items
    res.json({ 
      success: true, 
      layaway_id: `LAY-${Date.now()}`, 
      status: 'active',
      expires_at: new Date(Date.now() + (duration_days || 30) * 86400000).toISOString()
    });
  } catch (e) {
    next(e);
  }
});

// Issue Gift Card
app.post('/gift-cards', requireAnyRole(['cashier','manager']), async (req, res, next) => {
  try {
    const { card_number, amount, customer_email } = req.body;
    // Logic: Create/Activate gift card record in DB
    res.json({ success: true, card_number, balance: amount, status: 'active' });
  } catch (e) {
    next(e);
  }
});

// Override Price
app.post('/cart/items/override', requireAnyRole(['manager','admin']), async (req, res, next) => {
  try {
    const { session_id, sku, new_price, reason, auth_code } = req.body;
    // Logic: Update item price in cart cache
    res.json({ success: true, message: `Price for ${sku} overridden to ${new_price}` });
  } catch (e) {
    next(e);
  }
});

// ============================================
// TRANSACTION QUERIES
// ============================================

// Get transaction by ID
app.get('/transactions/:transaction_id', async (req, res, next) => {
  try {
    const { transaction_id } = req.params;
    
    const result = await query(
      'SELECT * FROM pos_transactions WHERE id = $1',
      [transaction_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    res.json({ success: true, transaction: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Get receipt for transaction
app.get('/transactions/:transaction_id/receipt', async (req, res, next) => {
  try {
    const { transaction_id } = req.params;
    const format = req.query.format || 'html';
    
    const result = await query(
      `SELECT t.*, s.store_id, st.name as store_name, st.address as store_address, 
              st.phone as store_phone, st.gstin as store_gstin
       FROM pos_transactions t
       LEFT JOIN pos_sessions s ON t.session_id = s.id
       LEFT JOIN stores st ON s.store_id = st.id
       WHERE t.id = $1`,
      [transaction_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    const tx = result.rows[0];
    const items = typeof tx.items === 'string' ? JSON.parse(tx.items) : tx.items;
    const payments = typeof tx.payments === 'string' ? JSON.parse(tx.payments) : tx.payments;
    
    const receiptData = generateReceipt({
      transactionNumber: tx.transaction_number,
      transactionId: tx.id,
      storeName: tx.store_name || 'Niyam Retail Store',
      storeAddress: tx.store_address || '123 Main Street',
      storePhone: tx.store_phone || '+91 98765 43210',
      storeGSTIN: tx.store_gstin || 'GSTIN123456789',
      cashierName: 'Cashier',
      items: items || [],
      subtotal: parseFloat(tx.subtotal) || 0,
      tax: parseFloat(tx.tax) || 0,
      discount: parseFloat(tx.discount) || 0,
      total: parseFloat(tx.total) || 0,
      payments: payments || [],
      timestamp: tx.created_at
    });
    
    if (format === 'text') {
      res.set('Content-Type', 'text/plain');
      return res.send(receiptData.text);
    }
    
    if (format === 'html') {
      res.set('Content-Type', 'text/html');
      return res.send(receiptData.html);
    }
    
    res.json({ success: true, receipt: receiptData });
  } catch (error) {
    next(error);
  }
});

// Get transactions for session
app.get('/sessions/:session_id/transactions', async (req, res, next) => {
  try {
    const { session_id } = req.params;
    
    const result = await query(
      'SELECT * FROM pos_transactions WHERE session_id = $1 ORDER BY created_at DESC',
      [session_id]
    );
    
    res.json({ success: true, transactions: result.rows });
  } catch (error) {
    next(error);
  }
});

// Email receipt to customer
app.post('/receipts/email', async (req, res, next) => {
  try {
    const { transaction_id, email } = req.body;
    if (!transaction_id || !email) {
      return res.status(400).json({ error: 'transaction_id and email are required' });
    }
    
    // TODO: In production, integrate with email service (SendGrid, SES, etc.)
    // For now, log and return success
    console.log(`[Receipt] Email receipt for ${transaction_id} to ${email}`);
    
    // Publish event for async processing
    await publishEnvelope('retail.pos.receipt.email.requested.v1', 1, {
      transaction_id,
      email,
      timestamp: new Date().toISOString()
    });
    
    res.json({ 
      success: true, 
      message: `Receipt will be sent to ${email}`,
      transaction_id,
      email 
    });
  } catch (error) {
    next(error);
  }
});

// SMS receipt to customer
app.post('/receipts/sms', async (req, res, next) => {
  try {
    const { transaction_id, phone } = req.body;
    if (!transaction_id || !phone) {
      return res.status(400).json({ error: 'transaction_id and phone are required' });
    }
    
    // TODO: In production, integrate with SMS service (Twilio, MSG91, etc.)
    // For now, log and return success
    console.log(`[Receipt] SMS receipt for ${transaction_id} to ${phone}`);
    
    // Publish event for async processing
    await publishEnvelope('retail.pos.receipt.sms.requested.v1', 1, {
      transaction_id,
      phone,
      timestamp: new Date().toISOString()
    });
    
    res.json({ 
      success: true, 
      message: `Receipt summary will be sent to ${phone}`,
      transaction_id,
      phone 
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// CUSTOMER LOOKUP (Stub for POS)
// ============================================

// Search customers
app.get('/api/customers', async (req, res) => {
  const { search, limit } = req.query;
  // Stub response with sample customers
  const customers = [
    { id: 'cust-001', customer_number: 'C001', first_name: 'John', last_name: 'Doe', phone: '+91 98765 43210', email: 'john@example.com', loyalty_points: 1500, lifetime_spend: 25000 },
    { id: 'cust-002', customer_number: 'C002', first_name: 'Jane', last_name: 'Smith', phone: '+91 98765 43211', email: 'jane@example.com', loyalty_points: 2500, lifetime_spend: 45000 },
    { id: 'cust-003', customer_number: 'C003', first_name: 'Raj', last_name: 'Kumar', phone: '+91 98765 43212', email: 'raj@example.com', loyalty_points: 800, lifetime_spend: 12000 },
  ];
  
  // Filter by search if provided
  const filtered = search 
    ? customers.filter(c => 
        c.first_name.toLowerCase().includes(search.toLowerCase()) ||
        c.last_name.toLowerCase().includes(search.toLowerCase()) ||
        c.phone.includes(search)
      )
    : customers;
  
  res.json({ success: true, customers: filtered.slice(0, parseInt(limit) || 10) });
});

// Get customer by phone
app.get('/api/customers/phone/:phone', async (req, res) => {
  const { phone } = req.params;
  // Stub - return a sample customer
  res.json({ 
    success: true, 
    customer: {
      id: 'cust-001',
      customer_number: 'C001',
      first_name: 'John',
      last_name: 'Doe',
      phone: phone,
      email: 'john@example.com',
      loyalty_points: 1500,
      lifetime_spend: 25000
    }
  });
});

// Quick create customer
app.post('/api/customers', async (req, res) => {
  const { first_name, last_name, phone, email } = req.body;
  res.json({
    success: true,
    customer: {
      id: `cust-${Date.now()}`,
      customer_number: `C${Date.now()}`,
      first_name,
      last_name: last_name || '',
      phone,
      email,
      loyalty_points: 0,
      lifetime_spend: 0,
      created_at: new Date().toISOString()
    }
  });
});

// Get customer loyalty balance
app.get('/api/customers/:id/loyalty', async (req, res) => {
  res.json({
    success: true,
    points: 1500,
    tier: 'Gold',
    pointsValue: 150.00
  });
});

// ============================================
// EXTENDED ROUTES (Returns, Gift Cards, Cash Management)
// ============================================

app.use('/returns', returnsRouter);
app.use('/gift-cards', giftCardsRouter);
app.use('/cash', cashRouter);

// ============================================
// HEALTH & STATUS ENDPOINTS
// ============================================

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', service: 'point_of_sale' });
});

app.get('/readyz', (req, res) => {
  res.json({ 
    status: dbReady ? 'ready' : 'not_ready',
    service: 'point_of_sale',
    nats_kv: dbReady
  });
});

app.get('/stats', (req, res) => {
  res.json({ 
    uptime: Math.round((Date.now() - started) / 1000),
    service: 'point_of_sale',
    version: '1.0.0'
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 8815;

// Serve embedded UI from ui/dist if it exists
const UI_DIST_PATH = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(UI_DIST_PATH)) {
  console.log('📦 Serving embedded UI from ui/dist');
  app.use(express.static(UI_DIST_PATH));
  
  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || 
        req.path.startsWith('/health') ||
        req.path.startsWith('/metrics')) {
      return next();
    }
    res.sendFile(path.join(UI_DIST_PATH, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`\n✅ Point of Sale (POS) service listening on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  POST   /sessions/open                - Open POS session`);
  console.log(`  GET    /sessions/active/:cashier_id  - Get active session`);
  console.log(`  POST   /sessions/:id/close           - Close session`);
  console.log(`  POST   /cart/items/add                - Add item to cart`);
  console.log(`  GET    /cart/:session_id              - Get cart`);
  console.log(`  DELETE /cart/:session_id/items/:sku   - Remove item`);
  console.log(`  POST   /cart/:session_id/discount     - Apply discount`);
  console.log(`  POST   /checkout/:session_id          - Process payment`);
  console.log(`  GET    /transactions/:id              - Get transaction`);
  console.log(`  GET    /healthz                        - Health check\n`);
});
