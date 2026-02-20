/**
 * Kitchen Operations Service - Niyam Hospitality (Max Lite)
 * KDS, prep lists, order tracking, waste logging
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8913;
const SERVICE_NAME = 'kitchen_operations';

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
// KITCHEN DISPLAY (KDS)
// ============================================

app.get('/api/kds/orders', (req, res) => {
  try {
    const { station, status } = req.query;
    let sql = `
      SELECT k.*, o.table_id, o.order_type, o.room_number, o.notes as order_notes,
        t.table_number
      FROM kitchen_orders k
      JOIN restaurant_orders o ON k.order_id = o.id
      LEFT JOIN restaurant_tables t ON o.table_id = t.id
      WHERE o.status NOT IN ('closed', 'cancelled', 'paid')
    `;
    const params = [];
    
    if (station) {
      sql += ` AND k.station = ?`;
      params.push(station);
    }
    if (status) {
      sql += ` AND k.status = ?`;
      params.push(status);
    } else {
      sql += ` AND k.status NOT IN ('served', 'cancelled')`;
    }
    
    sql += ` ORDER BY k.priority DESC, k.created_at ASC`;
    
    const orders = query(sql, params);
    
    // Parse modifiers
    const formatted = orders.map(o => ({
      ...o,
      modifiers: JSON.parse(o.modifiers || '[]')
    }));
    
    res.json({ success: true, orders: formatted });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/api/kds/orders/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    const now = timestamp();
    
    let sql = `UPDATE kitchen_orders SET status = ?`;
    const params = [status];
    
    if (status === 'preparing') {
      sql += `, started_at = ?`;
      params.push(now);
    } else if (status === 'ready') {
      sql += `, completed_at = ?`;
      params.push(now);
    }
    
    sql += ` WHERE id = ?`;
    params.push(req.params.id);
    
    run(sql, params);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/api/kds/orders/:id/bump', (req, res) => {
  try {
    run(`UPDATE kitchen_orders SET status = 'ready', completed_at = ? WHERE id = ?`, [timestamp(), req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/kds/orders/:id/recall', (req, res) => {
  try {
    run(`UPDATE kitchen_orders SET status = 'preparing', completed_at = NULL WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/api/kds/orders/:id/priority', (req, res) => {
  try {
    const { priority } = req.body;
    run(`UPDATE kitchen_orders SET priority = ? WHERE id = ?`, [priority, req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Bump all items for an order
app.post('/api/kds/orders/bump-order/:order_id', (req, res) => {
  try {
    run(`UPDATE kitchen_orders SET status = 'ready', completed_at = ? WHERE order_id = ? AND status != 'served'`, 
      [timestamp(), req.params.order_id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// STATIONS
// ============================================

app.get('/api/stations', (req, res) => {
  try {
    // Get unique stations from menu items and settings
    const fromMenu = query(`SELECT DISTINCT station FROM kitchen_orders WHERE station IS NOT NULL`);
    const stations = [...new Set(fromMenu.map(s => s.station))];
    
    // Default stations if none exist
    const defaultStations = ['grill', 'fry', 'cold', 'pastry', 'main'];
    const allStations = [...new Set([...stations, ...defaultStations])];
    
    res.json({ success: true, stations: allStations });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/stations/:station/queue', (req, res) => {
  try {
    const orders = query(`
      SELECT k.*, o.table_id, t.table_number, o.order_type
      FROM kitchen_orders k
      JOIN restaurant_orders o ON k.order_id = o.id
      LEFT JOIN restaurant_tables t ON o.table_id = t.id
      WHERE k.station = ? AND k.status NOT IN ('ready', 'served', 'cancelled')
      ORDER BY k.priority DESC, k.created_at ASC
    `, [req.params.station]);
    
    res.json({ success: true, orders });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// PREP LISTS
// ============================================

app.get('/api/prep-lists', (req, res) => {
  try {
    const { date, station } = req.query;
    const prepDate = date || new Date().toISOString().split('T')[0];
    
    // Get expected orders for the day (from reservations with meal plans)
    const expectedCovers = get(`
      SELECT SUM(adults + children) as total
      FROM reservations
      WHERE DATE(check_in_date) <= ? AND DATE(check_out_date) > ?
      AND status IN ('confirmed', 'checked_in')
    `, [prepDate, prepDate]);
    
    // Get menu items that need prep
    let sql = `
      SELECT m.*, c.name as category_name
      FROM menu_items m
      LEFT JOIN menu_categories c ON m.category_id = c.id
      WHERE m.active = 1 AND m.preparation_time > 30
    `;
    const params = [];
    
    if (station) {
      // Assuming we add a station field to menu_items
      sql += ` ORDER BY c.display_order, m.name`;
    } else {
      sql += ` ORDER BY c.display_order, m.name`;
    }
    
    const items = query(sql, params);
    
    // Calculate suggested prep quantities based on historical data
    const prepList = items.map(item => ({
      ...item,
      suggested_qty: Math.ceil((expectedCovers?.total || 20) * 0.3), // 30% of covers as rough estimate
      notes: ''
    }));
    
    res.json({ 
      success: true, 
      date: prepDate,
      expected_covers: expectedCovers?.total || 0,
      prep_items: prepList 
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// WASTE LOG
// ============================================

// Add waste log table to db if needed
const ensureWasteTable = () => {
  try {
    run(`
      CREATE TABLE IF NOT EXISTS kitchen_waste_log (
        id TEXT PRIMARY KEY,
        item_name TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit TEXT DEFAULT 'portion',
        reason TEXT,
        cost_estimate REAL DEFAULT 0,
        logged_by TEXT,
        station TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (e) {
    // Table might already exist
  }
};

app.get('/api/waste', (req, res) => {
  try {
    ensureWasteTable();
    const { from_date, to_date, reason, station } = req.query;
    
    let sql = `SELECT * FROM kitchen_waste_log WHERE 1=1`;
    const params = [];
    
    if (from_date) {
      sql += ` AND DATE(created_at) >= ?`;
      params.push(from_date);
    }
    if (to_date) {
      sql += ` AND DATE(created_at) <= ?`;
      params.push(to_date);
    }
    if (reason) {
      sql += ` AND reason = ?`;
      params.push(reason);
    }
    if (station) {
      sql += ` AND station = ?`;
      params.push(station);
    }
    
    sql += ` ORDER BY created_at DESC`;
    
    const logs = query(sql, params);
    
    // Summary
    const summary = get(`
      SELECT 
        COUNT(*) as total_entries,
        SUM(cost_estimate) as total_cost,
        SUM(quantity) as total_quantity
      FROM kitchen_waste_log
      WHERE DATE(created_at) >= COALESCE(?, DATE('now', '-7 days'))
    `, [from_date]);
    
    res.json({ success: true, waste_logs: logs, summary });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/waste', (req, res) => {
  try {
    ensureWasteTable();
    const { item_name, quantity, unit, reason, cost_estimate, logged_by, station } = req.body;
    const id = generateId();
    
    run(`
      INSERT INTO kitchen_waste_log (id, item_name, quantity, unit, reason, cost_estimate, logged_by, station, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, item_name, quantity, unit || 'portion', reason, cost_estimate || 0, logged_by, station, timestamp()]);
    
    res.json({ success: true, log: { id } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// ORDER TIMING & ANALYTICS
// ============================================

app.get('/api/analytics/timing', (req, res) => {
  try {
    const { from_date, to_date, station } = req.query;
    const fromDate = from_date || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = to_date || new Date().toISOString().split('T')[0];
    
    let sql = `
      SELECT 
        station,
        AVG(CASE WHEN started_at IS NOT NULL THEN 
          (julianday(started_at) - julianday(created_at)) * 24 * 60 
        END) as avg_queue_time_min,
        AVG(CASE WHEN completed_at IS NOT NULL AND started_at IS NOT NULL THEN 
          (julianday(completed_at) - julianday(started_at)) * 24 * 60 
        END) as avg_cook_time_min,
        COUNT(*) as total_orders,
        SUM(CASE WHEN status = 'ready' OR status = 'served' THEN 1 ELSE 0 END) as completed_orders
      FROM kitchen_orders
      WHERE DATE(created_at) BETWEEN ? AND ?
    `;
    const params = [fromDate, toDate];
    
    if (station) {
      sql += ` AND station = ?`;
      params.push(station);
    }
    
    sql += ` GROUP BY station`;
    
    const timing = query(sql, params);
    
    res.json({ 
      success: true, 
      from_date: fromDate,
      to_date: toDate,
      timing_stats: timing 
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// DASHBOARD STATS
// ============================================

app.get('/api/dashboard/stats', (req, res) => {
  try {
    const pendingOrders = get(`SELECT COUNT(*) as count FROM kitchen_orders WHERE status = 'pending'`);
    const preparingOrders = get(`SELECT COUNT(*) as count FROM kitchen_orders WHERE status = 'preparing'`);
    const readyOrders = get(`SELECT COUNT(*) as count FROM kitchen_orders WHERE status = 'ready'`);
    const avgWaitTime = get(`
      SELECT AVG((julianday(started_at) - julianday(created_at)) * 24 * 60) as avg_min
      FROM kitchen_orders
      WHERE started_at IS NOT NULL AND DATE(created_at) = DATE('now')
    `);
    const avgCookTime = get(`
      SELECT AVG((julianday(completed_at) - julianday(started_at)) * 24 * 60) as avg_min
      FROM kitchen_orders
      WHERE completed_at IS NOT NULL AND DATE(created_at) = DATE('now')
    `);
    const todayCompleted = get(`
      SELECT COUNT(*) as count FROM kitchen_orders
      WHERE status IN ('ready', 'served') AND DATE(created_at) = DATE('now')
    `);
    
    res.json({
      success: true,
      stats: {
        pending_orders: pendingOrders?.count || 0,
        preparing_orders: preparingOrders?.count || 0,
        ready_orders: readyOrders?.count || 0,
        avg_wait_time: Math.round(avgWaitTime?.avg_min || 0),
        avg_cook_time: Math.round(avgCookTime?.avg_min || 0),
        today_completed: todayCompleted?.count || 0
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({ service: SERVICE_NAME, status: 'running', mode: 'lite' });
  }
});

// Start server
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[${SERVICE_NAME}] Lite service running on http://localhost:${PORT}`);
    });
  })
  .catch(e => {
    console.error(`[${SERVICE_NAME}] Failed to start:`, e);
    process.exit(1);
  });
