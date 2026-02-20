/**
 * Niyam E-commerce Lite - Shared SQLite Database
 * Using sql.js (pure JavaScript, no native deps)
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Database path
const DATA_DIR = path.join(os.homedir(), '.niyam', 'data', 'ecommerce');
const DB_PATH = path.join(DATA_DIR, 'ecommerce.db');

// Ensure directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db = null;

/**
 * Initialize database
 */
async function initDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  // Backup last known good DB before loading
  if (fs.existsSync(DB_PATH)) {
    try { fs.copyFileSync(DB_PATH, DB_PATH + '.bak'); } catch (e) { /* ignore */ }
  }

  // Load existing database or create new (with backup recovery)
  try {
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(buffer);
    } else if (fs.existsSync(DB_PATH + '.bak')) {
      console.log('[Ecommerce DB] Main DB missing, restoring from backup...');
      const buffer = fs.readFileSync(DB_PATH + '.bak');
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }
  } catch (err) {
    if (fs.existsSync(DB_PATH + '.bak')) {
      console.log('[Ecommerce DB] Main DB corrupt, restoring from backup...');
      try {
        const buffer = fs.readFileSync(DB_PATH + '.bak');
        db = new SQL.Database(buffer);
      } catch (e2) {
        console.error('[Ecommerce DB] Backup also corrupt, starting fresh');
        db = new SQL.Database();
      }
    } else {
      console.error('[Ecommerce DB] DB load failed, starting fresh');
      db = new SQL.Database();
    }
  }

  // ── Product Catalog ──────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      sku TEXT UNIQUE,
      name TEXT NOT NULL,
      slug TEXT,
      description TEXT,
      short_description TEXT,
      category_id TEXT,
      brand TEXT,
      unit_price REAL DEFAULT 0,
      cost_price REAL DEFAULT 0,
      compare_at_price REAL,
      tax_rate REAL DEFAULT 0,
      weight REAL,
      weight_unit TEXT DEFAULT 'kg',
      status TEXT DEFAULT 'draft',
      is_digital INTEGER DEFAULT 0,
      images TEXT DEFAULT '[]',
      tags TEXT DEFAULT '[]',
      attributes TEXT DEFAULT '{}',
      seo_title TEXT,
      seo_description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT,
      parent_id TEXT,
      description TEXT,
      image_url TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS product_variants (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      sku TEXT,
      name TEXT,
      options TEXT DEFAULT '{}',
      price_adjustment REAL DEFAULT 0,
      stock_quantity INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ── Shopping Cart ────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS carts (
      id TEXT PRIMARY KEY,
      customer_id TEXT,
      session_id TEXT,
      status TEXT DEFAULT 'active',
      currency TEXT DEFAULT 'USD',
      coupon_code TEXT,
      discount_amount REAL DEFAULT 0,
      subtotal REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      total REAL DEFAULT 0,
      notes TEXT,
      abandoned_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS cart_items (
      id TEXT PRIMARY KEY,
      cart_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      variant_id TEXT,
      quantity INTEGER DEFAULT 1,
      unit_price REAL DEFAULT 0,
      total_price REAL DEFAULT 0
    )
  `);

  // ── Checkout ─────────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS checkout_sessions (
      id TEXT PRIMARY KEY,
      cart_id TEXT NOT NULL,
      customer_id TEXT,
      email TEXT,
      shipping_address TEXT DEFAULT '{}',
      billing_address TEXT DEFAULT '{}',
      shipping_method TEXT,
      shipping_cost REAL DEFAULT 0,
      payment_method TEXT,
      payment_intent_id TEXT,
      step TEXT DEFAULT 'address',
      status TEXT DEFAULT 'pending',
      expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ── Orders ───────────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number TEXT UNIQUE NOT NULL,
      customer_id TEXT,
      customer_email TEXT,
      items TEXT DEFAULT '[]',
      subtotal REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      shipping_cost REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      total REAL DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      status TEXT DEFAULT 'pending',
      payment_status TEXT DEFAULT 'unpaid',
      fulfillment_status TEXT DEFAULT 'unfulfilled',
      shipping_address TEXT DEFAULT '{}',
      billing_address TEXT DEFAULT '{}',
      shipping_method TEXT,
      tracking_number TEXT,
      notes TEXT,
      cancelled_at TEXT,
      cancel_reason TEXT,
      fulfilled_at TEXT,
      delivered_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      variant_id TEXT,
      sku TEXT,
      name TEXT,
      quantity INTEGER DEFAULT 1,
      unit_price REAL DEFAULT 0,
      total_price REAL DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS fulfillments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      tracking_number TEXT,
      carrier TEXT,
      items TEXT DEFAULT '[]',
      status TEXT DEFAULT 'pending',
      shipped_at TEXT,
      delivered_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS refunds (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT,
      items TEXT DEFAULT '[]',
      status TEXT DEFAULT 'pending',
      refunded_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ── Customer Accounts ────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      first_name TEXT,
      last_name TEXT,
      phone TEXT,
      loyalty_points INTEGER DEFAULT 0,
      loyalty_tier TEXT DEFAULT 'bronze',
      total_orders INTEGER DEFAULT 0,
      total_spent REAL DEFAULT 0,
      tags TEXT DEFAULT '[]',
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      last_login_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS addresses (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      type TEXT DEFAULT 'shipping',
      is_default INTEGER DEFAULT 0,
      first_name TEXT,
      last_name TEXT,
      line1 TEXT,
      line2 TEXT,
      city TEXT,
      state TEXT,
      postal_code TEXT,
      country TEXT DEFAULT 'US',
      phone TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS wishlists (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      added_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ── Payment Gateway ──────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS gateway_configs (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      display_name TEXT,
      credentials TEXT DEFAULT '{}',
      is_active INTEGER DEFAULT 1,
      is_default INTEGER DEFAULT 0,
      supported_methods TEXT DEFAULT '["card"]',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      order_id TEXT,
      gateway_id TEXT,
      type TEXT DEFAULT 'charge',
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      status TEXT DEFAULT 'pending',
      payment_method TEXT,
      card_last_four TEXT,
      reference_id TEXT,
      error_message TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ── Inventory Sync ───────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS stock_records (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      variant_id TEXT,
      location TEXT DEFAULT 'default',
      quantity INTEGER DEFAULT 0,
      reserved INTEGER DEFAULT 0,
      low_stock_threshold INTEGER DEFAULT 10,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS stock_reservations (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      variant_id TEXT,
      order_id TEXT,
      quantity INTEGER NOT NULL,
      status TEXT DEFAULT 'active',
      expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sync_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'warehouse',
      config TEXT DEFAULT '{}',
      is_active INTEGER DEFAULT 1,
      last_synced_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS stock_alerts (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      type TEXT DEFAULT 'low_stock',
      message TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ── Shipping ─────────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS carriers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE,
      is_active INTEGER DEFAULT 1,
      config TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS shipments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      carrier_id TEXT,
      tracking_number TEXT,
      label_url TEXT,
      status TEXT DEFAULT 'pending',
      estimated_delivery TEXT,
      actual_delivery TEXT,
      cost REAL DEFAULT 0,
      weight REAL,
      dimensions TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tracking_events (
      id TEXT PRIMARY KEY,
      shipment_id TEXT NOT NULL,
      status TEXT,
      location TEXT,
      description TEXT,
      occurred_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ── Discount Coupons ─────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS coupons (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      description TEXT,
      discount_type TEXT DEFAULT 'percentage',
      discount_value REAL NOT NULL,
      min_order_amount REAL DEFAULT 0,
      max_discount_amount REAL,
      max_uses INTEGER,
      uses_count INTEGER DEFAULT 0,
      max_uses_per_customer INTEGER DEFAULT 1,
      applicable_products TEXT DEFAULT '[]',
      applicable_categories TEXT DEFAULT '[]',
      is_active INTEGER DEFAULT 1,
      starts_at TEXT,
      expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS coupon_usage (
      id TEXT PRIMARY KEY,
      coupon_id TEXT NOT NULL,
      customer_id TEXT,
      order_id TEXT,
      discount_applied REAL,
      used_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ── Abandoned Cart Recovery ──────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS abandoned_carts (
      id TEXT PRIMARY KEY,
      cart_id TEXT NOT NULL,
      customer_id TEXT,
      customer_email TEXT,
      cart_total REAL DEFAULT 0,
      items_count INTEGER DEFAULT 0,
      recovery_status TEXT DEFAULT 'pending',
      recovery_attempts INTEGER DEFAULT 0,
      last_attempt_at TEXT,
      recovered_at TEXT,
      recovered_order_id TEXT,
      abandoned_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS recovery_attempts (
      id TEXT PRIMARY KEY,
      abandoned_cart_id TEXT NOT NULL,
      channel TEXT DEFAULT 'email',
      template_id TEXT,
      status TEXT DEFAULT 'sent',
      sent_at TEXT DEFAULT (datetime('now')),
      opened_at TEXT,
      clicked_at TEXT,
      converted_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS recovery_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      channel TEXT DEFAULT 'email',
      subject TEXT,
      body TEXT,
      delay_hours INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ── Product Reviews ──────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      customer_id TEXT,
      customer_name TEXT,
      rating INTEGER NOT NULL,
      title TEXT,
      body TEXT,
      is_verified_purchase INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      helpful_count INTEGER DEFAULT 0,
      reported_count INTEGER DEFAULT 0,
      admin_response TEXT,
      responded_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ── Sales Analytics ──────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS daily_sales (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL UNIQUE,
      total_orders INTEGER DEFAULT 0,
      total_revenue REAL DEFAULT 0,
      total_items_sold INTEGER DEFAULT 0,
      average_order_value REAL DEFAULT 0,
      total_refunds REAL DEFAULT 0,
      net_revenue REAL DEFAULT 0,
      new_customers INTEGER DEFAULT 0,
      returning_customers INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS product_performance (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      period TEXT NOT NULL,
      units_sold INTEGER DEFAULT 0,
      revenue REAL DEFAULT 0,
      views INTEGER DEFAULT 0,
      conversion_rate REAL DEFAULT 0,
      avg_rating REAL DEFAULT 0,
      return_rate REAL DEFAULT 0
    )
  `);

  // Save after schema creation
  saveDb();
  console.log('[Ecommerce DB] Initialized successfully at', DB_PATH);

  return db;
}

/**
 * Save database to disk
 */
function saveDb() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('[Ecommerce DB] Save error:', err.message);
  }
}

/**
 * Query (SELECT) - returns array of objects
 */
function query(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  try {
    const stmt = db.prepare(sql);
    if (params.length) stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  } catch (err) {
    console.error('[Ecommerce DB] Query error:', err.message, sql);
    return [];
  }
}

/**
 * Run (INSERT/UPDATE/DELETE) - no return
 */
function run(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  try {
    db.run(sql, params);
    saveDb();
  } catch (err) {
    console.error('[Ecommerce DB] Run error:', err.message, sql);
    throw err;
  }
}

/**
 * Get single row - returns object or null
 */
function get(sql, params = []) {
  const results = query(sql, params);
  return results.length > 0 ? results[0] : null;
}

// Graceful shutdown
process.on('SIGINT', () => { saveDb(); process.exit(0); });
process.on('SIGTERM', () => { saveDb(); process.exit(0); });

module.exports = { initDb, query, run, get, saveDb };
