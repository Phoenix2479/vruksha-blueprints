/**
 * Restaurant POS Service - Niyam Hospitality (Max Lite)
 * Handles Menu, Tables, Orders, and Kitchen display
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');
const { notifyAccounting } = require('../shared/accounting-hook');

const app = express();
const PORT = process.env.PORT || 8918;
const SERVICE_NAME = 'restaurant_pos';

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
// MENU CATEGORIES
// ============================================

app.get('/api/categories', (req, res) => {
  try {
    const categories = query(`
      SELECT * FROM menu_categories WHERE active = 1 ORDER BY display_order ASC, name ASC
    `);
    res.json({ success: true, categories });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/categories', (req, res) => {
  try {
    const { name, description, display_order } = req.body;
    const id = generateId();
    
    run(`
      INSERT INTO menu_categories (id, name, description, display_order, created_at)
      VALUES (?, ?, ?, ?, ?)
    `, [id, name, description, display_order || 0, timestamp()]);
    
    res.json({ success: true, category: { id, name } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/api/categories/:id', (req, res) => {
  try {
    const { name, description, display_order, active } = req.body;
    
    run(`
      UPDATE menu_categories SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        display_order = COALESCE(?, display_order),
        active = COALESCE(?, active)
      WHERE id = ?
    `, [name, description, display_order, active, req.params.id]);
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// MENU ITEMS
// ============================================

app.get('/api/menu', (req, res) => {
  try {
    const { category_id, search, active_only } = req.query;
    let sql = `
      SELECT m.*, c.name as category_name
      FROM menu_items m
      LEFT JOIN menu_categories c ON m.category_id = c.id
      WHERE 1=1
    `;
    const params = [];
    
    if (active_only !== 'false') {
      sql += ` AND m.active = 1`;
    }
    if (category_id) {
      sql += ` AND m.category_id = ?`;
      params.push(category_id);
    }
    if (search) {
      sql += ` AND (m.name LIKE ? OR m.description LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    
    sql += ` ORDER BY c.display_order, m.name ASC`;
    
    const items = query(sql, params);
    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/menu/:id', (req, res) => {
  try {
    const item = get(`
      SELECT m.*, c.name as category_name
      FROM menu_items m
      LEFT JOIN menu_categories c ON m.category_id = c.id
      WHERE m.id = ?
    `, [req.params.id]);
    
    if (!item) {
      return res.status(404).json({ success: false, error: 'Menu item not found' });
    }
    
    res.json({ success: true, item });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/menu', (req, res) => {
  try {
    const { 
      name, description, category_id, price, cost, tax_rate,
      preparation_time, allergens, dietary_flags, image_url 
    } = req.body;
    
    const id = generateId();
    
    run(`
      INSERT INTO menu_items (
        id, name, description, category_id, price, cost, tax_rate,
        preparation_time, allergens, dietary_flags, image_url, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, name, description, category_id, price || 0, cost || 0, tax_rate || 0,
      preparation_time || 15, JSON.stringify(allergens || []), 
      JSON.stringify(dietary_flags || []), image_url, timestamp()
    ]);
    
    res.json({ success: true, item: { id, name } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/api/menu/:id', (req, res) => {
  try {
    const { 
      name, description, category_id, price, cost, tax_rate,
      preparation_time, allergens, dietary_flags, image_url, active 
    } = req.body;
    
    run(`
      UPDATE menu_items SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        category_id = COALESCE(?, category_id),
        price = COALESCE(?, price),
        cost = COALESCE(?, cost),
        tax_rate = COALESCE(?, tax_rate),
        preparation_time = COALESCE(?, preparation_time),
        allergens = COALESCE(?, allergens),
        dietary_flags = COALESCE(?, dietary_flags),
        image_url = COALESCE(?, image_url),
        active = COALESCE(?, active),
        updated_at = ?
      WHERE id = ?
    `, [
      name, description, category_id, price, cost, tax_rate,
      preparation_time, 
      allergens ? JSON.stringify(allergens) : null,
      dietary_flags ? JSON.stringify(dietary_flags) : null,
      image_url, active, timestamp(), req.params.id
    ]);
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.delete('/api/menu/:id', (req, res) => {
  try {
    run(`UPDATE menu_items SET active = 0, updated_at = ? WHERE id = ?`, [timestamp(), req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// TABLES
// ============================================

app.get('/api/tables', (req, res) => {
  try {
    const { status, location } = req.query;
    let sql = `SELECT * FROM restaurant_tables WHERE 1=1`;
    const params = [];
    
    if (status) {
      sql += ` AND status = ?`;
      params.push(status);
    }
    if (location) {
      sql += ` AND location = ?`;
      params.push(location);
    }
    
    sql += ` ORDER BY table_number ASC`;
    
    const tables = query(sql, params);
    res.json({ success: true, tables });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/tables', (req, res) => {
  try {
    const { table_number, capacity, location } = req.body;
    const id = generateId();
    
    run(`
      INSERT INTO restaurant_tables (id, table_number, capacity, location, created_at)
      VALUES (?, ?, ?, ?, ?)
    `, [id, table_number, capacity || 4, location, timestamp()]);
    
    res.json({ success: true, table: { id, table_number } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/api/tables/:id', (req, res) => {
  try {
    const { table_number, capacity, location, status } = req.body;
    
    run(`
      UPDATE restaurant_tables SET
        table_number = COALESCE(?, table_number),
        capacity = COALESCE(?, capacity),
        location = COALESCE(?, location),
        status = COALESCE(?, status)
      WHERE id = ?
    `, [table_number, capacity, location, status, req.params.id]);
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/api/tables/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    run(`UPDATE restaurant_tables SET status = ? WHERE id = ?`, [status, req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// ORDERS
// ============================================

app.get('/api/orders', (req, res) => {
  try {
    const { status, table_id, date } = req.query;
    let sql = `
      SELECT o.*, t.table_number, g.first_name, g.last_name
      FROM restaurant_orders o
      LEFT JOIN restaurant_tables t ON o.table_id = t.id
      LEFT JOIN guests g ON o.guest_id = g.id
      WHERE 1=1
    `;
    const params = [];
    
    if (status) {
      sql += ` AND o.status = ?`;
      params.push(status);
    }
    if (table_id) {
      sql += ` AND o.table_id = ?`;
      params.push(table_id);
    }
    if (date) {
      sql += ` AND DATE(o.created_at) = ?`;
      params.push(date);
    }
    
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
      SELECT o.*, t.table_number, g.first_name, g.last_name
      FROM restaurant_orders o
      LEFT JOIN restaurant_tables t ON o.table_id = t.id
      LEFT JOIN guests g ON o.guest_id = g.id
      WHERE o.id = ?
    `, [req.params.id]);
    
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    
    // Parse items JSON
    order.items = JSON.parse(order.items || '[]');
    
    res.json({ success: true, order });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/orders', (req, res) => {
  try {
    const { 
      table_id, guest_id, reservation_id, room_number,
      order_type, items, notes, server_id 
    } = req.body;
    
    const id = generateId();
    
    // Calculate totals
    let subtotal = 0;
    const parsedItems = (items || []).map(item => {
      const itemTotal = (item.price || 0) * (item.quantity || 1);
      subtotal += itemTotal;
      return { ...item, total: itemTotal };
    });
    
    const tax = subtotal * 0.05; // 5% default tax
    const service_charge = order_type === 'dine_in' ? subtotal * 0.10 : 0; // 10% service charge for dine-in
    const total = subtotal + tax + service_charge;
    
    run(`
      INSERT INTO restaurant_orders (
        id, table_id, guest_id, reservation_id, room_number,
        order_type, items, subtotal, tax, service_charge, total,
        status, server_id, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
    `, [
      id, table_id, guest_id, reservation_id, room_number,
      order_type || 'dine_in', JSON.stringify(parsedItems), 
      subtotal, tax, service_charge, total,
      server_id, notes, timestamp()
    ]);
    
    // Update table status
    if (table_id) {
      run(`UPDATE restaurant_tables SET status = 'occupied', current_order_id = ? WHERE id = ?`, [id, table_id]);
    }
    
    // Create kitchen orders
    for (const item of parsedItems) {
      run(`
        INSERT INTO kitchen_orders (id, order_id, item_id, item_name, quantity, modifiers, station, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [generateId(), id, item.id, item.name, item.quantity || 1, JSON.stringify(item.modifiers || []), item.station || 'main', item.notes, timestamp()]);
    }
    
    res.json({ success: true, order: { id, total } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/api/orders/:id/items', (req, res) => {
  try {
    const { items } = req.body;
    
    // Get existing order
    const order = get(`SELECT * FROM restaurant_orders WHERE id = ?`, [req.params.id]);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    
    // Calculate new totals
    let subtotal = 0;
    const parsedItems = (items || []).map(item => {
      const itemTotal = (item.price || 0) * (item.quantity || 1);
      subtotal += itemTotal;
      return { ...item, total: itemTotal };
    });
    
    const tax = subtotal * 0.05;
    const service_charge = order.order_type === 'dine_in' ? subtotal * 0.10 : 0;
    const total = subtotal + tax + service_charge;
    
    run(`
      UPDATE restaurant_orders SET
        items = ?, subtotal = ?, tax = ?, service_charge = ?, total = ?
      WHERE id = ?
    `, [JSON.stringify(parsedItems), subtotal, tax, service_charge, total, req.params.id]);
    
    res.json({ success: true, total });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/api/orders/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    
    run(`UPDATE restaurant_orders SET status = ? WHERE id = ?`, [status, req.params.id]);
    
    // If closing order, update table
    if (status === 'closed' || status === 'paid') {
      const order = get(`SELECT table_id FROM restaurant_orders WHERE id = ?`, [req.params.id]);
      if (order?.table_id) {
        run(`UPDATE restaurant_tables SET status = 'available', current_order_id = NULL WHERE id = ?`, [order.table_id]);
      }
    }
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/orders/:id/payment', (req, res) => {
  try {
    const { payment_method, amount, tip } = req.body;
    
    const order = get(`SELECT * FROM restaurant_orders WHERE id = ?`, [req.params.id]);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    
    const finalTotal = (amount || order.total) + (tip || 0);
    
    run(`
      UPDATE restaurant_orders SET
        payment_method = ?,
        payment_status = 'paid',
        status = 'closed',
        total = ?,
        closed_at = ?
      WHERE id = ?
    `, [payment_method, finalTotal, timestamp(), req.params.id]);
    
    // Free up table
    if (order.table_id) {
      run(`UPDATE restaurant_tables SET status = 'dirty', current_order_id = NULL WHERE id = ?`, [order.table_id]);
    }
    
    // Post to guest folio if room charge
    if (payment_method === 'room_charge' && order.reservation_id) {
      run(`
        INSERT INTO guest_folios (id, reservation_id, guest_id, item_type, description, total_amount, department, posted_at)
        VALUES (?, ?, ?, 'fnb', 'Restaurant Charges', ?, 'restaurant', ?)
      `, [generateId(), order.reservation_id, order.guest_id, finalTotal, timestamp()]);
      
      run(`
        UPDATE reservations SET balance_due = balance_due + ?, updated_at = ? WHERE id = ?
      `, [finalTotal, timestamp(), order.reservation_id]);
    }
    
    notifyAccounting('hospitality', 'restaurant.order.paid', { order_id: req.params.id, total_amount: finalTotal, payment_method, tip: tip || 0, table_id: order.table_id });
    res.json({ success: true, total: finalTotal });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// KITCHEN DISPLAY
// ============================================

app.get('/api/kitchen/orders', (req, res) => {
  try {
    const { status, station } = req.query;
    let sql = `
      SELECT k.*, o.table_id, t.table_number
      FROM kitchen_orders k
      JOIN restaurant_orders o ON k.order_id = o.id
      LEFT JOIN restaurant_tables t ON o.table_id = t.id
      WHERE o.status NOT IN ('closed', 'cancelled')
    `;
    const params = [];
    
    if (status) {
      sql += ` AND k.status = ?`;
      params.push(status);
    }
    if (station) {
      sql += ` AND k.station = ?`;
      params.push(station);
    }
    
    sql += ` ORDER BY k.priority DESC, k.created_at ASC`;
    
    const orders = query(sql, params);
    res.json({ success: true, kitchen_orders: orders });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/api/kitchen/orders/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    const now = timestamp();
    
    let updateSql = `UPDATE kitchen_orders SET status = ?`;
    const params = [status];
    
    if (status === 'preparing') {
      updateSql += `, started_at = ?`;
      params.push(now);
    } else if (status === 'ready' || status === 'served') {
      updateSql += `, completed_at = ?`;
      params.push(now);
    }
    
    updateSql += ` WHERE id = ?`;
    params.push(req.params.id);
    
    run(updateSql, params);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/api/kitchen/orders/:id/priority', (req, res) => {
  try {
    const { priority } = req.body;
    run(`UPDATE kitchen_orders SET priority = ? WHERE id = ?`, [priority, req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// DASHBOARD & STATS
// ============================================

app.get('/api/dashboard/stats', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const totalTables = get(`SELECT COUNT(*) as count FROM restaurant_tables`);
    const occupiedTables = get(`SELECT COUNT(*) as count FROM restaurant_tables WHERE status = 'occupied'`);
    const openOrders = get(`SELECT COUNT(*) as count FROM restaurant_orders WHERE status = 'open'`);
    const todaySales = get(`
      SELECT SUM(total) as total, COUNT(*) as count 
      FROM restaurant_orders 
      WHERE DATE(created_at) = ? AND payment_status = 'paid'
    `, [today]);
    const pendingKitchen = get(`SELECT COUNT(*) as count FROM kitchen_orders WHERE status IN ('pending', 'preparing')`);
    
    res.json({
      success: true,
      stats: {
        total_tables: totalTables?.count || 0,
        occupied_tables: occupiedTables?.count || 0,
        available_tables: (totalTables?.count || 0) - (occupiedTables?.count || 0),
        open_orders: openOrders?.count || 0,
        today_sales: todaySales?.total || 0,
        today_orders: todaySales?.count || 0,
        pending_kitchen: pendingKitchen?.count || 0
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
