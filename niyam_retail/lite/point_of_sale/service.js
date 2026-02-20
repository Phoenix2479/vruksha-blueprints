const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');
const { notifyAccounting } = require('../shared/accounting-hook');

const app = express();
const PORT = process.env.PORT || 8819;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'point_of_sale', mode: 'lite' }));

// ============================================
// SESSION MANAGEMENT (POS Register)
// ============================================

app.post('/sessions/open', (req, res) => {
  try {
    const { store_id, register_id, cashier_id, opening_balance } = req.body;

    // Check if there's already an active session for this cashier
    const existing = get('SELECT * FROM pos_sessions WHERE cashier_id = ? AND status = ?', [cashier_id, 'active']);
    if (existing) {
      return res.json({
        success: true,
        session: {
          id: existing.id,
          storeId: existing.store_id,
          registerId: existing.register_id,
          cashierId: existing.cashier_id,
          openingBalance: existing.opening_balance,
          status: existing.status,
          startedAt: existing.started_at
        }
      });
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    run(`INSERT INTO pos_sessions (id, store_id, register_id, cashier_id, opening_balance, status, started_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?)`,
      [id, store_id || 'default', register_id || 'reg1', cashier_id || 'guest', opening_balance || 0, now]);

    res.json({
      success: true,
      session: {
        id,
        storeId: store_id || 'default',
        registerId: register_id || 'reg1',
        cashierId: cashier_id || 'guest',
        openingBalance: opening_balance || 0,
        status: 'active',
        startedAt: now
      }
    });
  } catch (err) {
    console.error('Session open error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/sessions/active/:cashierId', (req, res) => {
  try {
    const session = get('SELECT * FROM pos_sessions WHERE cashier_id = ? AND status = ?', [req.params.cashierId, 'active']);
    if (!session) {
      return res.json({ success: true, session: null });
    }
    res.json({
      success: true,
      session: {
        id: session.id,
        storeId: session.store_id,
        registerId: session.register_id,
        cashierId: session.cashier_id,
        openingBalance: session.opening_balance,
        status: session.status,
        startedAt: session.started_at
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/sessions/:id/close', (req, res) => {
  try {
    const { closing_balance, actual_cash, notes } = req.body;
    const now = new Date().toISOString();

    run(`UPDATE pos_sessions SET status = 'closed', closing_balance = ?, actual_cash = ?, notes = ?, ended_at = ? WHERE id = ?`,
      [closing_balance || 0, actual_cash || 0, notes || '', now, req.params.id]);

    // Get session summary
    const session = get('SELECT * FROM pos_sessions WHERE id = ?', [req.params.id]);
    const sales = query("SELECT * FROM sales WHERE session_id = ?", [req.params.id]);
    const total = sales.reduce((sum, s) => sum + (s.total || 0), 0);

    res.json({
      success: true,
      summary: {
        salesCount: sales.length,
        totalSales: total,
        openingBalance: session?.opening_balance || 0,
        closingBalance: closing_balance || 0,
        difference: (actual_cash || 0) - ((session?.opening_balance || 0) + total)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/sessions/:id/summary', (req, res) => {
  try {
    const session = get('SELECT * FROM pos_sessions WHERE id = ?', [req.params.id]);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const sales = query("SELECT * FROM sales WHERE session_id = ?", [req.params.id]);
    const totalSales = sales.reduce((sum, s) => sum + (s.total || 0), 0);
    const cashSales = sales.filter(s => s.payment_method === 'cash').reduce((sum, s) => sum + (s.total || 0), 0);

    res.json({
      salesCount: sales.length,
      totalSales,
      totalRefunds: 0,
      netSales: totalSales,
      paymentBreakdown: [
        { method: 'cash', amount: cashSales, count: sales.filter(s => s.payment_method === 'cash').length },
        { method: 'card', amount: totalSales - cashSales, count: sales.filter(s => s.payment_method !== 'cash').length }
      ],
      expectedCash: (session.opening_balance || 0) + cashSales
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// PRODUCTS API - Returns products with stock for POS display
// ============================================

app.get('/api/products', (req, res) => {
  try {
    const { category_id, categoryId, search, limit } = req.query;
    const categoryFilter = category_id || categoryId;
    const searchFilter = search;
    const limitNum = parseInt(limit) || 100;

    let sql = `
      SELECT
        p.id, p.sku, p.name, p.description, p.category,
        p.price, p.cost, p.tax_rate, p.barcode, p.image_url, p.active,
        COALESCE(i.quantity, 0) as quantity
      FROM products p
      LEFT JOIN inventory i ON p.id = i.product_id
      WHERE p.active = 1
    `;
    const params = [];

    // Category filter (case-insensitive)
    if (categoryFilter && categoryFilter !== 'all') {
      sql += ` AND LOWER(p.category) = LOWER(?)`;
      params.push(categoryFilter);
    }

    // Search filter
    if (searchFilter) {
      sql += ` AND (LOWER(p.name) LIKE LOWER(?) OR LOWER(p.sku) LIKE LOWER(?) OR p.barcode LIKE ?)`;
      params.push(`%${searchFilter}%`, `%${searchFilter}%`, `%${searchFilter}%`);
    }

    sql += ` LIMIT ?`;
    params.push(limitNum);

    const rawProducts = query(sql, params);
    console.log(`[POS] Products query: category=${categoryFilter}, search=${searchFilter}, found=${rawProducts.length}`);

    // Transform products to match UI expectations
    const products = rawProducts.map(p => ({
      // Core fields
      id: p.id,
      sku: p.sku || '',
      name: p.name,
      description: p.description || '',

      // Category fields (various names)
      category: p.category || 'General',
      category_name: p.category || 'General',
      categoryName: p.category || 'General',

      // Price fields (various names)
      price: p.price || 0,
      unit_price: p.price || 0,
      unitPrice: p.price || 0,
      sellingPrice: p.price || 0,
      selling_price: p.price || 0,

      // Cost fields
      cost: p.cost || 0,
      cost_price: p.cost || 0,
      costPrice: p.cost || 0,

      // Tax fields
      tax_rate: p.tax_rate || 0,
      taxRate: p.tax_rate || 0,

      // Stock/Quantity fields (various names)
      quantity: p.quantity || 0,
      quantityOnHand: p.quantity || 0,
      quantity_on_hand: p.quantity || 0,
      stock: p.quantity || 0,
      inStock: (p.quantity || 0) > 0,

      // Image fields
      image: p.image_url || null,
      imageUrl: p.image_url || null,
      image_url: p.image_url || null,

      // Barcode
      barcode: p.barcode || '',

      // Active/status fields (boolean and number variants)
      active: true,
      isActive: true,
      is_active: true,
      status: 'active',

      // Unit
      unit: 'unit',

      // Timestamps (POS UI might need these)
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    console.log(`[POS] Fetched ${products.length} products`);
    if (products.length > 0) {
      console.log('[POS] Sample product:', JSON.stringify(products[0], null, 2));
    }

    // Return in multiple formats for compatibility
    res.json({
      success: true,
      data: products,
      products: products,
      items: products,
      total: products.length,
      count: products.length
    });
  } catch (err) {
    console.error('[POS] Products fetch error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/products/barcode/:barcode', (req, res) => {
  try {
    const product = get('SELECT p.*, i.quantity as stock FROM products p LEFT JOIN inventory i ON p.id = i.product_id WHERE p.barcode = ? AND p.active = 1', [req.params.barcode]);
    if (!product) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: product });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================
// ALIAS ROUTES - UI calls /products, service has /api/products
// (Fix for Lite mode where UI shared/utils/api.ts routes to same origin)
// ============================================

app.get('/products', (req, res) => {
  console.log('[POS] /products alias called, forwarding to /api/products');
  req.url = '/api/products' + (req._parsedUrl?.search || '');
  app._router.handle(req, res, () => res.status(404).json({ error: 'Not found' }));
});

app.get('/products/barcode/:barcode', (req, res) => {
  console.log('[POS] /products/barcode alias called');
  req.url = `/api/products/barcode/${req.params.barcode}`;
  app._router.handle(req, res, () => res.status(404).json({ error: 'Not found' }));
});

// ============================================
// CUSTOMERS API
// ============================================

app.get('/api/customers', (req, res) => {
  try { res.json({ success: true, data: query('SELECT * FROM customers') }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/customers', (req, res) => {
  try {
    const { name, email, phone, address } = req.body;
    const id = uuidv4();
    run('INSERT INTO customers (id, name, email, phone, address) VALUES (?, ?, ?, ?, ?)', [id, name, email, phone, address]);
    res.json({ success: true, data: { id, name } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================
// SALES API
// ============================================

app.get('/api/sales', (req, res) => {
  try { res.json({ success: true, data: query('SELECT s.*, c.name as customer_name FROM sales s LEFT JOIN customers c ON s.customer_id = c.id ORDER BY s.created_at DESC') }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/sales/today', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const sales = query("SELECT * FROM sales WHERE date(created_at) = date(?)", [today]);
    const total = sales.reduce((sum, s) => sum + (s.total || 0), 0);
    res.json({ success: true, data: sales, summary: { count: sales.length, total } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/sales', (req, res) => {
  try {
    const { customer_id, items, subtotal, tax, discount, total, payment_method, session_id } = req.body;
    const id = uuidv4();
    run('INSERT INTO sales (id, customer_id, session_id, items, subtotal, tax, discount, total, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, customer_id, session_id, JSON.stringify(items), subtotal, tax || 0, discount || 0, total, payment_method]);
    const parsedItems = typeof items === 'string' ? JSON.parse(items) : items;
    for (const item of parsedItems) {
      const curr = get('SELECT quantity FROM inventory WHERE product_id = ?', [item.product_id]);
      run('UPDATE inventory SET quantity = ? WHERE product_id = ?', [(curr?.quantity || 0) - item.quantity, item.product_id]);
    }
    if (customer_id) {
      const points = Math.floor(total / 10);
      const curr = get('SELECT loyalty_points FROM customers WHERE id = ?', [customer_id]);
      run('UPDATE customers SET loyalty_points = ? WHERE id = ?', [(curr?.loyalty_points || 0) + points, customer_id]);
    }
    notifyAccounting('retail', 'retail.pos.sale.completed', { transaction_id: id, total_amount: total, payment_method, items: parsedItems, tax: tax || 0 });
    res.json({ success: true, data: { id, total } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================
// POS SETTINGS API - Configurable categories, display options, etc.
// ============================================

// Default settings for new installations
const DEFAULT_SETTINGS = {
  categories: [
    { id: 'all', label: 'All Products', icon: 'Grid' },
    { id: 'general', label: 'General', icon: 'Package' },
    { id: 'electronics', label: 'Electronics', icon: 'Cpu' },
  ],
  currency: { symbol: '₹', code: 'INR', position: 'before' },
  display: {
    showStock: true,
    showSKU: true,
    showCategory: true,
    showImages: true,
    gridColumns: 4,
  },
  tax: {
    defaultRate: 0,
    inclusive: false,
  },
};

app.get('/api/settings', (req, res) => {
  try {
    const row = get('SELECT settings FROM pos_settings WHERE id = ?', ['default']);
    if (row && row.settings) {
      const settings = JSON.parse(row.settings);
      console.log('[POS] Settings loaded:', JSON.stringify(settings.categories?.length || 0), 'categories');
      res.json({ success: true, settings });
    } else {
      // Return defaults if no settings saved
      console.log('[POS] No settings found, returning defaults');
      res.json({ success: true, settings: DEFAULT_SETTINGS });
    }
  } catch (err) {
    console.error('[POS] Settings fetch error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/settings', (req, res) => {
  try {
    const { settings } = req.body;
    if (!settings) {
      return res.status(400).json({ success: false, error: 'Settings object required' });
    }

    // Merge with defaults to ensure all fields exist
    const merged = { ...DEFAULT_SETTINGS, ...settings };
    const settingsJson = JSON.stringify(merged);

    // Upsert settings
    const existing = get('SELECT id FROM pos_settings WHERE id = ?', ['default']);
    if (existing) {
      run('UPDATE pos_settings SET settings = ?, updated_at = ? WHERE id = ?',
        [settingsJson, new Date().toISOString(), 'default']);
    } else {
      run('INSERT INTO pos_settings (id, settings, created_at, updated_at) VALUES (?, ?, ?, ?)',
        ['default', settingsJson, new Date().toISOString(), new Date().toISOString()]);
    }

    console.log('[POS] Settings saved:', JSON.stringify(merged.categories?.length || 0), 'categories');
    res.json({ success: true, settings: merged });
  } catch (err) {
    console.error('[POS] Settings save error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Convenience endpoint to get just categories
app.get('/api/categories', (req, res) => {
  try {
    const row = get('SELECT settings FROM pos_settings WHERE id = ?', ['default']);
    let categories = DEFAULT_SETTINGS.categories;
    if (row && row.settings) {
      const settings = JSON.parse(row.settings);
      categories = settings.categories || DEFAULT_SETTINGS.categories;
    }
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update just categories
app.put('/api/categories', (req, res) => {
  try {
    const { categories } = req.body;
    if (!Array.isArray(categories)) {
      return res.status(400).json({ success: false, error: 'Categories array required' });
    }

    // Get existing settings
    const row = get('SELECT settings FROM pos_settings WHERE id = ?', ['default']);
    let settings = DEFAULT_SETTINGS;
    if (row && row.settings) {
      settings = JSON.parse(row.settings);
    }

    // Update categories
    settings.categories = categories;
    const settingsJson = JSON.stringify(settings);

    const existing = get('SELECT id FROM pos_settings WHERE id = ?', ['default']);
    if (existing) {
      run('UPDATE pos_settings SET settings = ?, updated_at = ? WHERE id = ?',
        [settingsJson, new Date().toISOString(), 'default']);
    } else {
      run('INSERT INTO pos_settings (id, settings, created_at, updated_at) VALUES (?, ?, ?, ?)',
        ['default', settingsJson, new Date().toISOString(), new Date().toISOString()]);
    }

    console.log('[POS] Categories updated:', categories.length, 'categories');
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Alias routes for settings (UI might call without /api prefix)
app.get('/settings', (req, res) => {
  req.url = '/api/settings';
  app._router.handle(req, res, () => res.status(404).json({ error: 'Not found' }));
});

app.get('/categories', (req, res) => {
  req.url = '/api/categories';
  app._router.handle(req, res, () => res.status(404).json({ error: 'Not found' }));
});

// ============================================
// SERVE UI
// ============================================

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'point_of_sale', status: 'running' });
});

// ============================================
// INITIALIZATION
// ============================================

async function init() {
  await initDb();

  // Create pos_sessions table if it doesn't exist
  run(`CREATE TABLE IF NOT EXISTS pos_sessions (
    id TEXT PRIMARY KEY,
    store_id TEXT,
    register_id TEXT,
    cashier_id TEXT,
    opening_balance REAL DEFAULT 0,
    closing_balance REAL DEFAULT 0,
    actual_cash REAL DEFAULT 0,
    notes TEXT,
    status TEXT DEFAULT 'active',
    started_at TEXT,
    ended_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Add session_id to sales table if not exists
  try {
    run('ALTER TABLE sales ADD COLUMN session_id TEXT');
  } catch (e) {
    // Column might already exist
  }

  // Create pos_settings table for configurable categories, display options, etc.
  run(`CREATE TABLE IF NOT EXISTS pos_settings (
    id TEXT PRIMARY KEY,
    settings TEXT,
    created_at TEXT,
    updated_at TEXT
  )`);

  // Initialize default settings if not exists
  const existingSettings = get('SELECT id FROM pos_settings WHERE id = ?', ['default']);
  if (!existingSettings) {
    const defaultSettings = JSON.stringify({
      categories: [
        { id: 'all', label: 'All Products', icon: 'Grid' },
        { id: 'general', label: 'General', icon: 'Package' },
        { id: 'electronics', label: 'Electronics', icon: 'Cpu' },
      ],
      currency: { symbol: '₹', code: 'INR', position: 'before' },
      display: { showStock: true, showSKU: true, showCategory: true, showImages: true, gridColumns: 4 },
      tax: { defaultRate: 0, inclusive: false },
    });
    run('INSERT INTO pos_settings (id, settings, created_at, updated_at) VALUES (?, ?, ?, ?)',
      ['default', defaultSettings, new Date().toISOString(), new Date().toISOString()]);
    console.log('[POS] Default settings initialized');
  }

  app.listen(PORT, () => console.log(`[POS] Running on http://localhost:${PORT}`));
}

init().catch(e => { console.error(e); process.exit(1); });
