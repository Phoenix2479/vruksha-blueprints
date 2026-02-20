/**
 * Niyam Max Lite - Shared SQLite Database
 * Using sql.js (pure JavaScript, no native deps)
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Database path
const DATA_DIR = path.join(os.homedir(), '.niyam', 'data', 'retail');
const DB_PATH = path.join(DATA_DIR, 'retail.db');

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
  
  // Load existing database or create new
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  
  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      sku TEXT UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      price REAL DEFAULT 0,
      cost REAL DEFAULT 0,
      tax_rate REAL DEFAULT 0,
      barcode TEXT,
      image_url TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      location TEXT DEFAULT 'main',
      quantity INTEGER DEFAULT 0,
      min_quantity INTEGER DEFAULT 0,
      max_quantity INTEGER DEFAULT 0,
      last_restock TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      loyalty_points INTEGER DEFAULT 0,
      tags TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      customer_id TEXT,
      items TEXT NOT NULL,
      subtotal REAL NOT NULL,
      tax REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      total REAL NOT NULL,
      payment_method TEXT,
      status TEXT DEFAULT 'completed',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      customer_id TEXT,
      items TEXT NOT NULL,
      subtotal REAL NOT NULL,
      shipping REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      total REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      shipping_address TEXT,
      tracking_number TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS stores (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      email TEXT,
      manager TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS labels (
      id TEXT PRIMARY KEY,
      product_id TEXT,
      barcode TEXT,
      label_type TEXT,
      template TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      to_address TEXT NOT NULL,
      subject TEXT,
      body TEXT,
      template TEXT,
      status TEXT DEFAULT 'pending',
      sent_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Billing Engine tables
  db.run(`
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      invoice_number TEXT UNIQUE,
      customer_id TEXT,
      customer_name TEXT,
      store_id TEXT,
      items TEXT,
      subtotal REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      total REAL DEFAULT 0,
      amount_paid REAL DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      status TEXT DEFAULT 'draft',
      issue_date TEXT,
      due_date TEXT,
      paid_date TEXT,
      notes TEXT,
      terms TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      payment_number TEXT,
      invoice_id TEXT,
      customer_id TEXT,
      amount REAL NOT NULL,
      payment_method TEXT,
      transaction_ref TEXT,
      status TEXT DEFAULT 'completed',
      notes TEXT,
      processed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Loyalty tables
  db.run(`
    CREATE TABLE IF NOT EXISTS loyalty_transactions (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      transaction_type TEXT,
      points INTEGER DEFAULT 0,
      balance_before INTEGER DEFAULT 0,
      balance_after INTEGER DEFAULT 0,
      reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Procurement tables
  db.run(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY,
      po_number TEXT,
      supplier_id TEXT,
      location_id TEXT,
      store_id TEXT,
      items TEXT,
      subtotal REAL DEFAULT 0,
      total REAL DEFAULT 0,
      status TEXT DEFAULT 'draft',
      expected_delivery_date TEXT,
      received_date TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact_name TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      payment_terms TEXT,
      rating REAL DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS supplier_ratings (
      id TEXT PRIMARY KEY,
      supplier_id TEXT,
      po_id TEXT,
      rating INTEGER,
      comments TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Workforce tables
  db.run(`
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      role TEXT,
      department TEXT,
      hire_date TEXT,
      hourly_rate REAL DEFAULT 0,
      commission_rate REAL DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS shifts (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      location_id TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      status TEXT DEFAULT 'scheduled',
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS time_logs (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      action TEXT NOT NULL,
      location_id TEXT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Quality Control tables
  db.run(`
    CREATE TABLE IF NOT EXISTS quality_checks (
      id TEXT PRIMARY KEY,
      product_id TEXT,
      batch_number TEXT,
      inspector_id TEXT,
      check_type TEXT,
      status TEXT DEFAULT 'pending',
      score REAL,
      notes TEXT,
      defects TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Returns tables
  db.run(`
    CREATE TABLE IF NOT EXISTS returns (
      id TEXT PRIMARY KEY,
      sale_id TEXT,
      customer_id TEXT,
      items TEXT,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      refund_amount REAL DEFAULT 0,
      refund_method TEXT,
      processed_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Marketing tables
  db.run(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT,
      status TEXT DEFAULT 'draft',
      start_date TEXT,
      end_date TEXT,
      budget REAL DEFAULT 0,
      target_audience TEXT,
      content TEXT,
      metrics TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Promotions tables
  db.run(`
    CREATE TABLE IF NOT EXISTS promotions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT,
      type TEXT,
      discount_type TEXT,
      discount_value REAL DEFAULT 0,
      min_purchase REAL DEFAULT 0,
      max_uses INTEGER,
      uses_count INTEGER DEFAULT 0,
      start_date TEXT,
      end_date TEXT,
      active INTEGER DEFAULT 1,
      conditions TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Pricing tables
  db.run(`
    CREATE TABLE IF NOT EXISTS price_rules (
      id TEXT PRIMARY KEY,
      name TEXT,
      product_id TEXT,
      category TEXT,
      rule_type TEXT,
      value REAL,
      min_quantity INTEGER,
      customer_group TEXT,
      start_date TEXT,
      end_date TEXT,
      priority INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tax tables
  db.run(`
    CREATE TABLE IF NOT EXISTS tax_rates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      rate REAL NOT NULL,
      region TEXT,
      category TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tax_reports (
      id TEXT PRIMARY KEY,
      period_start TEXT,
      period_end TEXT,
      total_sales REAL DEFAULT 0,
      total_tax REAL DEFAULT 0,
      breakdown TEXT,
      status TEXT DEFAULT 'draft',
      filed_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Vendor tables
  db.run(`
    CREATE TABLE IF NOT EXISTS vendor_feedback (
      id TEXT PRIMARY KEY,
      vendor_id TEXT,
      order_id TEXT,
      rating INTEGER,
      delivery_rating INTEGER,
      quality_rating INTEGER,
      comments TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Asset tables
  db.run(`
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT,
      serial_number TEXT,
      location_id TEXT,
      purchase_date TEXT,
      purchase_price REAL,
      current_value REAL,
      status TEXT DEFAULT 'active',
      warranty_expiry TEXT,
      last_maintenance TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS maintenance_logs (
      id TEXT PRIMARY KEY,
      asset_id TEXT,
      type TEXT,
      description TEXT,
      cost REAL DEFAULT 0,
      performed_by TEXT,
      performed_date TEXT,
      next_due TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // HR tables
  db.run(`
    CREATE TABLE IF NOT EXISTS leave_requests (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      type TEXT,
      start_date TEXT,
      end_date TEXT,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      approved_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS payroll (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      period_start TEXT,
      period_end TEXT,
      base_pay REAL DEFAULT 0,
      overtime_pay REAL DEFAULT 0,
      commission REAL DEFAULT 0,
      deductions REAL DEFAULT 0,
      net_pay REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      paid_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Reporting tables
  db.run(`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT,
      parameters TEXT,
      data TEXT,
      generated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Notifications
  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      type TEXT,
      title TEXT,
      message TEXT,
      read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Audit log
  db.run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT,
      entity_type TEXT,
      entity_id TEXT,
      old_value TEXT,
      new_value TEXT,
      ip_address TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Warranty
  db.run(`
    CREATE TABLE IF NOT EXISTS warranties (
      id TEXT PRIMARY KEY,
      product_id TEXT,
      sale_id TEXT,
      customer_id TEXT,
      serial_number TEXT,
      start_date TEXT,
      end_date TEXT,
      type TEXT,
      status TEXT DEFAULT 'active',
      claims TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS warranty_claims (
      id TEXT PRIMARY KEY,
      warranty_id TEXT,
      customer_id TEXT,
      issue TEXT,
      status TEXT DEFAULT 'pending',
      resolution TEXT,
      cost REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      resolved_at TEXT
    )
  `);

  // Logistics
  db.run(`
    CREATE TABLE IF NOT EXISTS shipments (
      id TEXT PRIMARY KEY,
      order_id TEXT,
      carrier TEXT,
      tracking_number TEXT,
      status TEXT DEFAULT 'pending',
      origin TEXT,
      destination TEXT,
      estimated_delivery TEXT,
      actual_delivery TEXT,
      cost REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Competitor analysis
  db.run(`
    CREATE TABLE IF NOT EXISTS competitor_prices (
      id TEXT PRIMARY KEY,
      product_id TEXT,
      competitor_name TEXT,
      price REAL,
      url TEXT,
      checked_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('[SQLite] Database initialized at', DB_PATH);
  saveDb();
  return db;
}

/**
 * Save database to file
 */
function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

/**
 * Query helper - returns array of objects
 */
function query(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/**
 * Run helper - for INSERT/UPDATE/DELETE
 */
function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

/**
 * Get single row
 */
function get(sql, params = []) {
  const results = query(sql, params);
  return results[0] || null;
}

module.exports = {
  initDb,
  query,
  run,
  get,
  saveDb,
  DB_PATH,
  DATA_DIR
};
