/**
 * Kitchen Order Display (KDS) Service - Niyam Hospitality (Max Lite)
 * Real-time kitchen display for order management
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8916;
const SERVICE_NAME = 'kitchen_order_display';

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
// ADDITIONAL TABLES (run once on init)
// ============================================

async function ensureTables() {
  const db = await initDb();
  
  // KDS-specific tables
  db.run(`
    CREATE TABLE IF NOT EXISTS kds_stations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'kitchen',
      display_order INTEGER DEFAULT 0,
      color TEXT DEFAULT '#3b82f6',
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS kds_order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      item_id TEXT,
      item_name TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      station TEXT DEFAULT 'kitchen',
      modifiers TEXT,
      notes TEXT,
      status TEXT DEFAULT 'pending',
      priority TEXT DEFAULT 'normal',
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS kds_bump_log (
      id TEXT PRIMARY KEY,
      order_id TEXT,
      item_id TEXT,
      action TEXT NOT NULL,
      station TEXT,
      bumped_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  return db;
}

// ============================================
// KDS DISPLAY - ACTIVE ORDERS
// ============================================

app.get('/display', async (req, res) => {
  try {
    await ensureTables();
    const { station } = req.query;
    
    let sql = `
      SELECT 
        o.id, o.order_type, o.status, o.notes, o.created_at,
        t.table_number,
        json_group_array(
          json_object(
            'id', ki.id,
            'name', ki.item_name,
            'quantity', ki.quantity,
            'notes', ki.notes,
            'status', ki.status,
            'modifiers', ki.modifiers
          )
        ) as items
      FROM restaurant_orders o
      LEFT JOIN restaurant_tables t ON o.table_id = t.id
      LEFT JOIN kds_order_items ki ON o.id = ki.order_id
      WHERE o.status IN ('kitchen_ready', 'cooking')
    `;
    
    if (station) {
      sql += ` AND ki.station = '${station}'`;
    }
    
    sql += ` GROUP BY o.id ORDER BY 
             CASE WHEN o.status = 'cooking' THEN 0 ELSE 1 END,
             o.created_at ASC`;
    
    const orders = query(sql);
    
    // Calculate wait times and parse items
    const now = Date.now();
    const formatted = orders.map(order => {
      const createdAt = new Date(order.created_at).getTime();
      const waitMinutes = Math.floor((now - createdAt) / 60000);
      
      let items = [];
      try {
        items = JSON.parse(order.items || '[]').filter(i => i.id);
      } catch (e) {}
      
      return {
        id: order.id,
        order_type: order.order_type,
        table_number: order.table_number,
        status: order.status,
        notes: order.notes,
        items,
        wait_time_minutes: waitMinutes,
        is_overdue: waitMinutes > 20,
        priority: waitMinutes > 30 ? 'urgent' : waitMinutes > 20 ? 'high' : 'normal',
        source: order.table_number ? `Table ${order.table_number}` : order.order_type,
        created_at: order.created_at
      };
    });
    
    res.json({ success: true, orders: formatted });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// ORDER ACTIONS (BUMP BAR)
// ============================================

// Start cooking an order
app.post('/orders/:id/start', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    
    const order = get(`SELECT * FROM restaurant_orders WHERE id = ? AND status = 'kitchen_ready'`, [id]);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found or already started' });
    }
    
    run(`UPDATE restaurant_orders SET status = 'cooking', updated_at = ? WHERE id = ?`, [timestamp(), id]);
    run(`UPDATE kds_order_items SET status = 'cooking', started_at = ? WHERE order_id = ?`, [timestamp(), id]);
    
    // Log bump action
    run(`INSERT INTO kds_bump_log (id, order_id, action, created_at) VALUES (?, ?, 'start', ?)`,
      [generateId(), id, timestamp()]);
    
    res.json({ success: true, message: 'Order started', order_id: id });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Mark order as ready (bump)
app.post('/orders/:id/ready', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    
    const order = get(`SELECT * FROM restaurant_orders WHERE id = ? AND status = 'cooking'`, [id]);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found or not cooking' });
    }
    
    run(`UPDATE restaurant_orders SET status = 'ready', updated_at = ? WHERE id = ?`, [timestamp(), id]);
    run(`UPDATE kds_order_items SET status = 'ready', completed_at = ? WHERE order_id = ?`, [timestamp(), id]);
    
    // Log bump action
    run(`INSERT INTO kds_bump_log (id, order_id, action, created_at) VALUES (?, ?, 'ready', ?)`,
      [generateId(), id, timestamp()]);
    
    res.json({ success: true, message: 'Order ready for pickup', order_id: id });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Mark individual item as ready
app.post('/items/:id/ready', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    
    const item = get(`SELECT * FROM kds_order_items WHERE id = ?`, [id]);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    
    run(`UPDATE kds_order_items SET status = 'ready', completed_at = ? WHERE id = ?`, [timestamp(), id]);
    
    // Check if all items in order are ready
    const pendingCount = get(`SELECT COUNT(*) as count FROM kds_order_items WHERE order_id = ? AND status != 'ready'`, [item.order_id]);
    const allReady = pendingCount.count === 0;
    
    if (allReady) {
      run(`UPDATE restaurant_orders SET status = 'ready', updated_at = ? WHERE id = ?`, [timestamp(), item.order_id]);
    }
    
    res.json({ success: true, item_id: id, order_complete: allReady });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Recall an order (bring back to display)
app.post('/orders/:id/recall', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    
    run(`UPDATE restaurant_orders SET status = 'cooking', updated_at = ? WHERE id = ? AND status = 'ready'`, [timestamp(), id]);
    
    run(`INSERT INTO kds_bump_log (id, order_id, action, created_at) VALUES (?, ?, 'recall', ?)`,
      [generateId(), id, timestamp()]);
    
    res.json({ success: true, message: 'Order recalled', order_id: id });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// READY ORDERS (Expo View)
// ============================================

app.get('/ready', async (req, res) => {
  try {
    await ensureTables();
    
    const orders = query(`
      SELECT 
        o.id, o.order_type, o.updated_at,
        t.table_number,
        json_group_array(
          json_object('name', ki.item_name, 'quantity', ki.quantity)
        ) as items
      FROM restaurant_orders o
      LEFT JOIN restaurant_tables t ON o.table_id = t.id
      LEFT JOIN kds_order_items ki ON o.id = ki.order_id
      WHERE o.status = 'ready'
      GROUP BY o.id
      ORDER BY o.updated_at ASC
    `);
    
    const formatted = orders.map(o => ({
      ...o,
      items: JSON.parse(o.items || '[]').filter(i => i.name)
    }));
    
    res.json({ success: true, orders: formatted });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Mark as served (picked up)
app.post('/orders/:id/served', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    
    run(`UPDATE restaurant_orders SET status = 'served', updated_at = ? WHERE id = ? AND status = 'ready'`, [timestamp(), id]);
    run(`UPDATE kds_order_items SET status = 'served' WHERE order_id = ?`, [id]);
    
    run(`INSERT INTO kds_bump_log (id, order_id, action, created_at) VALUES (?, ?, 'served', ?)`,
      [generateId(), id, timestamp()]);
    
    res.json({ success: true, message: 'Order served', order_id: id });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// SEND ORDER TO KDS
// ============================================

app.post('/orders', async (req, res) => {
  try {
    await ensureTables();
    const { order_id, items } = req.body;
    
    // Update order status to kitchen_ready
    run(`UPDATE restaurant_orders SET status = 'kitchen_ready', updated_at = ? WHERE id = ?`, [timestamp(), order_id]);
    
    // Add items to KDS queue
    for (const item of items || []) {
      run(`
        INSERT INTO kds_order_items (id, order_id, item_id, item_name, quantity, station, modifiers, notes, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `, [generateId(), order_id, item.id, item.name, item.quantity || 1, item.station || 'kitchen', 
          JSON.stringify(item.modifiers || []), item.notes, timestamp()]);
    }
    
    res.json({ success: true, message: 'Order sent to KDS', order_id });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// STATIONS
// ============================================

app.get('/stations', async (req, res) => {
  try {
    await ensureTables();
    const stations = query(`SELECT * FROM kds_stations WHERE active = 1 ORDER BY display_order`);
    res.json({ success: true, stations });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/stations', async (req, res) => {
  try {
    await ensureTables();
    const { name, type, color } = req.body;
    const id = generateId();
    
    run(`INSERT INTO kds_stations (id, name, type, color, created_at) VALUES (?, ?, ?, ?, ?)`,
      [id, name, type || 'kitchen', color || '#3b82f6', timestamp()]);
    
    res.json({ success: true, station: { id, name, type, color } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// STATS & METRICS
// ============================================

app.get('/stats', async (req, res) => {
  try {
    await ensureTables();
    
    const queueStats = query(`
      SELECT status, COUNT(*) as count
      FROM restaurant_orders
      WHERE status IN ('kitchen_ready', 'cooking', 'ready')
      GROUP BY status
    `);
    
    const statusCounts = { kitchen_ready: 0, cooking: 0, ready: 0 };
    queueStats.forEach(r => { statusCounts[r.status] = r.count; });
    
    // Average prep time (last 4 hours)
    const avgTime = get(`
      SELECT AVG(
        (julianday(completed_at) - julianday(created_at)) * 24 * 60
      ) as avg_minutes
      FROM kds_order_items
      WHERE completed_at IS NOT NULL
        AND created_at > datetime('now', '-4 hours')
    `);
    
    // Served last hour
    const servedLastHour = get(`
      SELECT COUNT(*) as count FROM restaurant_orders 
      WHERE status = 'served' AND updated_at > datetime('now', '-1 hour')
    `);
    
    res.json({
      success: true,
      stats: {
        in_queue: statusCounts.kitchen_ready,
        cooking: statusCounts.cooking,
        ready_for_pickup: statusCounts.ready,
        total_active: statusCounts.kitchen_ready + statusCounts.cooking + statusCounts.ready,
        avg_prep_time_minutes: Math.round(avgTime?.avg_minutes || 0),
        served_last_hour: servedLastHour?.count || 0
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// BUMP LOG HISTORY
// ============================================

app.get('/history', async (req, res) => {
  try {
    await ensureTables();
    const { limit = 50 } = req.query;
    
    const history = query(`
      SELECT bl.*, o.order_type, t.table_number
      FROM kds_bump_log bl
      LEFT JOIN restaurant_orders o ON bl.order_id = o.id
      LEFT JOIN restaurant_tables t ON o.table_id = t.id
      ORDER BY bl.created_at DESC
      LIMIT ?
    `, [parseInt(limit)]);
    
    res.json({ success: true, history });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// STARTUP
// ============================================

async function start() {
  await ensureTables();
  
  // SPA fallback
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
