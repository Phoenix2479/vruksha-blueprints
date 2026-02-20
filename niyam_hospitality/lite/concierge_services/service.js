/**
 * Concierge Services - Niyam Hospitality (Max Lite)
 * Guest requests, bookings, recommendations, transport
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8928;
const SERVICE_NAME = 'concierge_services';

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME, mode: 'lite' }));

// ============================================
// GUEST REQUESTS
// ============================================

app.get('/api/requests', (req, res) => {
  try {
    const { status, category, priority, guest_id, room_id } = req.query;
    let sql = `
      SELECT gr.*, g.first_name, g.last_name, rm.room_number, s.first_name as assigned_name
      FROM guest_requests gr
      LEFT JOIN guests g ON gr.guest_id = g.id
      LEFT JOIN rooms rm ON gr.room_id = rm.id
      LEFT JOIN staff s ON gr.assigned_to = s.id
      WHERE 1=1
    `;
    const params = [];
    
    if (status) { sql += ` AND gr.status = ?`; params.push(status); }
    if (category) { sql += ` AND gr.category = ?`; params.push(category); }
    if (priority) { sql += ` AND gr.priority = ?`; params.push(priority); }
    if (guest_id) { sql += ` AND gr.guest_id = ?`; params.push(guest_id); }
    if (room_id) { sql += ` AND gr.room_id = ?`; params.push(room_id); }
    
    sql += ` ORDER BY gr.priority DESC, gr.created_at ASC`;
    
    const requests = query(sql, params);
    res.json({ success: true, requests });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/requests/:id', (req, res) => {
  try {
    const request = get(`
      SELECT gr.*, g.first_name, g.last_name, g.phone, rm.room_number
      FROM guest_requests gr
      LEFT JOIN guests g ON gr.guest_id = g.id
      LEFT JOIN rooms rm ON gr.room_id = rm.id
      WHERE gr.id = ?
    `, [req.params.id]);
    if (!request) return res.status(404).json({ success: false, error: 'Request not found' });
    res.json({ success: true, request });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/requests', (req, res) => {
  try {
    const { reservation_id, guest_id, room_id, request_type, category, description, priority, estimated_time } = req.body;
    const id = generateId();
    
    run(`
      INSERT INTO guest_requests (id, reservation_id, guest_id, room_id, request_type, category, description, priority, status, estimated_time, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `, [id, reservation_id, guest_id, room_id, request_type, category, description, priority || 'normal', estimated_time, timestamp()]);
    
    res.json({ success: true, request: { id } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/api/requests/:id', (req, res) => {
  try {
    const { assigned_to, status, priority, notes } = req.body;
    let updates = [];
    let params = [];
    
    if (assigned_to !== undefined) { updates.push('assigned_to = ?'); params.push(assigned_to); }
    if (priority !== undefined) { updates.push('priority = ?'); params.push(priority); }
    if (status !== undefined) { 
      updates.push('status = ?'); 
      params.push(status);
      if (status === 'completed') { updates.push('completed_at = ?'); params.push(timestamp()); }
    }
    
    if (updates.length > 0) {
      params.push(req.params.id);
      run(`UPDATE guest_requests SET ${updates.join(', ')} WHERE id = ?`, params);
    }
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/requests/:id/complete', (req, res) => {
  try {
    run(`UPDATE guest_requests SET status = 'completed', completed_at = ? WHERE id = ?`, [timestamp(), req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/requests/:id/feedback', (req, res) => {
  try {
    const { rating, notes } = req.body;
    run(`UPDATE guest_requests SET feedback_rating = ?, feedback_notes = ? WHERE id = ?`, [rating, notes, req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// CATEGORIES & SERVICES
// ============================================

app.get('/api/categories', (req, res) => {
  res.json({
    success: true,
    categories: [
      { id: 'amenities', name: 'Amenities', icon: 'gift' },
      { id: 'dining', name: 'Dining', icon: 'utensils' },
      { id: 'transport', name: 'Transport', icon: 'car' },
      { id: 'tours', name: 'Tours & Activities', icon: 'map' },
      { id: 'spa', name: 'Spa & Wellness', icon: 'spa' },
      { id: 'laundry', name: 'Laundry', icon: 'shirt' },
      { id: 'business', name: 'Business Services', icon: 'briefcase' },
      { id: 'special', name: 'Special Occasions', icon: 'cake' },
      { id: 'other', name: 'Other', icon: 'help-circle' }
    ]
  });
});

// ============================================
// RECOMMENDATIONS
// ============================================

// Ensure recommendations table exists
const ensureRecommendationsTable = () => {
  try {
    run(`
      CREATE TABLE IF NOT EXISTS concierge_recommendations (
        id TEXT PRIMARY KEY,
        category TEXT,
        name TEXT NOT NULL,
        description TEXT,
        location TEXT,
        price_range TEXT,
        contact TEXT,
        image_url TEXT,
        rating REAL DEFAULT 0,
        tags TEXT,
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (e) {}
};

app.get('/api/recommendations', (req, res) => {
  try {
    ensureRecommendationsTable();
    const { category, search } = req.query;
    let sql = `SELECT * FROM concierge_recommendations WHERE active = 1`;
    const params = [];
    
    if (category) { sql += ` AND category = ?`; params.push(category); }
    if (search) { sql += ` AND (name LIKE ? OR description LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
    
    sql += ` ORDER BY rating DESC, name ASC`;
    
    const recommendations = query(sql, params);
    res.json({ success: true, recommendations });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/recommendations', (req, res) => {
  try {
    ensureRecommendationsTable();
    const { category, name, description, location, price_range, contact, image_url, tags } = req.body;
    const id = generateId();
    
    run(`
      INSERT INTO concierge_recommendations (id, category, name, description, location, price_range, contact, image_url, tags, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, category, name, description, location, price_range, contact, image_url, JSON.stringify(tags || []), timestamp()]);
    
    res.json({ success: true, recommendation: { id } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// TRANSPORT BOOKINGS
// ============================================

const ensureTransportTable = () => {
  try {
    run(`
      CREATE TABLE IF NOT EXISTS transport_bookings (
        id TEXT PRIMARY KEY,
        reservation_id TEXT,
        guest_id TEXT,
        booking_type TEXT NOT NULL,
        pickup_location TEXT,
        dropoff_location TEXT,
        pickup_time TEXT,
        vehicle_type TEXT,
        passengers INTEGER DEFAULT 1,
        special_requests TEXT,
        driver_name TEXT,
        driver_phone TEXT,
        vehicle_number TEXT,
        status TEXT DEFAULT 'pending',
        cost REAL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (e) {}
};

app.get('/api/transport', (req, res) => {
  try {
    ensureTransportTable();
    const { status, date, guest_id } = req.query;
    let sql = `
      SELECT t.*, g.first_name, g.last_name
      FROM transport_bookings t
      LEFT JOIN guests g ON t.guest_id = g.id
      WHERE 1=1
    `;
    const params = [];
    
    if (status) { sql += ` AND t.status = ?`; params.push(status); }
    if (date) { sql += ` AND DATE(t.pickup_time) = ?`; params.push(date); }
    if (guest_id) { sql += ` AND t.guest_id = ?`; params.push(guest_id); }
    
    sql += ` ORDER BY t.pickup_time ASC`;
    
    const bookings = query(sql, params);
    res.json({ success: true, bookings });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/transport', (req, res) => {
  try {
    ensureTransportTable();
    const { reservation_id, guest_id, booking_type, pickup_location, dropoff_location, pickup_time, vehicle_type, passengers, special_requests, cost } = req.body;
    const id = generateId();
    
    run(`
      INSERT INTO transport_bookings (id, reservation_id, guest_id, booking_type, pickup_location, dropoff_location, pickup_time, vehicle_type, passengers, special_requests, cost, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, reservation_id, guest_id, booking_type, pickup_location, dropoff_location, pickup_time, vehicle_type, passengers || 1, special_requests, cost || 0, timestamp()]);
    
    res.json({ success: true, booking: { id } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/api/transport/:id', (req, res) => {
  try {
    const { driver_name, driver_phone, vehicle_number, status } = req.body;
    let updates = [];
    let params = [];
    
    if (driver_name) { updates.push('driver_name = ?'); params.push(driver_name); }
    if (driver_phone) { updates.push('driver_phone = ?'); params.push(driver_phone); }
    if (vehicle_number) { updates.push('vehicle_number = ?'); params.push(vehicle_number); }
    if (status) { updates.push('status = ?'); params.push(status); }
    
    if (updates.length > 0) {
      params.push(req.params.id);
      run(`UPDATE transport_bookings SET ${updates.join(', ')} WHERE id = ?`, params);
    }
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// DASHBOARD
// ============================================

app.get('/api/dashboard/stats', (req, res) => {
  try {
    const pendingRequests = get(`SELECT COUNT(*) as count FROM guest_requests WHERE status = 'pending'`);
    const inProgressRequests = get(`SELECT COUNT(*) as count FROM guest_requests WHERE status = 'in_progress'`);
    const todayTransport = get(`SELECT COUNT(*) as count FROM transport_bookings WHERE DATE(pickup_time) = DATE('now')`);
    const avgRating = get(`SELECT AVG(feedback_rating) as avg FROM guest_requests WHERE feedback_rating IS NOT NULL`);
    
    res.json({
      success: true,
      stats: {
        pending_requests: pendingRequests?.count || 0,
        in_progress: inProgressRequests?.count || 0,
        today_transport: todayTransport?.count || 0,
        avg_rating: Math.round((avgRating?.avg || 0) * 10) / 10
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
