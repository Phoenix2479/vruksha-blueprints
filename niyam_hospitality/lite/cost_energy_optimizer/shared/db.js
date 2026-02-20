/**
 * Niyam Max Lite - Hospitality Shared SQLite Database
 * Using sql.js (pure JavaScript, no native deps)
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Database path
const DATA_DIR = path.join(os.homedir(), '.niyam', 'data', 'hospitality');
const DB_PATH = path.join(DATA_DIR, 'hospitality.db');

// Ensure directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db = null;

/**
 * Initialize database with hospitality tables
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
      console.log('[Hospitality DB] Main DB missing, restoring from backup...');
      const buffer = fs.readFileSync(DB_PATH + '.bak');
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }
  } catch (err) {
    if (fs.existsSync(DB_PATH + '.bak')) {
      console.log('[Hospitality DB] Main DB corrupt, restoring from backup...');
      try {
        const buffer = fs.readFileSync(DB_PATH + '.bak');
        db = new SQL.Database(buffer);
      } catch (e2) {
        console.error('[Hospitality DB] Backup also corrupt, starting fresh');
        db = new SQL.Database();
      }
    } else {
      console.error('[Hospitality DB] DB load failed, starting fresh');
      db = new SQL.Database();
    }
  }
  
  // ============================================
  // PROPERTY & ROOMS
  // ============================================
  
  db.run(`
    CREATE TABLE IF NOT EXISTS properties (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'hotel',
      address TEXT,
      city TEXT,
      country TEXT,
      phone TEXT,
      email TEXT,
      timezone TEXT DEFAULT 'UTC',
      currency TEXT DEFAULT 'INR',
      tax_rate REAL DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS room_types (
      id TEXT PRIMARY KEY,
      property_id TEXT,
      name TEXT NOT NULL,
      code TEXT,
      description TEXT,
      base_rate REAL DEFAULT 0,
      base_price REAL DEFAULT 0,
      max_occupancy INTEGER DEFAULT 2,
      amenities TEXT,
      image_url TEXT,
      active INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      property_id TEXT,
      room_type_id TEXT,
      room_number TEXT NOT NULL,
      floor TEXT,
      status TEXT DEFAULT 'available',
      condition TEXT DEFAULT 'clean',
      notes TEXT,
      features TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ============================================
  // GUESTS & RESERVATIONS
  // ============================================

  db.run(`
    CREATE TABLE IF NOT EXISTS guests (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      city TEXT,
      country TEXT,
      id_type TEXT,
      id_number TEXT,
      date_of_birth TEXT,
      nationality TEXT,
      loyalty_tier TEXT DEFAULT 'standard',
      loyalty_points INTEGER DEFAULT 0,
      preferences TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY,
      property_id TEXT,
      guest_id TEXT,
      room_id TEXT,
      room_type_id TEXT,
      confirmation_number TEXT UNIQUE,
      check_in_date TEXT NOT NULL,
      check_out_date TEXT NOT NULL,
      actual_check_in TEXT,
      actual_check_out TEXT,
      adults INTEGER DEFAULT 1,
      children INTEGER DEFAULT 0,
      status TEXT DEFAULT 'confirmed',
      source TEXT DEFAULT 'direct',
      rate_plan TEXT,
      room_rate REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      deposit_amount REAL DEFAULT 0,
      balance_due REAL DEFAULT 0,
      special_requests TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS guest_folios (
      id TEXT PRIMARY KEY,
      reservation_id TEXT,
      guest_id TEXT,
      item_type TEXT NOT NULL,
      description TEXT,
      quantity INTEGER DEFAULT 1,
      unit_price REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      department TEXT,
      posted_by TEXT,
      posted_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ============================================
  // HOUSEKEEPING
  // ============================================

  db.run(`
    CREATE TABLE IF NOT EXISTS housekeeping_tasks (
      id TEXT PRIMARY KEY,
      property_id TEXT,
      room_id TEXT,
      task_type TEXT NOT NULL,
      priority TEXT DEFAULT 'normal',
      status TEXT DEFAULT 'pending',
      assigned_to TEXT,
      scheduled_date TEXT,
      started_at TEXT,
      completed_at TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS maintenance_requests (
      id TEXT PRIMARY KEY,
      property_id TEXT,
      room_id TEXT,
      location TEXT,
      category TEXT,
      description TEXT NOT NULL,
      priority TEXT DEFAULT 'normal',
      status TEXT DEFAULT 'open',
      reported_by TEXT,
      assigned_to TEXT,
      estimated_cost REAL,
      actual_cost REAL,
      resolved_at TEXT,
      resolution_notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ============================================
  // RESTAURANT & F&B
  // ============================================

  db.run(`
    CREATE TABLE IF NOT EXISTS restaurant_tables (
      id TEXT PRIMARY KEY,
      property_id TEXT,
      outlet_id TEXT,
      table_number TEXT NOT NULL,
      capacity INTEGER DEFAULT 4,
      location TEXT,
      status TEXT DEFAULT 'available',
      current_order_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS menu_categories (
      id TEXT PRIMARY KEY,
      property_id TEXT,
      outlet_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      display_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id TEXT PRIMARY KEY,
      property_id TEXT,
      category_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL DEFAULT 0,
      cost REAL DEFAULT 0,
      tax_rate REAL DEFAULT 0,
      preparation_time INTEGER DEFAULT 15,
      allergens TEXT,
      dietary_flags TEXT,
      image_url TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS restaurant_orders (
      id TEXT PRIMARY KEY,
      property_id TEXT,
      outlet_id TEXT,
      table_id TEXT,
      guest_id TEXT,
      reservation_id TEXT,
      room_number TEXT,
      order_type TEXT DEFAULT 'dine_in',
      status TEXT DEFAULT 'open',
      items TEXT NOT NULL,
      subtotal REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      service_charge REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      total REAL DEFAULT 0,
      payment_method TEXT,
      payment_status TEXT DEFAULT 'pending',
      server_id TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      closed_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS kitchen_orders (
      id TEXT PRIMARY KEY,
      order_id TEXT,
      item_id TEXT,
      item_name TEXT,
      quantity INTEGER DEFAULT 1,
      modifiers TEXT,
      station TEXT,
      status TEXT DEFAULT 'pending',
      priority TEXT DEFAULT 'normal',
      started_at TEXT,
      completed_at TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ============================================
  // INVENTORY & PROCUREMENT
  // ============================================

  db.run(`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY,
      property_id TEXT,
      sku TEXT,
      name TEXT NOT NULL,
      category TEXT,
      unit TEXT DEFAULT 'each',
      quantity REAL DEFAULT 0,
      min_quantity REAL DEFAULT 0,
      max_quantity REAL DEFAULT 0,
      unit_cost REAL DEFAULT 0,
      location TEXT,
      supplier_id TEXT,
      last_restock TEXT,
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
      rating INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY,
      property_id TEXT,
      supplier_id TEXT,
      po_number TEXT UNIQUE,
      status TEXT DEFAULT 'draft',
      items TEXT NOT NULL,
      subtotal REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      total REAL DEFAULT 0,
      expected_date TEXT,
      received_date TEXT,
      notes TEXT,
      created_by TEXT,
      approved_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ============================================
  // STAFF & SCHEDULING
  // ============================================

  db.run(`
    CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY,
      property_id TEXT,
      employee_id TEXT,
      first_name TEXT NOT NULL,
      last_name TEXT,
      email TEXT,
      phone TEXT,
      department TEXT,
      role TEXT,
      hire_date TEXT,
      hourly_rate REAL,
      status TEXT DEFAULT 'active',
      pin_code TEXT,
      permissions TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS staff_schedules (
      id TEXT PRIMARY KEY,
      staff_id TEXT,
      property_id TEXT,
      shift_date TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      department TEXT,
      position TEXT,
      status TEXT DEFAULT 'scheduled',
      actual_start TEXT,
      actual_end TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ============================================
  // BILLING & PAYMENTS
  // ============================================

  db.run(`
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      property_id TEXT,
      reservation_id TEXT,
      guest_id TEXT,
      invoice_number TEXT UNIQUE,
      items TEXT NOT NULL,
      subtotal REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      total REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      due_date TEXT,
      paid_at TEXT,
      payment_method TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      property_id TEXT,
      invoice_id TEXT,
      reservation_id TEXT,
      guest_id TEXT,
      amount REAL NOT NULL,
      payment_method TEXT,
      reference_number TEXT,
      status TEXT DEFAULT 'completed',
      processed_by TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ============================================
  // GUEST SERVICES & REQUESTS
  // ============================================

  db.run(`
    CREATE TABLE IF NOT EXISTS guest_requests (
      id TEXT PRIMARY KEY,
      property_id TEXT,
      reservation_id TEXT,
      guest_id TEXT,
      room_id TEXT,
      request_type TEXT NOT NULL,
      category TEXT,
      description TEXT,
      priority TEXT DEFAULT 'normal',
      status TEXT DEFAULT 'pending',
      assigned_to TEXT,
      estimated_time INTEGER,
      completed_at TEXT,
      feedback_rating INTEGER,
      feedback_notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS guest_feedback (
      id TEXT PRIMARY KEY,
      property_id TEXT,
      reservation_id TEXT,
      guest_id TEXT,
      category TEXT,
      rating INTEGER,
      comment TEXT,
      response TEXT,
      responded_by TEXT,
      responded_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ============================================
  // RATES & AVAILABILITY
  // ============================================

  db.run(`
    CREATE TABLE IF NOT EXISTS rate_plans (
      id TEXT PRIMARY KEY,
      property_id TEXT,
      room_type_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      base_rate REAL DEFAULT 0,
      inclusions TEXT,
      cancellation_policy TEXT,
      min_stay INTEGER DEFAULT 1,
      max_stay INTEGER,
      valid_from TEXT,
      valid_to TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS rate_calendar (
      id TEXT PRIMARY KEY,
      property_id TEXT,
      room_type_id TEXT,
      room_type TEXT,
      rate_plan_id TEXT,
      date TEXT NOT NULL,
      rate_date TEXT,
      rate REAL DEFAULT 0,
      price REAL DEFAULT 0,
      available_rooms INTEGER DEFAULT 0,
      min_stay INTEGER DEFAULT 1,
      closed INTEGER DEFAULT 0,
      is_closed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ============================================
  // CHANNELS & DISTRIBUTION
  // ============================================

  db.run(`
    CREATE TABLE IF NOT EXISTS channel_mappings (
      id TEXT PRIMARY KEY,
      property_id TEXT,
      channel_name TEXT NOT NULL,
      channel_id TEXT,
      room_type_id TEXT,
      rate_plan_id TEXT,
      channel_room_code TEXT,
      channel_rate_code TEXT,
      sync_enabled INTEGER DEFAULT 1,
      last_sync TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ============================================
  // REPORTS & ANALYTICS
  // ============================================

  db.run(`
    CREATE TABLE IF NOT EXISTS daily_stats (
      id TEXT PRIMARY KEY,
      property_id TEXT,
      date TEXT NOT NULL,
      rooms_available INTEGER DEFAULT 0,
      rooms_occupied INTEGER DEFAULT 0,
      rooms_ooo INTEGER DEFAULT 0,
      arrivals INTEGER DEFAULT 0,
      departures INTEGER DEFAULT 0,
      revenue_rooms REAL DEFAULT 0,
      revenue_fnb REAL DEFAULT 0,
      revenue_other REAL DEFAULT 0,
      adr REAL DEFAULT 0,
      revpar REAL DEFAULT 0,
      occupancy_rate REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ============================================
  // SYSTEM SETTINGS
  // ============================================

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      property_id TEXT,
      module TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(property_id, module, key)
    )
  `);

  console.log('[SQLite] Hospitality database initialized at', DB_PATH);
  saveDb();
  return db;
}

/**
 * Save database to file
 */
function saveDb() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    const tmpPath = DB_PATH + '.tmp';
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, DB_PATH);
  } catch (err) {
    console.error('[Hospitality DB] Save failed:', err.message);
  }
}

// Graceful shutdown
let _isShuttingDown = false;
function _shutdown(signal) {
  if (_isShuttingDown) return;
  _isShuttingDown = true;
  console.log(`[Hospitality DB] ${signal} received, saving...`);
  saveDb();
  process.exit(0);
}
process.on('SIGINT', () => _shutdown('SIGINT'));
process.on('SIGTERM', () => _shutdown('SIGTERM'));

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

/**
 * Generate unique ID
 */
function generateId() {
  return require('crypto').randomUUID();
}

/**
 * Get current timestamp in ISO format
 */
function timestamp() {
  return new Date().toISOString();
}

module.exports = {
  initDb,
  query,
  run,
  get,
  saveDb,
  generateId,
  timestamp,
  DB_PATH,
  DATA_DIR
};
