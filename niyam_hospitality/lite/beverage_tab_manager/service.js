/**
 * Beverage Tab Manager Service - Niyam Hospitality (Max Lite)
 * Bar tabs, drink orders, tab management, happy hour
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8919;
const SERVICE_NAME = 'beverage_tab_manager';

app.use(cors());
app.use(express.json());

// Serve UI
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) {
  app.use(express.static(uiPath));
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: SERVICE_NAME, mode: 'lite' });
});

// ============================================
// ADDITIONAL TABLES
// ============================================

async function ensureTables() {
  const db = await initDb();
  
  // Bar tabs
  db.run(`
    CREATE TABLE IF NOT EXISTS bar_tabs (
      id TEXT PRIMARY KEY,
      tab_number TEXT NOT NULL,
      guest_id TEXT,
      guest_name TEXT,
      room_number TEXT,
      table_id TEXT,
      seat_number INTEGER,
      bartender_id TEXT,
      status TEXT DEFAULT 'open',
      subtotal REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      discount_reason TEXT,
      tip REAL DEFAULT 0,
      total REAL DEFAULT 0,
      payment_method TEXT,
      payment_status TEXT DEFAULT 'pending',
      card_on_file TEXT,
      notes TEXT,
      opened_at TEXT DEFAULT CURRENT_TIMESTAMP,
      closed_at TEXT
    )
  `);
  
  // Tab items
  db.run(`
    CREATE TABLE IF NOT EXISTS tab_items (
      id TEXT PRIMARY KEY,
      tab_id TEXT NOT NULL,
      item_id TEXT,
      item_name TEXT NOT NULL,
      category TEXT DEFAULT 'beverage',
      quantity INTEGER DEFAULT 1,
      unit_price REAL DEFAULT 0,
      modifiers TEXT,
      subtotal REAL DEFAULT 0,
      voided INTEGER DEFAULT 0,
      void_reason TEXT,
      served_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Beverage menu
  db.run(`
    CREATE TABLE IF NOT EXISTS beverages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'beer',
      subcategory TEXT,
      description TEXT,
      price REAL DEFAULT 0,
      happy_hour_price REAL,
      cost REAL DEFAULT 0,
      abv REAL,
      size TEXT,
      pour_size TEXT,
      in_stock INTEGER DEFAULT 1,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Happy hour schedules
  db.run(`
    CREATE TABLE IF NOT EXISTS happy_hours (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      day_of_week TEXT,
      start_time TEXT,
      end_time TEXT,
      discount_percent REAL DEFAULT 0,
      categories TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Pour tracking (for draft beers, wines)
  db.run(`
    CREATE TABLE IF NOT EXISTS pour_log (
      id TEXT PRIMARY KEY,
      beverage_id TEXT,
      tab_id TEXT,
      pour_size TEXT,
      actual_pour REAL,
      expected_pour REAL,
      variance REAL,
      bartender_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  return db;
}

// ============================================
// BAR TABS
// ============================================

app.get('/tabs', async (req, res) => {
  try {
    await ensureTables();
    const { status = 'open' } = req.query;
    
    const tabs = query(`
      SELECT t.*, 
        (SELECT COUNT(*) FROM tab_items WHERE tab_id = t.id AND voided = 0) as item_count
      FROM bar_tabs t
      WHERE t.status = ?
      ORDER BY t.opened_at DESC
    `, [status]);
    
    res.json({ success: true, tabs });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/tabs/:id', async (req, res) => {
  try {
    await ensureTables();
    const tab = get(`SELECT * FROM bar_tabs WHERE id = ?`, [req.params.id]);
    if (!tab) {
      return res.status(404).json({ success: false, error: 'Tab not found' });
    }
    
    const items = query(`
      SELECT * FROM tab_items WHERE tab_id = ? ORDER BY created_at ASC
    `, [req.params.id]);
    
    res.json({ success: true, tab: { ...tab, items } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/tabs', async (req, res) => {
  try {
    await ensureTables();
    const { guest_name, guest_id, room_number, table_id, seat_number, bartender_id, card_on_file, notes } = req.body;
    
    const id = generateId();
    const tabNumber = `TAB${Date.now().toString(36).toUpperCase()}`;
    
    run(`
      INSERT INTO bar_tabs (id, tab_number, guest_name, guest_id, room_number, table_id, seat_number, bartender_id, card_on_file, notes, opened_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, tabNumber, guest_name, guest_id, room_number, table_id, seat_number, bartender_id, card_on_file, notes, timestamp()]);
    
    res.json({ success: true, tab: { id, tab_number: tabNumber, guest_name, status: 'open' } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Add item to tab
app.post('/tabs/:id/items', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { item_id, item_name, category, quantity, unit_price, modifiers, served_by } = req.body;
    
    // Check if happy hour
    const now = new Date();
    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const currentTime = now.toTimeString().slice(0, 5);
    
    const happyHour = get(`
      SELECT * FROM happy_hours 
      WHERE active = 1 
        AND day_of_week LIKE ?
        AND start_time <= ? AND end_time >= ?
    `, [`%${dayOfWeek}%`, currentTime, currentTime]);
    
    let finalPrice = unit_price;
    if (happyHour && item_id) {
      const beverage = get(`SELECT * FROM beverages WHERE id = ?`, [item_id]);
      if (beverage && beverage.happy_hour_price) {
        finalPrice = beverage.happy_hour_price;
      } else if (happyHour.discount_percent > 0) {
        finalPrice = unit_price * (1 - happyHour.discount_percent / 100);
      }
    }
    
    const itemId = generateId();
    const qty = quantity || 1;
    const subtotal = finalPrice * qty;
    
    run(`
      INSERT INTO tab_items (id, tab_id, item_id, item_name, category, quantity, unit_price, modifiers, subtotal, served_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [itemId, id, item_id, item_name, category || 'beverage', qty, finalPrice, JSON.stringify(modifiers || []), subtotal, served_by, timestamp()]);
    
    // Update tab totals
    updateTabTotals(id);
    
    res.json({ success: true, item: { id: itemId, item_name, quantity: qty, unit_price: finalPrice, subtotal, happy_hour_applied: finalPrice !== unit_price } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Void item
app.post('/tabs/:tabId/items/:itemId/void', async (req, res) => {
  try {
    await ensureTables();
    const { tabId, itemId } = req.params;
    const { reason } = req.body;
    
    run(`UPDATE tab_items SET voided = 1, void_reason = ? WHERE id = ? AND tab_id = ?`, [reason, itemId, tabId]);
    updateTabTotals(tabId);
    
    res.json({ success: true, message: 'Item voided' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

function updateTabTotals(tabId) {
  const items = query(`SELECT * FROM tab_items WHERE tab_id = ? AND voided = 0`, [tabId]);
  
  let subtotal = 0;
  items.forEach(item => {
    subtotal += item.subtotal || 0;
  });
  
  const tab = get(`SELECT * FROM bar_tabs WHERE id = ?`, [tabId]);
  const discount = tab?.discount || 0;
  const taxRate = 0.18; // 18% default
  const taxable = subtotal - discount;
  const tax = taxable * taxRate;
  const tip = tab?.tip || 0;
  const total = taxable + tax + tip;
  
  run(`UPDATE bar_tabs SET subtotal = ?, tax = ?, total = ? WHERE id = ?`, 
    [Math.round(subtotal * 100) / 100, Math.round(tax * 100) / 100, Math.round(total * 100) / 100, tabId]);
}

// Apply discount
app.post('/tabs/:id/discount', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { amount, percent, reason } = req.body;
    
    const tab = get(`SELECT * FROM bar_tabs WHERE id = ?`, [id]);
    if (!tab) {
      return res.status(404).json({ success: false, error: 'Tab not found' });
    }
    
    let discount = amount || 0;
    if (percent) {
      discount = tab.subtotal * (percent / 100);
    }
    
    run(`UPDATE bar_tabs SET discount = ?, discount_reason = ? WHERE id = ?`, [discount, reason, id]);
    updateTabTotals(id);
    
    res.json({ success: true, message: 'Discount applied', discount });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Add tip
app.post('/tabs/:id/tip', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { amount, percent } = req.body;
    
    const tab = get(`SELECT * FROM bar_tabs WHERE id = ?`, [id]);
    if (!tab) {
      return res.status(404).json({ success: false, error: 'Tab not found' });
    }
    
    let tip = amount || 0;
    if (percent) {
      tip = tab.subtotal * (percent / 100);
    }
    
    run(`UPDATE bar_tabs SET tip = ? WHERE id = ?`, [Math.round(tip * 100) / 100, id]);
    updateTabTotals(id);
    
    res.json({ success: true, message: 'Tip added', tip });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Close tab
app.post('/tabs/:id/close', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { payment_method, charge_to_room } = req.body;
    
    const tab = get(`SELECT * FROM bar_tabs WHERE id = ? AND status = 'open'`, [id]);
    if (!tab) {
      return res.status(404).json({ success: false, error: 'Tab not found or already closed' });
    }
    
    run(`
      UPDATE bar_tabs SET 
        status = 'closed', 
        payment_method = ?, 
        payment_status = 'paid',
        closed_at = ?
      WHERE id = ?
    `, [charge_to_room ? 'room_charge' : (payment_method || 'cash'), timestamp(), id]);
    
    // If charge to room, add to guest folio
    if (charge_to_room && tab.room_number) {
      const reservation = get(`SELECT id FROM reservations WHERE room_id IN (SELECT id FROM rooms WHERE room_number = ?) AND status = 'checked_in'`, [tab.room_number]);
      if (reservation) {
        run(`
          INSERT INTO guest_folios (id, reservation_id, item_type, description, total_amount, department, posted_at)
          VALUES (?, ?, 'bar', 'Bar Tab #${tab.tab_number}', ?, 'Bar', ?)
        `, [generateId(), reservation.id, tab.total, timestamp()]);
      }
    }
    
    res.json({ success: true, message: 'Tab closed', tab_number: tab.tab_number, total: tab.total });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Transfer tab
app.post('/tabs/:id/transfer', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { to_room, to_table, to_tab_id } = req.body;
    
    if (to_tab_id) {
      // Transfer items to another tab
      run(`UPDATE tab_items SET tab_id = ? WHERE tab_id = ?`, [to_tab_id, id]);
      updateTabTotals(to_tab_id);
      run(`UPDATE bar_tabs SET status = 'transferred' WHERE id = ?`, [id]);
    } else if (to_room || to_table) {
      run(`UPDATE bar_tabs SET room_number = COALESCE(?, room_number), table_id = COALESCE(?, table_id) WHERE id = ?`, 
        [to_room, to_table, id]);
    }
    
    res.json({ success: true, message: 'Tab transferred' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Split tab
app.post('/tabs/:id/split', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { item_ids, new_tab_name } = req.body;
    
    // Create new tab
    const newTabId = generateId();
    const newTabNumber = `TAB${Date.now().toString(36).toUpperCase()}`;
    
    const originalTab = get(`SELECT * FROM bar_tabs WHERE id = ?`, [id]);
    
    run(`
      INSERT INTO bar_tabs (id, tab_number, guest_name, bartender_id, opened_at)
      VALUES (?, ?, ?, ?, ?)
    `, [newTabId, newTabNumber, new_tab_name || 'Split Tab', originalTab?.bartender_id, timestamp()]);
    
    // Move items
    for (const itemId of item_ids || []) {
      run(`UPDATE tab_items SET tab_id = ? WHERE id = ?`, [newTabId, itemId]);
    }
    
    // Update totals for both tabs
    updateTabTotals(id);
    updateTabTotals(newTabId);
    
    res.json({ success: true, new_tab: { id: newTabId, tab_number: newTabNumber } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// BEVERAGES MENU
// ============================================

app.get('/beverages', async (req, res) => {
  try {
    await ensureTables();
    const { category, in_stock } = req.query;
    
    let sql = `SELECT * FROM beverages WHERE active = 1`;
    const params = [];
    
    if (category) {
      sql += ` AND category = ?`;
      params.push(category);
    }
    if (in_stock === 'true') {
      sql += ` AND in_stock = 1`;
    }
    
    sql += ` ORDER BY category, name`;
    
    const beverages = query(sql, params);
    
    // Check for active happy hour
    const now = new Date();
    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const currentTime = now.toTimeString().slice(0, 5);
    
    const happyHour = get(`
      SELECT * FROM happy_hours 
      WHERE active = 1 AND day_of_week LIKE ? AND start_time <= ? AND end_time >= ?
    `, [`%${dayOfWeek}%`, currentTime, currentTime]);
    
    res.json({ success: true, beverages, happy_hour_active: !!happyHour, happy_hour: happyHour });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/beverages', async (req, res) => {
  try {
    await ensureTables();
    const { name, category, subcategory, description, price, happy_hour_price, cost, abv, size, pour_size } = req.body;
    
    const id = generateId();
    run(`
      INSERT INTO beverages (id, name, category, subcategory, description, price, happy_hour_price, cost, abv, size, pour_size, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, name, category || 'beer', subcategory, description, price || 0, happy_hour_price, cost || 0, abv, size, pour_size, timestamp()]);
    
    res.json({ success: true, beverage: { id, name, category, price } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// HAPPY HOURS
// ============================================

app.get('/happy-hours', async (req, res) => {
  try {
    await ensureTables();
    const happyHours = query(`SELECT * FROM happy_hours WHERE active = 1 ORDER BY day_of_week`);
    res.json({ success: true, happy_hours: happyHours });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/happy-hours', async (req, res) => {
  try {
    await ensureTables();
    const { name, day_of_week, start_time, end_time, discount_percent, categories } = req.body;
    
    const id = generateId();
    run(`
      INSERT INTO happy_hours (id, name, day_of_week, start_time, end_time, discount_percent, categories, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, name, day_of_week, start_time, end_time, discount_percent || 0, categories, timestamp()]);
    
    res.json({ success: true, happy_hour: { id, name, day_of_week, start_time, end_time, discount_percent } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// STATS
// ============================================

app.get('/stats', async (req, res) => {
  try {
    await ensureTables();
    
    const openTabs = get(`SELECT COUNT(*) as count, SUM(total) as total FROM bar_tabs WHERE status = 'open'`);
    const todaySales = get(`
      SELECT COUNT(*) as count, SUM(total) as total 
      FROM bar_tabs 
      WHERE status = 'closed' AND DATE(closed_at) = DATE('now')
    `);
    const topSeller = get(`
      SELECT item_name, SUM(quantity) as total_qty
      FROM tab_items 
      WHERE voided = 0 AND DATE(created_at) = DATE('now')
      GROUP BY item_name
      ORDER BY total_qty DESC
      LIMIT 1
    `);
    
    res.json({
      success: true,
      stats: {
        open_tabs: openTabs?.count || 0,
        open_tabs_total: openTabs?.total || 0,
        today_closed: todaySales?.count || 0,
        today_sales: todaySales?.total || 0,
        top_seller: topSeller?.item_name || 'N/A',
        top_seller_qty: topSeller?.total_qty || 0
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// STARTUP
// ============================================

async function start() {
  await ensureTables();
  
  app.get('*', (req, res) => {
    if (fs.existsSync(path.join(uiPath, 'index.html'))) {
      res.sendFile(path.join(uiPath, 'index.html'));
    } else {
      res.json({ service: SERVICE_NAME, mode: 'lite', status: 'running' });
    }
  });
  
  app.listen(PORT, () => {
    console.log(`✅ ${SERVICE_NAME} (Lite) running on port ${PORT}`);
  });
}

start();
