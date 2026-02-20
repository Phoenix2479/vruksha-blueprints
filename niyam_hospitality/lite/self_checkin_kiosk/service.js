/**
 * Self Check-in Kiosk Service - Niyam Hospitality (Max Lite)
 * Self-service check-in/out, ID verification, digital keys
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8932;
const SERVICE_NAME = 'self_checkin_kiosk';

app.use(cors());
app.use(express.json({ limit: '10mb' })); // For ID images

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
  
  // ID verifications
  db.run(`
    CREATE TABLE IF NOT EXISTS id_verifications (
      id TEXT PRIMARY KEY,
      reservation_id TEXT NOT NULL,
      guest_id TEXT NOT NULL,
      id_type TEXT NOT NULL,
      id_number TEXT,
      id_name TEXT,
      id_expiry TEXT,
      id_country TEXT,
      name_match INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      verified_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Digital keys
  db.run(`
    CREATE TABLE IF NOT EXISTS digital_keys (
      id TEXT PRIMARY KEY,
      reservation_id TEXT NOT NULL,
      guest_id TEXT NOT NULL,
      room_id TEXT NOT NULL,
      key_code TEXT NOT NULL,
      key_type TEXT DEFAULT 'mobile',
      valid_from TEXT,
      valid_until TEXT,
      is_active INTEGER DEFAULT 1,
      last_used TEXT,
      use_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Registration cards (digital signature + terms)
  db.run(`
    CREATE TABLE IF NOT EXISTS registration_cards (
      id TEXT PRIMARY KEY,
      reservation_id TEXT NOT NULL,
      guest_id TEXT NOT NULL,
      signature_data TEXT,
      terms_accepted INTEGER DEFAULT 0,
      marketing_consent INTEGER DEFAULT 0,
      preferences TEXT,
      signed_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Kiosk devices
  db.run(`
    CREATE TABLE IF NOT EXISTS kiosks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT,
      status TEXT DEFAULT 'online',
      last_heartbeat TEXT,
      settings TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Check-in/out log
  db.run(`
    CREATE TABLE IF NOT EXISTS checkin_log (
      id TEXT PRIMARY KEY,
      reservation_id TEXT,
      action TEXT NOT NULL,
      method TEXT DEFAULT 'kiosk',
      kiosk_id TEXT,
      details TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  return db;
}

// ============================================
// LOOKUP RESERVATION
// ============================================

app.get('/lookup', async (req, res) => {
  try {
    await ensureTables();
    const { confirmation, last_name, email, phone } = req.query;
    
    if (!confirmation && !last_name && !email && !phone) {
      return res.status(400).json({ success: false, error: 'At least one search parameter required' });
    }
    
    const today = new Date().toISOString().split('T')[0];
    
    let sql = `
      SELECT r.*, g.first_name, g.last_name, g.email, g.phone,
             rm.room_number, rm.floor, rt.name as room_type
      FROM reservations r
      LEFT JOIN guests g ON r.guest_id = g.id
      LEFT JOIN rooms rm ON r.room_id = rm.id
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      WHERE r.status IN ('confirmed', 'checked_in')
        AND DATE(r.check_in_date) <= ?
        AND DATE(r.check_out_date) >= ?
    `;
    const params = [today, today];
    
    if (confirmation) {
      sql += ` AND (r.confirmation_number = ? OR r.id = ?)`;
      params.push(confirmation, confirmation);
    }
    if (last_name) {
      sql += ` AND g.last_name LIKE ?`;
      params.push(`%${last_name}%`);
    }
    if (email) {
      sql += ` AND g.email = ?`;
      params.push(email);
    }
    if (phone) {
      sql += ` AND g.phone = ?`;
      params.push(phone);
    }
    
    sql += ` LIMIT 10`;
    
    const reservations = query(sql, params);
    
    const formatted = reservations.map(r => ({
      reservation_id: r.id,
      confirmation_number: r.confirmation_number,
      guest_name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
      email: r.email,
      phone: r.phone,
      room_number: r.room_number,
      room_type: r.room_type,
      floor: r.floor,
      check_in: r.check_in_date,
      check_out: r.check_out_date,
      adults: r.adults,
      children: r.children,
      status: r.status,
      id_verified: !!get(`SELECT 1 FROM id_verifications WHERE reservation_id = ? AND status = 'verified'`, [r.id])
    }));
    
    res.json({ success: true, reservations: formatted });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// SCAN & VERIFY ID
// ============================================

app.post('/scan-id', async (req, res) => {
  try {
    await ensureTables();
    const { reservation_id, id_type, id_number, id_name, id_expiry, id_country, id_image_base64 } = req.body;
    
    if (!reservation_id || !id_type || !id_number || !id_name) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
    // Get reservation
    const reservation = get(`
      SELECT r.*, g.first_name, g.last_name, g.id as guest_id
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      WHERE r.id = ?
    `, [reservation_id]);
    
    if (!reservation) {
      return res.status(404).json({ success: false, error: 'Reservation not found' });
    }
    
    // Basic name matching
    const guestName = `${reservation.first_name || ''} ${reservation.last_name || ''}`.toLowerCase();
    const idNameLower = id_name.toLowerCase();
    const nameMatch = idNameLower.includes(reservation.first_name?.toLowerCase() || '') || 
                     guestName.includes(idNameLower.split(' ')[0]);
    
    const verificationId = generateId();
    const status = nameMatch ? 'verified' : 'review_required';
    
    run(`
      INSERT INTO id_verifications (id, reservation_id, guest_id, id_type, id_number, id_name, id_expiry, id_country, name_match, status, verified_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [verificationId, reservation_id, reservation.guest_id, id_type, id_number, id_name, id_expiry, id_country, nameMatch ? 1 : 0, status, nameMatch ? timestamp() : null, timestamp()]);
    
    // Update guest record
    if (nameMatch) {
      run(`UPDATE guests SET id_type = ?, id_number = ?, updated_at = ? WHERE id = ?`,
        [id_type, id_number, timestamp(), reservation.guest_id]);
    }
    
    // Log action
    run(`INSERT INTO checkin_log (id, reservation_id, action, method, details, created_at) VALUES (?, ?, 'id_scan', 'kiosk', ?, ?)`,
      [generateId(), reservation_id, JSON.stringify({ id_type, verified: nameMatch }), timestamp()]);
    
    res.json({
      success: true,
      verification: {
        id: verificationId,
        status,
        name_match: nameMatch,
        message: nameMatch ? 'ID verified successfully' : 'ID requires manual review - name mismatch'
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// COMPLETE CHECK-IN
// ============================================

app.post('/complete-checkin', async (req, res) => {
  try {
    await ensureTables();
    const { reservation_id, signature_base64, terms_accepted, marketing_consent, preferences } = req.body;
    
    if (!reservation_id || !terms_accepted) {
      return res.status(400).json({ success: false, error: 'Reservation ID and terms acceptance required' });
    }
    
    // Get reservation
    const reservation = get(`
      SELECT r.*, rm.room_number, rm.id as room_id, g.id as guest_id
      FROM reservations r
      JOIN rooms rm ON r.room_id = rm.id
      JOIN guests g ON r.guest_id = g.id
      WHERE r.id = ? AND r.status = 'confirmed'
    `, [reservation_id]);
    
    if (!reservation) {
      return res.status(404).json({ success: false, error: 'Reservation not found or already checked in' });
    }
    
    // Check ID verification (configurable)
    const idRequired = process.env.ID_SCAN_REQUIRED !== 'false';
    if (idRequired) {
      const verification = get(`SELECT * FROM id_verifications WHERE reservation_id = ? AND status = 'verified'`, [reservation_id]);
      if (!verification) {
        return res.status(400).json({ success: false, error: 'ID verification required before check-in' });
      }
    }
    
    // Update reservation status
    run(`UPDATE reservations SET status = 'checked_in', actual_check_in = ?, updated_at = ? WHERE id = ?`,
      [timestamp(), timestamp(), reservation_id]);
    
    // Update room status
    run(`UPDATE rooms SET status = 'occupied', updated_at = ? WHERE id = ?`,
      [timestamp(), reservation.room_id]);
    
    // Store registration card
    run(`
      INSERT INTO registration_cards (id, reservation_id, guest_id, signature_data, terms_accepted, marketing_consent, preferences, signed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [generateId(), reservation_id, reservation.guest_id, signature_base64, terms_accepted ? 1 : 0, marketing_consent ? 1 : 0, JSON.stringify(preferences || {}), timestamp()]);
    
    // Generate digital key
    const keyCode = generateId().replace(/-/g, '').substring(0, 12).toUpperCase();
    const checkOutDate = new Date(reservation.check_out_date);
    checkOutDate.setHours(14, 0, 0, 0); // Standard checkout time
    
    run(`
      INSERT INTO digital_keys (id, reservation_id, guest_id, room_id, key_code, valid_from, valid_until, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `, [generateId(), reservation_id, reservation.guest_id, reservation.room_id, keyCode, timestamp(), checkOutDate.toISOString(), timestamp()]);
    
    // Log action
    run(`INSERT INTO checkin_log (id, reservation_id, action, method, created_at) VALUES (?, ?, 'checkin', 'kiosk', ?)`,
      [generateId(), reservation_id, timestamp()]);
    
    res.json({
      success: true,
      checkin: {
        reservation_id,
        room_number: reservation.room_number,
        status: 'checked_in',
        digital_key: {
          code: keyCode,
          valid_until: checkOutDate.toISOString(),
          qr_data: JSON.stringify({ type: 'room_key', code: keyCode, room: reservation.room_number })
        },
        message: `Welcome! Your room ${reservation.room_number} is ready.`
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// DIGITAL KEY
// ============================================

app.get('/key/:reservation_id', async (req, res) => {
  try {
    await ensureTables();
    const { reservation_id } = req.params;
    
    const key = get(`
      SELECT dk.*, rm.room_number
      FROM digital_keys dk
      JOIN rooms rm ON dk.room_id = rm.id
      WHERE dk.reservation_id = ? AND dk.is_active = 1
      ORDER BY dk.created_at DESC
      LIMIT 1
    `, [reservation_id]);
    
    if (!key) {
      return res.status(404).json({ success: false, error: 'No active key found' });
    }
    
    res.json({
      success: true,
      key: {
        code: key.key_code,
        room_number: key.room_number,
        valid_from: key.valid_from,
        valid_until: key.valid_until,
        qr_data: JSON.stringify({ type: 'room_key', code: key.key_code, room: key.room_number })
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/key/regenerate', async (req, res) => {
  try {
    await ensureTables();
    const { reservation_id } = req.body;
    
    // Deactivate existing keys
    run(`UPDATE digital_keys SET is_active = 0 WHERE reservation_id = ?`, [reservation_id]);
    
    // Get reservation
    const reservation = get(`
      SELECT r.*, rm.id as room_id, rm.room_number
      FROM reservations r
      JOIN rooms rm ON r.room_id = rm.id
      WHERE r.id = ? AND r.status = 'checked_in'
    `, [reservation_id]);
    
    if (!reservation) {
      return res.status(404).json({ success: false, error: 'Active reservation not found' });
    }
    
    // Generate new key
    const keyCode = generateId().replace(/-/g, '').substring(0, 12).toUpperCase();
    const checkOutDate = new Date(reservation.check_out_date);
    checkOutDate.setHours(14, 0, 0, 0);
    
    run(`
      INSERT INTO digital_keys (id, reservation_id, guest_id, room_id, key_code, valid_from, valid_until, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `, [generateId(), reservation_id, reservation.guest_id, reservation.room_id, keyCode, timestamp(), checkOutDate.toISOString(), timestamp()]);
    
    res.json({
      success: true,
      key: {
        code: keyCode,
        room_number: reservation.room_number,
        valid_until: checkOutDate.toISOString()
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// SELF CHECKOUT
// ============================================

app.post('/checkout', async (req, res) => {
  try {
    await ensureTables();
    const { reservation_id, rating, feedback } = req.body;
    
    // Get reservation with balance
    const reservation = get(`
      SELECT r.*, rm.room_number, rm.id as room_id,
             (r.total_amount - COALESCE(r.deposit_amount, 0)) as balance
      FROM reservations r
      JOIN rooms rm ON r.room_id = rm.id
      WHERE r.id = ? AND r.status = 'checked_in'
    `, [reservation_id]);
    
    if (!reservation) {
      return res.status(404).json({ success: false, error: 'Active reservation not found' });
    }
    
    if (reservation.balance > 0) {
      return res.status(400).json({
        success: false,
        error: 'Outstanding balance must be settled before checkout',
        balance: reservation.balance
      });
    }
    
    // Complete checkout
    run(`UPDATE reservations SET status = 'checked_out', actual_check_out = ?, updated_at = ? WHERE id = ?`,
      [timestamp(), timestamp(), reservation_id]);
    
    // Update room status
    run(`UPDATE rooms SET status = 'dirty', condition = 'dirty', updated_at = ? WHERE id = ?`,
      [timestamp(), reservation.room_id]);
    
    // Deactivate digital keys
    run(`UPDATE digital_keys SET is_active = 0 WHERE reservation_id = ?`, [reservation_id]);
    
    // Create housekeeping task
    run(`
      INSERT INTO housekeeping_tasks (id, room_id, task_type, priority, status, scheduled_date, created_at)
      VALUES (?, ?, 'checkout_cleaning', 'high', 'pending', ?, ?)
    `, [generateId(), reservation.room_id, new Date().toISOString().split('T')[0], timestamp()]);
    
    // Store feedback if provided
    if (rating || feedback) {
      run(`
        INSERT INTO guest_feedback (id, reservation_id, guest_id, category, rating, comment, created_at)
        VALUES (?, ?, ?, 'checkout', ?, ?, ?)
      `, [generateId(), reservation_id, reservation.guest_id, rating, feedback, timestamp()]);
    }
    
    // Log action
    run(`INSERT INTO checkin_log (id, reservation_id, action, method, created_at) VALUES (?, ?, 'checkout', 'kiosk', ?)`,
      [generateId(), reservation_id, timestamp()]);
    
    res.json({
      success: true,
      checkout: {
        reservation_id,
        room_number: reservation.room_number,
        status: 'checked_out',
        message: 'Thank you for staying with us! Have a safe journey.'
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// KIOSK MANAGEMENT
// ============================================

app.get('/kiosks', async (req, res) => {
  try {
    await ensureTables();
    
    const kiosks = query(`SELECT * FROM kiosks ORDER BY name`);
    
    const formatted = kiosks.map(k => {
      const lastHeartbeat = k.last_heartbeat ? new Date(k.last_heartbeat).getTime() : 0;
      const isOnline = (Date.now() - lastHeartbeat) < 5 * 60 * 1000; // 5 minutes
      return { ...k, is_online: isOnline };
    });
    
    res.json({ success: true, kiosks: formatted });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/kiosks/:id/heartbeat', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    
    run(`UPDATE kiosks SET last_heartbeat = ?, status = 'online' WHERE id = ?`, [timestamp(), id]);
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/kiosks', async (req, res) => {
  try {
    await ensureTables();
    const { name, location, settings } = req.body;
    
    const id = generateId();
    run(`INSERT INTO kiosks (id, name, location, settings, created_at) VALUES (?, ?, ?, ?, ?)`,
      [id, name, location, JSON.stringify(settings || {}), timestamp()]);
    
    res.json({ success: true, kiosk: { id, name, location } });
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
    const today = new Date().toISOString().split('T')[0];
    
    const todayCheckins = get(`
      SELECT COUNT(*) as count FROM checkin_log 
      WHERE action = 'checkin' AND method = 'kiosk' AND DATE(created_at) = ?
    `, [today]);
    
    const todayCheckouts = get(`
      SELECT COUNT(*) as count FROM checkin_log 
      WHERE action = 'checkout' AND method = 'kiosk' AND DATE(created_at) = ?
    `, [today]);
    
    const totalKiosk = get(`
      SELECT COUNT(*) as count FROM checkin_log WHERE method = 'kiosk'
    `);
    
    const activeKeys = get(`
      SELECT COUNT(*) as count FROM digital_keys WHERE is_active = 1
    `);
    
    res.json({
      success: true,
      stats: {
        self_checkins_today: todayCheckins?.count || 0,
        self_checkouts_today: todayCheckouts?.count || 0,
        total_self_service: totalKiosk?.count || 0,
        active_digital_keys: activeKeys?.count || 0
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
