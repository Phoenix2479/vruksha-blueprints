/**
 * Room Service & Dining - Niyam Hospitality (Max Lite)
 * In-room dining orders, minibar, special menus
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');
const { notifyAccounting } = require('../shared/accounting-hook');

const app = express();
const PORT = process.env.PORT || 8966;
const SERVICE_NAME = 'room_service_dining';

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME, mode: 'lite' }));

// ============================================
// ROOM SERVICE MENU
// ============================================

app.get('/api/menu', (req, res) => {
  try {
    const { category_id, available_now } = req.query;
    let sql = `
      SELECT m.*, c.name as category_name
      FROM menu_items m
      LEFT JOIN menu_categories c ON m.category_id = c.id
      WHERE m.active = 1
    `;
    const params = [];
    
    if (category_id) { sql += ` AND m.category_id = ?`; params.push(category_id); }
    
    // TODO: Add time-based availability filtering
    
    sql += ` ORDER BY c.display_order, m.name ASC`;
    
    const items = query(sql, params);
    res.json({ success: true, menu_items: items });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/menu/categories', (req, res) => {
  try {
    const categories = query(`
      SELECT * FROM menu_categories WHERE active = 1 ORDER BY display_order ASC
    `);
    res.json({ success: true, categories });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// ROOM SERVICE ORDERS
// ============================================

app.get('/api/orders', (req, res) => {
  try {
    const { status, room_number, date } = req.query;
    let sql = `
      SELECT o.*, g.first_name, g.last_name, rm.room_number
      FROM restaurant_orders o
      LEFT JOIN guests g ON o.guest_id = g.id
      LEFT JOIN rooms rm ON o.room_number = rm.room_number OR o.table_id = rm.id
      WHERE o.order_type = 'room_service'
    `;
    const params = [];
    
    if (status) { sql += ` AND o.status = ?`; params.push(status); }
    if (room_number) { sql += ` AND o.room_number = ?`; params.push(room_number); }
    if (date) { sql += ` AND DATE(o.created_at) = ?`; params.push(date); }
    
    sql += ` ORDER BY o.created_at DESC`;
    
    const orders = query(sql, params);
    res.json({ success: true, orders });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/orders/:id', (req, res) => {
  try {
    const order = get(`
      SELECT o.*, g.first_name, g.last_name, g.phone, r.confirmation_number
      FROM restaurant_orders o
      LEFT JOIN guests g ON o.guest_id = g.id
      LEFT JOIN reservations r ON o.reservation_id = r.id
      WHERE o.id = ?
    `, [req.params.id]);
    
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    order.items = JSON.parse(order.items || '[]');
    
    res.json({ success: true, order });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/orders', (req, res) => {
  try {
    const { reservation_id, guest_id, room_number, items, notes, delivery_time } = req.body;
    const id = generateId();
    
    // Calculate totals
    let subtotal = 0;
    const parsedItems = (items || []).map(item => {
      const itemTotal = (item.price || 0) * (item.quantity || 1);
      subtotal += itemTotal;
      return { ...item, total: itemTotal };
    });
    
    const tax = subtotal * 0.05;
    const service_charge = subtotal * 0.10;
    const delivery_charge = 50; // Fixed delivery charge
    const total = subtotal + tax + service_charge + delivery_charge;
    
    run(`
      INSERT INTO restaurant_orders (
        id, reservation_id, guest_id, room_number, order_type, items,
        subtotal, tax, service_charge, total, status, notes, created_at
      ) VALUES (?, ?, ?, ?, 'room_service', ?, ?, ?, ?, ?, 'pending', ?, ?)
    `, [id, reservation_id, guest_id, room_number, JSON.stringify(parsedItems), subtotal, tax, service_charge + delivery_charge, total, notes, timestamp()]);
    
    // Create kitchen orders
    for (const item of parsedItems) {
      run(`
        INSERT INTO kitchen_orders (id, order_id, item_id, item_name, quantity, modifiers, station, notes, priority, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'normal', ?)
      `, [generateId(), id, item.id, item.name, item.quantity || 1, JSON.stringify(item.modifiers || []), 'main', item.notes, timestamp()]);
    }
    
    notifyAccounting('hospitality', 'hospitality.room_service.charge', { order_id: id, reservation_id, guest_id, room_number, total_amount: total, tax, items: parsedItems });
    res.json({ success: true, order: { id, total, estimated_delivery: delivery_time || '30-45 mins' } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/api/orders/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    run(`UPDATE restaurant_orders SET status = ? WHERE id = ?`, [status, req.params.id]);
    
    // If delivered, post to guest folio
    if (status === 'delivered') {
      const order = get(`SELECT * FROM restaurant_orders WHERE id = ?`, [req.params.id]);
      if (order?.reservation_id) {
        run(`
          INSERT INTO guest_folios (id, reservation_id, guest_id, item_type, description, total_amount, department, posted_at)
          VALUES (?, ?, ?, 'fnb', 'Room Service', ?, 'room_service', ?)
        `, [generateId(), order.reservation_id, order.guest_id, order.total, timestamp()]);
        
        run(`UPDATE reservations SET balance_due = balance_due + ?, updated_at = ? WHERE id = ?`,
          [order.total, timestamp(), order.reservation_id]);
      }
    }
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// MINIBAR
// ============================================

const ensureMinibarTables = () => {
  try {
    run(`
      CREATE TABLE IF NOT EXISTS minibar_items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT,
        price REAL DEFAULT 0,
        cost REAL DEFAULT 0,
        par_level INTEGER DEFAULT 2,
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    run(`
      CREATE TABLE IF NOT EXISTS minibar_consumption (
        id TEXT PRIMARY KEY,
        reservation_id TEXT,
        room_id TEXT,
        item_id TEXT,
        item_name TEXT,
        quantity INTEGER DEFAULT 1,
        unit_price REAL,
        total_amount REAL,
        consumed_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (e) {}
};

app.get('/api/minibar/items', (req, res) => {
  try {
    ensureMinibarTables();
    const items = query(`SELECT * FROM minibar_items WHERE active = 1 ORDER BY category, name`);
    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/minibar/items', (req, res) => {
  try {
    ensureMinibarTables();
    const { name, category, price, cost, par_level } = req.body;
    const id = generateId();
    
    run(`INSERT INTO minibar_items (id, name, category, price, cost, par_level, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, name, category, price || 0, cost || 0, par_level || 2, timestamp()]);
    
    res.json({ success: true, item: { id } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/minibar/consumption/:room_id', (req, res) => {
  try {
    ensureMinibarTables();
    const consumption = query(`
      SELECT * FROM minibar_consumption WHERE room_id = ? ORDER BY consumed_at DESC
    `, [req.params.room_id]);
    
    const total = get(`SELECT SUM(total_amount) as total FROM minibar_consumption WHERE room_id = ?`, [req.params.room_id]);
    
    res.json({ success: true, consumption, total: total?.total || 0 });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/minibar/consumption', (req, res) => {
  try {
    ensureMinibarTables();
    const { reservation_id, room_id, items } = req.body;
    
    let totalAmount = 0;
    for (const item of items) {
      const id = generateId();
      const minibarItem = get(`SELECT * FROM minibar_items WHERE id = ?`, [item.item_id]);
      const unitPrice = minibarItem?.price || item.unit_price || 0;
      const itemTotal = unitPrice * (item.quantity || 1);
      totalAmount += itemTotal;
      
      run(`
        INSERT INTO minibar_consumption (id, reservation_id, room_id, item_id, item_name, quantity, unit_price, total_amount, consumed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [id, reservation_id, room_id, item.item_id, minibarItem?.name || item.name, item.quantity || 1, unitPrice, itemTotal, timestamp()]);
    }
    
    // Post to guest folio
    if (reservation_id && totalAmount > 0) {
      const reservation = get(`SELECT guest_id FROM reservations WHERE id = ?`, [reservation_id]);
      run(`
        INSERT INTO guest_folios (id, reservation_id, guest_id, item_type, description, total_amount, department, posted_at)
        VALUES (?, ?, ?, 'minibar', 'Minibar Charges', ?, 'minibar', ?)
      `, [generateId(), reservation_id, reservation?.guest_id, totalAmount, timestamp()]);
      
      run(`UPDATE reservations SET balance_due = balance_due + ?, updated_at = ? WHERE id = ?`,
        [totalAmount, timestamp(), reservation_id]);
    }
    
    res.json({ success: true, total: totalAmount });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// DASHBOARD
// ============================================

app.get('/api/dashboard/stats', (req, res) => {
  try {
    const pendingOrders = get(`SELECT COUNT(*) as count FROM restaurant_orders WHERE order_type = 'room_service' AND status = 'pending'`);
    const preparingOrders = get(`SELECT COUNT(*) as count FROM restaurant_orders WHERE order_type = 'room_service' AND status = 'preparing'`);
    const todayRevenue = get(`
      SELECT SUM(total) as total FROM restaurant_orders 
      WHERE order_type = 'room_service' AND DATE(created_at) = DATE('now') AND status IN ('delivered', 'paid')
    `);
    const todayOrders = get(`SELECT COUNT(*) as count FROM restaurant_orders WHERE order_type = 'room_service' AND DATE(created_at) = DATE('now')`);
    
    res.json({
      success: true,
      stats: {
        pending_orders: pendingOrders?.count || 0,
        preparing_orders: preparingOrders?.count || 0,
        today_revenue: todayRevenue?.total || 0,
        today_orders: todayOrders?.count || 0
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: SERVICE_NAME, status: 'running', mode: 'lite' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[${SERVICE_NAME}] Lite service on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
