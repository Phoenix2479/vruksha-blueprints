/**
 * Group Reservations Service - Niyam Hospitality (Max Lite)
 * Group booking management with room blocks, rooming lists, group billing
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8927;
const SERVICE_NAME = 'group_reservations';

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
  
  // Group reservations (master record)
  db.run(`
    CREATE TABLE IF NOT EXISTS group_reservations (
      id TEXT PRIMARY KEY,
      group_name TEXT NOT NULL,
      group_code TEXT UNIQUE,
      group_type TEXT DEFAULT 'corporate',
      contact_name TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      company_name TEXT,
      arrival_date TEXT NOT NULL,
      departure_date TEXT NOT NULL,
      total_rooms INTEGER DEFAULT 0,
      picked_up_rooms INTEGER DEFAULT 0,
      cutoff_date TEXT,
      contracted_rate REAL DEFAULT 0,
      rate_plan_id TEXT,
      deposit_required REAL DEFAULT 0,
      deposit_paid REAL DEFAULT 0,
      total_revenue REAL DEFAULT 0,
      commission_percent REAL DEFAULT 0,
      billing_type TEXT DEFAULT 'individual',
      master_account_id TEXT,
      special_requests TEXT,
      internal_notes TEXT,
      status TEXT DEFAULT 'tentative',
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Group room blocks
  db.run(`
    CREATE TABLE IF NOT EXISTS group_rooms (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      room_type_id TEXT,
      room_id TEXT,
      date TEXT NOT NULL,
      rate REAL DEFAULT 0,
      status TEXT DEFAULT 'blocked',
      reservation_id TEXT,
      guest_id TEXT,
      picked_up_at TEXT,
      released_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Rooming list (guests in group)
  db.run(`
    CREATE TABLE IF NOT EXISTS group_guests (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      guest_id TEXT,
      first_name TEXT NOT NULL,
      last_name TEXT,
      email TEXT,
      phone TEXT,
      room_preference TEXT,
      special_requests TEXT,
      arrival_date TEXT,
      departure_date TEXT,
      assigned_room_id TEXT,
      reservation_id TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Group billing/folio
  db.run(`
    CREATE TABLE IF NOT EXISTS group_charges (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      charge_type TEXT NOT NULL,
      description TEXT,
      quantity INTEGER DEFAULT 1,
      unit_price REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      posted_date TEXT,
      posted_by TEXT,
      reservation_id TEXT,
      status TEXT DEFAULT 'posted',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Group payments
  db.run(`
    CREATE TABLE IF NOT EXISTS group_payments (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT DEFAULT 'bank_transfer',
      reference_number TEXT,
      payment_date TEXT,
      notes TEXT,
      received_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Group activity log
  db.run(`
    CREATE TABLE IF NOT EXISTS group_activity_log (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      performed_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  return db;
}

// ============================================
// GROUP BLOCKS
// ============================================

app.get('/groups', async (req, res) => {
  try {
    await ensureTables();
    const { status, from_date, to_date, search } = req.query;
    
    let sql = `
      SELECT g.*,
        (SELECT COUNT(*) FROM group_rooms WHERE group_id = g.id) as total_blocked,
        (SELECT COUNT(*) FROM group_rooms WHERE group_id = g.id AND reservation_id IS NOT NULL) as picked_up,
        (SELECT COUNT(*) FROM group_guests WHERE group_id = g.id) as rooming_list_count
      FROM group_reservations g
      WHERE 1=1
    `;
    const params = [];
    
    if (status) {
      sql += ` AND g.status = ?`;
      params.push(status);
    }
    if (from_date) {
      sql += ` AND g.arrival_date >= ?`;
      params.push(from_date);
    }
    if (to_date) {
      sql += ` AND g.arrival_date <= ?`;
      params.push(to_date);
    }
    if (search) {
      sql += ` AND (g.group_name LIKE ? OR g.contact_name LIKE ? OR g.company_name LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    sql += ` ORDER BY g.arrival_date DESC LIMIT 100`;
    
    const groups = query(sql, params);
    res.json({ success: true, groups });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/groups/:id', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    
    const group = get(`
      SELECT g.*,
        (SELECT COUNT(*) FROM group_rooms WHERE group_id = g.id) as total_blocked,
        (SELECT COUNT(*) FROM group_rooms WHERE group_id = g.id AND reservation_id IS NOT NULL) as picked_up
      FROM group_reservations g
      WHERE g.id = ?
    `, [id]);
    
    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }
    
    // Get blocked rooms
    const rooms = query(`
      SELECT gr.*, r.room_number, rt.name as room_type_name
      FROM group_rooms gr
      LEFT JOIN rooms r ON gr.room_id = r.id
      LEFT JOIN room_types rt ON gr.room_type_id = rt.id
      WHERE gr.group_id = ?
      ORDER BY gr.date, r.room_number
    `, [id]);
    
    // Get rooming list
    const guests = query(`SELECT * FROM group_guests WHERE group_id = ? ORDER BY last_name, first_name`, [id]);
    
    // Get charges
    const charges = query(`SELECT * FROM group_charges WHERE group_id = ? ORDER BY posted_date DESC`, [id]);
    
    // Get payments
    const payments = query(`SELECT * FROM group_payments WHERE group_id = ? ORDER BY payment_date DESC`, [id]);
    
    // Calculate totals
    const totalCharges = charges.reduce((sum, c) => sum + (c.total_amount || 0), 0);
    const totalPayments = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    
    res.json({
      success: true,
      group: {
        ...group,
        rooms,
        guests,
        charges,
        payments,
        balance: totalCharges - totalPayments
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/groups', async (req, res) => {
  try {
    await ensureTables();
    const { group_name, group_type, contact_name, contact_email, contact_phone, company_name, arrival_date, departure_date, total_rooms, cutoff_date, contracted_rate, rate_plan_id, deposit_required, billing_type, special_requests, internal_notes, created_by } = req.body;
    
    const id = generateId();
    const groupCode = `GRP${Date.now().toString(36).toUpperCase()}`;
    
    run(`
      INSERT INTO group_reservations (id, group_name, group_code, group_type, contact_name, contact_email, contact_phone, company_name, arrival_date, departure_date, total_rooms, cutoff_date, contracted_rate, rate_plan_id, deposit_required, billing_type, special_requests, internal_notes, status, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'tentative', ?, ?)
    `, [id, group_name, groupCode, group_type || 'corporate', contact_name, contact_email, contact_phone, company_name, arrival_date, departure_date, total_rooms || 0, cutoff_date, contracted_rate || 0, rate_plan_id, deposit_required || 0, billing_type || 'individual', special_requests, internal_notes, created_by, timestamp()]);
    
    // Log activity
    run(`INSERT INTO group_activity_log (id, group_id, action, details, performed_by, created_at) VALUES (?, ?, 'created', 'Group reservation created', ?, ?)`,
      [generateId(), id, created_by, timestamp()]);
    
    res.json({ success: true, group: { id, group_code: groupCode, group_name } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/groups/:id', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { group_name, contact_name, contact_email, contact_phone, company_name, arrival_date, departure_date, cutoff_date, contracted_rate, deposit_required, billing_type, special_requests, internal_notes, status } = req.body;
    
    run(`
      UPDATE group_reservations SET
        group_name = COALESCE(?, group_name),
        contact_name = COALESCE(?, contact_name),
        contact_email = COALESCE(?, contact_email),
        contact_phone = COALESCE(?, contact_phone),
        company_name = COALESCE(?, company_name),
        arrival_date = COALESCE(?, arrival_date),
        departure_date = COALESCE(?, departure_date),
        cutoff_date = COALESCE(?, cutoff_date),
        contracted_rate = COALESCE(?, contracted_rate),
        deposit_required = COALESCE(?, deposit_required),
        billing_type = COALESCE(?, billing_type),
        special_requests = COALESCE(?, special_requests),
        internal_notes = COALESCE(?, internal_notes),
        status = COALESCE(?, status),
        updated_at = ?
      WHERE id = ?
    `, [group_name, contact_name, contact_email, contact_phone, company_name, arrival_date, departure_date, cutoff_date, contracted_rate, deposit_required, billing_type, special_requests, internal_notes, status, timestamp(), id]);
    
    res.json({ success: true, message: 'Group updated' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// ROOM BLOCKS
// ============================================

app.post('/groups/:id/block-rooms', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { room_type_id, room_ids, dates, rate } = req.body;
    
    const group = get(`SELECT * FROM group_reservations WHERE id = ?`, [id]);
    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }
    
    let blockedCount = 0;
    
    // If specific room_ids provided, block those
    if (room_ids && room_ids.length > 0) {
      for (const roomId of room_ids) {
        for (const date of dates || []) {
          run(`
            INSERT INTO group_rooms (id, group_id, room_id, room_type_id, date, rate, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'blocked', ?)
          `, [generateId(), id, roomId, room_type_id, date, rate || group.contracted_rate, timestamp()]);
          blockedCount++;
        }
      }
    } else if (room_type_id && dates) {
      // Block by room type
      for (const date of dates) {
        run(`
          INSERT INTO group_rooms (id, group_id, room_type_id, date, rate, status, created_at)
          VALUES (?, ?, ?, ?, ?, 'blocked', ?)
        `, [generateId(), id, room_type_id, date, rate || group.contracted_rate, timestamp()]);
        blockedCount++;
      }
    }
    
    // Update total rooms
    run(`UPDATE group_reservations SET total_rooms = (SELECT COUNT(*) FROM group_rooms WHERE group_id = ?) WHERE id = ?`, [id, id]);
    
    res.json({ success: true, blocked_count: blockedCount });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/groups/:groupId/rooms/:roomBlockId/pickup', async (req, res) => {
  try {
    await ensureTables();
    const { groupId, roomBlockId } = req.params;
    const { guest_id, reservation_id } = req.body;
    
    run(`
      UPDATE group_rooms SET 
        status = 'picked_up', 
        guest_id = ?, 
        reservation_id = ?,
        picked_up_at = ?
      WHERE id = ? AND group_id = ?
    `, [guest_id, reservation_id, timestamp(), roomBlockId, groupId]);
    
    // Update picked up count
    run(`UPDATE group_reservations SET picked_up_rooms = (SELECT COUNT(*) FROM group_rooms WHERE group_id = ? AND reservation_id IS NOT NULL) WHERE id = ?`, [groupId, groupId]);
    
    res.json({ success: true, message: 'Room picked up' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/groups/:groupId/rooms/:roomBlockId/release', async (req, res) => {
  try {
    await ensureTables();
    const { groupId, roomBlockId } = req.params;
    const { reason } = req.body;
    
    run(`UPDATE group_rooms SET status = 'released', released_at = ? WHERE id = ? AND group_id = ?`,
      [timestamp(), roomBlockId, groupId]);
    
    run(`INSERT INTO group_activity_log (id, group_id, action, details, created_at) VALUES (?, ?, 'room_released', ?, ?)`,
      [generateId(), groupId, reason || 'Room released from block', timestamp()]);
    
    res.json({ success: true, message: 'Room released' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// ROOMING LIST
// ============================================

app.get('/groups/:id/rooming-list', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    
    const guests = query(`
      SELECT gg.*, r.room_number
      FROM group_guests gg
      LEFT JOIN rooms r ON gg.assigned_room_id = r.id
      WHERE gg.group_id = ?
      ORDER BY gg.last_name, gg.first_name
    `, [id]);
    
    res.json({ success: true, guests });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/groups/:id/rooming-list', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { guests } = req.body;
    
    let addedCount = 0;
    
    for (const guest of guests || []) {
      const guestId = generateId();
      run(`
        INSERT INTO group_guests (id, group_id, first_name, last_name, email, phone, room_preference, special_requests, arrival_date, departure_date, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `, [guestId, id, guest.first_name, guest.last_name, guest.email, guest.phone, guest.room_preference, guest.special_requests, guest.arrival_date, guest.departure_date, timestamp()]);
      addedCount++;
    }
    
    res.json({ success: true, added_count: addedCount });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/groups/:groupId/rooming-list/:guestId/assign', async (req, res) => {
  try {
    await ensureTables();
    const { groupId, guestId } = req.params;
    const { room_id, reservation_id } = req.body;
    
    run(`
      UPDATE group_guests SET 
        assigned_room_id = ?, 
        reservation_id = ?,
        status = 'assigned'
      WHERE id = ? AND group_id = ?
    `, [room_id, reservation_id, guestId, groupId]);
    
    res.json({ success: true, message: 'Room assigned' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// GROUP BILLING
// ============================================

app.post('/groups/:id/charges', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { charge_type, description, quantity, unit_price, tax_amount, posted_by, reservation_id } = req.body;
    
    const totalAmount = (quantity || 1) * (unit_price || 0);
    const chargeId = generateId();
    
    run(`
      INSERT INTO group_charges (id, group_id, charge_type, description, quantity, unit_price, total_amount, tax_amount, posted_date, posted_by, reservation_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [chargeId, id, charge_type, description, quantity || 1, unit_price || 0, totalAmount, tax_amount || 0, timestamp(), posted_by, reservation_id, timestamp()]);
    
    // Update total revenue
    run(`UPDATE group_reservations SET total_revenue = (SELECT SUM(total_amount) FROM group_charges WHERE group_id = ?) WHERE id = ?`, [id, id]);
    
    res.json({ success: true, charge: { id: chargeId, total_amount: totalAmount } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/groups/:id/payments', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { amount, payment_method, reference_number, notes, received_by } = req.body;
    
    const paymentId = generateId();
    run(`
      INSERT INTO group_payments (id, group_id, amount, payment_method, reference_number, payment_date, notes, received_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [paymentId, id, amount, payment_method || 'bank_transfer', reference_number, timestamp(), notes, received_by, timestamp()]);
    
    // Update deposit paid
    run(`UPDATE group_reservations SET deposit_paid = (SELECT SUM(amount) FROM group_payments WHERE group_id = ?) WHERE id = ?`, [id, id]);
    
    res.json({ success: true, payment: { id: paymentId, amount } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/groups/:id/folio', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    
    const group = get(`SELECT * FROM group_reservations WHERE id = ?`, [id]);
    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }
    
    const charges = query(`SELECT * FROM group_charges WHERE group_id = ? ORDER BY posted_date`, [id]);
    const payments = query(`SELECT * FROM group_payments WHERE group_id = ? ORDER BY payment_date`, [id]);
    
    const totalCharges = charges.reduce((sum, c) => sum + (c.total_amount || 0), 0);
    const totalTax = charges.reduce((sum, c) => sum + (c.tax_amount || 0), 0);
    const totalPayments = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    
    res.json({
      success: true,
      folio: {
        group_id: id,
        group_name: group.group_name,
        charges,
        payments,
        summary: {
          total_charges: totalCharges,
          total_tax: totalTax,
          total_payments: totalPayments,
          balance: totalCharges + totalTax - totalPayments
        }
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// STATUS MANAGEMENT
// ============================================

app.post('/groups/:id/confirm', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { confirmed_by } = req.body;
    
    run(`UPDATE group_reservations SET status = 'confirmed', updated_at = ? WHERE id = ?`, [timestamp(), id]);
    run(`INSERT INTO group_activity_log (id, group_id, action, details, performed_by, created_at) VALUES (?, ?, 'confirmed', 'Group confirmed', ?, ?)`,
      [generateId(), id, confirmed_by, timestamp()]);
    
    res.json({ success: true, message: 'Group confirmed' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/groups/:id/cancel', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { reason, cancelled_by } = req.body;
    
    run(`UPDATE group_reservations SET status = 'cancelled', updated_at = ? WHERE id = ?`, [timestamp(), id]);
    run(`UPDATE group_rooms SET status = 'released', released_at = ? WHERE group_id = ? AND status = 'blocked'`, [timestamp(), id]);
    run(`INSERT INTO group_activity_log (id, group_id, action, details, performed_by, created_at) VALUES (?, ?, 'cancelled', ?, ?, ?)`,
      [generateId(), id, reason || 'Group cancelled', cancelled_by, timestamp()]);
    
    res.json({ success: true, message: 'Group cancelled' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// PICKUP REPORT
// ============================================

app.get('/groups/:id/pickup-report', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    
    const group = get(`SELECT * FROM group_reservations WHERE id = ?`, [id]);
    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }
    
    // Get pickup by date
    const byDate = query(`
      SELECT date, 
        COUNT(*) as total_blocked,
        SUM(CASE WHEN reservation_id IS NOT NULL THEN 1 ELSE 0 END) as picked_up,
        SUM(CASE WHEN status = 'released' THEN 1 ELSE 0 END) as released
      FROM group_rooms
      WHERE group_id = ?
      GROUP BY date
      ORDER BY date
    `, [id]);
    
    // Get pickup by room type
    const byRoomType = query(`
      SELECT rt.name as room_type,
        COUNT(*) as total_blocked,
        SUM(CASE WHEN gr.reservation_id IS NOT NULL THEN 1 ELSE 0 END) as picked_up
      FROM group_rooms gr
      LEFT JOIN room_types rt ON gr.room_type_id = rt.id
      WHERE gr.group_id = ?
      GROUP BY gr.room_type_id
    `, [id]);
    
    const totalBlocked = get(`SELECT COUNT(*) as count FROM group_rooms WHERE group_id = ?`, [id]);
    const totalPickedUp = get(`SELECT COUNT(*) as count FROM group_rooms WHERE group_id = ? AND reservation_id IS NOT NULL`, [id]);
    
    res.json({
      success: true,
      report: {
        group_name: group.group_name,
        arrival_date: group.arrival_date,
        departure_date: group.departure_date,
        cutoff_date: group.cutoff_date,
        total_blocked: totalBlocked?.count || 0,
        total_picked_up: totalPickedUp?.count || 0,
        pickup_percent: totalBlocked?.count > 0 ? Math.round((totalPickedUp?.count / totalBlocked?.count) * 100) : 0,
        by_date: byDate,
        by_room_type: byRoomType
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// ACTIVITY LOG
// ============================================

app.get('/groups/:id/activity', async (req, res) => {
  try {
    await ensureTables();
    const activity = query(`SELECT * FROM group_activity_log WHERE group_id = ? ORDER BY created_at DESC LIMIT 50`, [req.params.id]);
    res.json({ success: true, activity });
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
