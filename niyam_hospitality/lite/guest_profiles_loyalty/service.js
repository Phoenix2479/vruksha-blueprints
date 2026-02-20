/**
 * Guest Profiles & Loyalty Service - Niyam Hospitality (Max Lite)
 * Guest management, preferences, loyalty program, history
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8915;
const SERVICE_NAME = 'guest_profiles_loyalty';

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME, mode: 'lite' }));

// ============================================
// GUEST PROFILES
// ============================================

app.get('/api/guests', (req, res) => {
  try {
    const { search, loyalty_tier, limit, offset } = req.query;
    let sql = `SELECT * FROM guests WHERE 1=1`;
    const params = [];
    
    if (search) {
      sql += ` AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    if (loyalty_tier) {
      sql += ` AND loyalty_tier = ?`;
      params.push(loyalty_tier);
    }
    
    sql += ` ORDER BY created_at DESC`;
    if (limit) { sql += ` LIMIT ?`; params.push(parseInt(limit)); }
    if (offset) { sql += ` OFFSET ?`; params.push(parseInt(offset)); }
    
    const guests = query(sql, params);
    const total = get(`SELECT COUNT(*) as count FROM guests`);
    
    res.json({ success: true, guests, total: total?.count || 0 });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/guests/:id', (req, res) => {
  try {
    const guest = get(`SELECT * FROM guests WHERE id = ?`, [req.params.id]);
    if (!guest) return res.status(404).json({ success: false, error: 'Guest not found' });
    
    // Get stay history
    const stays = query(`
      SELECT r.*, rm.room_number, rt.name as room_type
      FROM reservations r
      LEFT JOIN rooms rm ON r.room_id = rm.id
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      WHERE r.guest_id = ?
      ORDER BY r.check_in_date DESC LIMIT 10
    `, [req.params.id]);
    
    // Get total stats
    const stats = get(`
      SELECT 
        COUNT(*) as total_stays,
        SUM(total_amount) as total_spent,
        AVG(total_amount) as avg_spend
      FROM reservations WHERE guest_id = ? AND status = 'checked_out'
    `, [req.params.id]);
    
    res.json({ success: true, guest, stays, stats });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/guests', (req, res) => {
  try {
    const { first_name, last_name, email, phone, address, city, country, id_type, id_number, date_of_birth, nationality, preferences, notes } = req.body;
    const id = generateId();
    
    run(`
      INSERT INTO guests (id, first_name, last_name, email, phone, address, city, country, id_type, id_number, date_of_birth, nationality, preferences, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, first_name, last_name, email, phone, address, city, country, id_type, id_number, date_of_birth, nationality, JSON.stringify(preferences || {}), notes, timestamp()]);
    
    res.json({ success: true, guest: { id, first_name, last_name } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/api/guests/:id', (req, res) => {
  try {
    const { first_name, last_name, email, phone, address, city, country, id_type, id_number, date_of_birth, nationality, preferences, notes } = req.body;
    
    run(`
      UPDATE guests SET
        first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name),
        email = COALESCE(?, email), phone = COALESCE(?, phone),
        address = COALESCE(?, address), city = COALESCE(?, city), country = COALESCE(?, country),
        id_type = COALESCE(?, id_type), id_number = COALESCE(?, id_number),
        date_of_birth = COALESCE(?, date_of_birth), nationality = COALESCE(?, nationality),
        preferences = COALESCE(?, preferences), notes = COALESCE(?, notes),
        updated_at = ?
      WHERE id = ?
    `, [first_name, last_name, email, phone, address, city, country, id_type, id_number, date_of_birth, nationality, preferences ? JSON.stringify(preferences) : null, notes, timestamp(), req.params.id]);
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// PREFERENCES
// ============================================

app.get('/api/guests/:id/preferences', (req, res) => {
  try {
    const guest = get(`SELECT preferences FROM guests WHERE id = ?`, [req.params.id]);
    res.json({ success: true, preferences: JSON.parse(guest?.preferences || '{}') });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/api/guests/:id/preferences', (req, res) => {
  try {
    const { preferences } = req.body;
    run(`UPDATE guests SET preferences = ?, updated_at = ? WHERE id = ?`, [JSON.stringify(preferences), timestamp(), req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// LOYALTY PROGRAM
// ============================================

app.get('/api/loyalty/tiers', (req, res) => {
  res.json({
    success: true,
    tiers: [
      { id: 'standard', name: 'Standard', min_points: 0, benefits: ['Basic member rates'] },
      { id: 'silver', name: 'Silver', min_points: 1000, benefits: ['5% discount', 'Late checkout'] },
      { id: 'gold', name: 'Gold', min_points: 5000, benefits: ['10% discount', 'Room upgrade', 'Free breakfast'] },
      { id: 'platinum', name: 'Platinum', min_points: 15000, benefits: ['15% discount', 'Suite upgrade', 'Airport transfer', 'Spa credit'] }
    ]
  });
});

app.get('/api/guests/:id/loyalty', (req, res) => {
  try {
    const guest = get(`SELECT id, first_name, last_name, loyalty_tier, loyalty_points FROM guests WHERE id = ?`, [req.params.id]);
    if (!guest) return res.status(404).json({ success: false, error: 'Guest not found' });
    
    // Calculate next tier
    const tiers = [
      { id: 'standard', min: 0 },
      { id: 'silver', min: 1000 },
      { id: 'gold', min: 5000 },
      { id: 'platinum', min: 15000 }
    ];
    const currentIdx = tiers.findIndex(t => t.id === guest.loyalty_tier);
    const nextTier = currentIdx < tiers.length - 1 ? tiers[currentIdx + 1] : null;
    
    res.json({
      success: true,
      loyalty: {
        ...guest,
        next_tier: nextTier?.id,
        points_to_next: nextTier ? nextTier.min - guest.loyalty_points : 0
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/guests/:id/loyalty/points', (req, res) => {
  try {
    const { points, reason } = req.body;
    const guest = get(`SELECT loyalty_points, loyalty_tier FROM guests WHERE id = ?`, [req.params.id]);
    if (!guest) return res.status(404).json({ success: false, error: 'Guest not found' });
    
    const newPoints = (guest.loyalty_points || 0) + points;
    
    // Update tier if needed
    let newTier = guest.loyalty_tier;
    if (newPoints >= 15000) newTier = 'platinum';
    else if (newPoints >= 5000) newTier = 'gold';
    else if (newPoints >= 1000) newTier = 'silver';
    else newTier = 'standard';
    
    run(`UPDATE guests SET loyalty_points = ?, loyalty_tier = ?, updated_at = ? WHERE id = ?`, 
      [newPoints, newTier, timestamp(), req.params.id]);
    
    res.json({ success: true, new_points: newPoints, new_tier: newTier, tier_changed: newTier !== guest.loyalty_tier });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/guests/:id/loyalty/redeem', (req, res) => {
  try {
    const { points, reward_description } = req.body;
    const guest = get(`SELECT loyalty_points FROM guests WHERE id = ?`, [req.params.id]);
    if (!guest) return res.status(404).json({ success: false, error: 'Guest not found' });
    
    if (guest.loyalty_points < points) {
      return res.status(400).json({ success: false, error: 'Insufficient points' });
    }
    
    const newPoints = guest.loyalty_points - points;
    run(`UPDATE guests SET loyalty_points = ?, updated_at = ? WHERE id = ?`, [newPoints, timestamp(), req.params.id]);
    
    res.json({ success: true, remaining_points: newPoints });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// GUEST FEEDBACK
// ============================================

app.get('/api/feedback', (req, res) => {
  try {
    const { guest_id, category, min_rating } = req.query;
    let sql = `
      SELECT f.*, g.first_name, g.last_name, r.confirmation_number
      FROM guest_feedback f
      LEFT JOIN guests g ON f.guest_id = g.id
      LEFT JOIN reservations r ON f.reservation_id = r.id
      WHERE 1=1
    `;
    const params = [];
    
    if (guest_id) { sql += ` AND f.guest_id = ?`; params.push(guest_id); }
    if (category) { sql += ` AND f.category = ?`; params.push(category); }
    if (min_rating) { sql += ` AND f.rating >= ?`; params.push(parseInt(min_rating)); }
    
    sql += ` ORDER BY f.created_at DESC`;
    const feedback = query(sql, params);
    
    res.json({ success: true, feedback });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/feedback', (req, res) => {
  try {
    const { reservation_id, guest_id, category, rating, comment } = req.body;
    const id = generateId();
    
    run(`
      INSERT INTO guest_feedback (id, reservation_id, guest_id, category, rating, comment, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, reservation_id, guest_id, category, rating, comment, timestamp()]);
    
    res.json({ success: true, feedback: { id } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/api/feedback/:id/respond', (req, res) => {
  try {
    const { response, responded_by } = req.body;
    run(`UPDATE guest_feedback SET response = ?, responded_by = ?, responded_at = ? WHERE id = ?`,
      [response, responded_by, timestamp(), req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// MERGE PROFILES
// ============================================

app.post('/api/guests/merge', (req, res) => {
  try {
    const { primary_id, secondary_id } = req.body;
    
    // Get both guests
    const primary = get(`SELECT * FROM guests WHERE id = ?`, [primary_id]);
    const secondary = get(`SELECT * FROM guests WHERE id = ?`, [secondary_id]);
    
    if (!primary || !secondary) {
      return res.status(404).json({ success: false, error: 'Guest not found' });
    }
    
    // Merge points
    const totalPoints = (primary.loyalty_points || 0) + (secondary.loyalty_points || 0);
    
    // Update all reservations from secondary to primary
    run(`UPDATE reservations SET guest_id = ? WHERE guest_id = ?`, [primary_id, secondary_id]);
    run(`UPDATE guest_folios SET guest_id = ? WHERE guest_id = ?`, [primary_id, secondary_id]);
    run(`UPDATE guest_feedback SET guest_id = ? WHERE guest_id = ?`, [primary_id, secondary_id]);
    run(`UPDATE payments SET guest_id = ? WHERE guest_id = ?`, [primary_id, secondary_id]);
    run(`UPDATE invoices SET guest_id = ? WHERE guest_id = ?`, [primary_id, secondary_id]);
    
    // Update primary with merged points and mark secondary as merged
    run(`UPDATE guests SET loyalty_points = ?, updated_at = ? WHERE id = ?`, [totalPoints, timestamp(), primary_id]);
    run(`UPDATE guests SET notes = 'MERGED INTO: ' || ?, updated_at = ? WHERE id = ?`, [primary_id, timestamp(), secondary_id]);
    
    res.json({ success: true, merged_points: totalPoints });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// DASHBOARD
// ============================================

app.get('/api/dashboard/stats', (req, res) => {
  try {
    const totalGuests = get(`SELECT COUNT(*) as count FROM guests`);
    const tierCounts = query(`SELECT loyalty_tier, COUNT(*) as count FROM guests GROUP BY loyalty_tier`);
    const avgRating = get(`SELECT AVG(rating) as avg FROM guest_feedback`);
    const recentFeedback = get(`SELECT COUNT(*) as count FROM guest_feedback WHERE DATE(created_at) >= DATE('now', '-7 days')`);
    
    res.json({
      success: true,
      stats: {
        total_guests: totalGuests?.count || 0,
        tier_distribution: tierCounts,
        avg_rating: Math.round((avgRating?.avg || 0) * 10) / 10,
        recent_feedback: recentFeedback?.count || 0
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
