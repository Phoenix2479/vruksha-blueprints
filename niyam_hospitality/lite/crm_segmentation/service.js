/**
 * CRM & Segmentation Service - Niyam Hospitality (Max Lite)
 * Guest CRM with segmentation, campaigns, personalization
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8921;
const SERVICE_NAME = 'crm_segmentation';

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
  
  // Guest segments
  db.run(`
    CREATE TABLE IF NOT EXISTS guest_segments (
      id TEXT PRIMARY KEY,
      segment_code TEXT NOT NULL UNIQUE,
      segment_name TEXT NOT NULL,
      description TEXT,
      color TEXT DEFAULT '#3b82f6',
      priority INTEGER DEFAULT 100,
      criteria TEXT,
      auto_assign INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Guest notes/interactions
  db.run(`
    CREATE TABLE IF NOT EXISTS guest_notes (
      id TEXT PRIMARY KEY,
      guest_id TEXT NOT NULL,
      note_type TEXT DEFAULT 'general',
      title TEXT,
      content TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Guest interactions/touchpoints
  db.run(`
    CREATE TABLE IF NOT EXISTS guest_interactions (
      id TEXT PRIMARY KEY,
      guest_id TEXT NOT NULL,
      interaction_type TEXT NOT NULL,
      channel TEXT DEFAULT 'direct',
      subject TEXT,
      details TEXT,
      outcome TEXT,
      staff_id TEXT,
      interaction_date TEXT DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Marketing campaigns
  db.run(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      campaign_type TEXT DEFAULT 'email',
      status TEXT DEFAULT 'draft',
      target_segments TEXT,
      content TEXT,
      schedule_date TEXT,
      sent_count INTEGER DEFAULT 0,
      open_count INTEGER DEFAULT 0,
      click_count INTEGER DEFAULT 0,
      conversion_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Campaign recipients
  db.run(`
    CREATE TABLE IF NOT EXISTS campaign_recipients (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      guest_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      sent_at TEXT,
      opened_at TEXT,
      clicked_at TEXT,
      converted_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Guest tags
  db.run(`
    CREATE TABLE IF NOT EXISTS guest_tags (
      id TEXT PRIMARY KEY,
      guest_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(guest_id, tag)
    )
  `);
  
  // Add segment_id to guests if not exists (alter table workaround for SQLite)
  try {
    db.run(`ALTER TABLE guests ADD COLUMN segment_id TEXT`);
  } catch (e) { /* column exists */ }
  
  return db;
}

// ============================================
// GUEST PROFILES (Enhanced CRM View)
// ============================================

app.get('/guests', async (req, res) => {
  try {
    await ensureTables();
    const { segment, search, limit = 50, offset = 0 } = req.query;
    
    let sql = `
      SELECT g.*, s.segment_name, s.segment_code, s.color as segment_color,
        (SELECT COUNT(*) FROM reservations WHERE guest_id = g.id) as total_bookings,
        (SELECT SUM(total_amount) FROM reservations WHERE guest_id = g.id AND status = 'checked_out') as lifetime_value,
        (SELECT MAX(check_out_date) FROM reservations WHERE guest_id = g.id AND status = 'checked_out') as last_stay
      FROM guests g
      LEFT JOIN guest_segments s ON g.segment_id = s.id
      WHERE 1=1
    `;
    const params = [];
    
    if (segment) {
      sql += ` AND s.segment_code = ?`;
      params.push(segment);
    }
    if (search) {
      sql += ` AND (g.first_name LIKE ? OR g.last_name LIKE ? OR g.email LIKE ? OR g.phone LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    sql += ` ORDER BY g.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));
    
    const guests = query(sql, params);
    const total = get(`SELECT COUNT(*) as count FROM guests`);
    
    res.json({ 
      success: true, 
      guests,
      total: total?.count || 0,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/guests/:id', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    
    const guest = get(`
      SELECT g.*, s.segment_name, s.segment_code,
        (SELECT COUNT(*) FROM reservations WHERE guest_id = g.id) as total_bookings,
        (SELECT SUM(total_amount) FROM reservations WHERE guest_id = g.id AND status = 'checked_out') as lifetime_value,
        (SELECT AVG(total_amount) FROM reservations WHERE guest_id = g.id AND status = 'checked_out') as avg_booking_value
      FROM guests g
      LEFT JOIN guest_segments s ON g.segment_id = s.id
      WHERE g.id = ?
    `, [id]);
    
    if (!guest) {
      return res.status(404).json({ success: false, error: 'Guest not found' });
    }
    
    const bookings = query(`
      SELECT r.id, r.check_in_date, r.check_out_date, r.status, r.total_amount, rm.room_number, rt.name as room_type
      FROM reservations r
      LEFT JOIN rooms rm ON r.room_id = rm.id
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      WHERE r.guest_id = ?
      ORDER BY r.check_in_date DESC LIMIT 10
    `, [id]);
    
    const notes = query(`SELECT * FROM guest_notes WHERE guest_id = ? ORDER BY created_at DESC LIMIT 20`, [id]);
    const interactions = query(`SELECT * FROM guest_interactions WHERE guest_id = ? ORDER BY interaction_date DESC LIMIT 20`, [id]);
    const tags = query(`SELECT tag FROM guest_tags WHERE guest_id = ?`, [id]).map(t => t.tag);
    
    res.json({
      success: true,
      guest: { ...guest, tags },
      bookings,
      notes,
      interactions
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Assign segment to guest
app.post('/guests/:id/segment', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { segment_id } = req.body;
    
    run(`UPDATE guests SET segment_id = ?, updated_at = ? WHERE id = ?`, [segment_id, timestamp(), id]);
    res.json({ success: true, message: 'Segment assigned' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Add note
app.post('/guests/:id/notes', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { note_type, title, content, created_by } = req.body;
    
    const noteId = generateId();
    run(`INSERT INTO guest_notes (id, guest_id, note_type, title, content, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [noteId, id, note_type || 'general', title, content, created_by, timestamp()]);
    
    res.json({ success: true, note: { id: noteId } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Add interaction
app.post('/guests/:id/interactions', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { interaction_type, channel, subject, details, outcome, staff_id } = req.body;
    
    const interactionId = generateId();
    run(`INSERT INTO guest_interactions (id, guest_id, interaction_type, channel, subject, details, outcome, staff_id, interaction_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [interactionId, id, interaction_type, channel || 'direct', subject, details, outcome, staff_id, timestamp(), timestamp()]);
    
    res.json({ success: true, interaction: { id: interactionId } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Tags
app.post('/guests/:id/tags', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { tags } = req.body;
    
    for (const tag of tags || []) {
      try {
        run(`INSERT INTO guest_tags (id, guest_id, tag, created_at) VALUES (?, ?, ?, ?)`,
          [generateId(), id, tag, timestamp()]);
      } catch (e) { /* duplicate */ }
    }
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.delete('/guests/:id/tags/:tag', async (req, res) => {
  try {
    await ensureTables();
    run(`DELETE FROM guest_tags WHERE guest_id = ? AND tag = ?`, [req.params.id, req.params.tag]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// SEGMENTS
// ============================================

app.get('/segments', async (req, res) => {
  try {
    await ensureTables();
    
    const segments = query(`
      SELECT s.*, (SELECT COUNT(*) FROM guests WHERE segment_id = s.id) as guest_count
      FROM guest_segments s
      WHERE s.active = 1
      ORDER BY s.priority ASC, s.segment_name
    `);
    
    res.json({ success: true, segments });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/segments', async (req, res) => {
  try {
    await ensureTables();
    const { segment_code, segment_name, description, color, priority, criteria, auto_assign } = req.body;
    
    const id = generateId();
    run(`
      INSERT INTO guest_segments (id, segment_code, segment_name, description, color, priority, criteria, auto_assign, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, segment_code, segment_name, description, color || '#3b82f6', priority || 100, JSON.stringify(criteria || {}), auto_assign ? 1 : 0, timestamp()]);
    
    res.json({ success: true, segment: { id, segment_code, segment_name } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/segments/:id', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { segment_code, segment_name, description, color, priority, criteria, auto_assign } = req.body;
    
    run(`
      UPDATE guest_segments SET
        segment_code = COALESCE(?, segment_code),
        segment_name = COALESCE(?, segment_name),
        description = COALESCE(?, description),
        color = COALESCE(?, color),
        priority = COALESCE(?, priority),
        criteria = COALESCE(?, criteria),
        auto_assign = COALESCE(?, auto_assign),
        updated_at = ?
      WHERE id = ?
    `, [segment_code, segment_name, description, color, priority, criteria ? JSON.stringify(criteria) : null, auto_assign !== undefined ? (auto_assign ? 1 : 0) : null, timestamp(), id]);
    
    res.json({ success: true, message: 'Segment updated' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.delete('/segments/:id', async (req, res) => {
  try {
    await ensureTables();
    run(`UPDATE guest_segments SET active = 0 WHERE id = ?`, [req.params.id]);
    run(`UPDATE guests SET segment_id = NULL WHERE segment_id = ?`, [req.params.id]);
    res.json({ success: true, message: 'Segment deleted' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// AUTO-SEGMENTATION
// ============================================

app.post('/segments/auto-assign', async (req, res) => {
  try {
    await ensureTables();
    
    const segments = query(`SELECT * FROM guest_segments WHERE auto_assign = 1 AND active = 1 ORDER BY priority ASC`);
    const guests = query(`SELECT g.id, (SELECT COUNT(*) FROM reservations WHERE guest_id = g.id) as total_bookings, (SELECT SUM(total_amount) FROM reservations WHERE guest_id = g.id AND status = 'checked_out') as lifetime_value FROM guests g`);
    
    let assigned = 0;
    
    for (const guest of guests) {
      for (const segment of segments) {
        const criteria = JSON.parse(segment.criteria || '{}');
        let matches = true;
        
        if (criteria.min_stays && (guest.total_bookings || 0) < criteria.min_stays) matches = false;
        if (criteria.min_lifetime_value && (guest.lifetime_value || 0) < criteria.min_lifetime_value) matches = false;
        
        if (matches) {
          run(`UPDATE guests SET segment_id = ? WHERE id = ?`, [segment.id, guest.id]);
          assigned++;
          break;
        }
      }
    }
    
    res.json({ success: true, assigned_count: assigned });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// CAMPAIGNS
// ============================================

app.get('/campaigns', async (req, res) => {
  try {
    await ensureTables();
    const { status } = req.query;
    
    let sql = `SELECT * FROM campaigns WHERE 1=1`;
    const params = [];
    
    if (status) {
      sql += ` AND status = ?`;
      params.push(status);
    }
    
    sql += ` ORDER BY created_at DESC`;
    
    const campaigns = query(sql, params);
    res.json({ success: true, campaigns });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/campaigns/:id', async (req, res) => {
  try {
    await ensureTables();
    const campaign = get(`SELECT * FROM campaigns WHERE id = ?`, [req.params.id]);
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }
    
    const recipients = query(`
      SELECT cr.*, g.first_name, g.last_name, g.email
      FROM campaign_recipients cr
      JOIN guests g ON cr.guest_id = g.id
      WHERE cr.campaign_id = ?
    `, [req.params.id]);
    
    res.json({ success: true, campaign: { ...campaign, target_segments: JSON.parse(campaign.target_segments || '[]') }, recipients });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/campaigns', async (req, res) => {
  try {
    await ensureTables();
    const { name, description, campaign_type, target_segments, content, schedule_date } = req.body;
    
    const id = generateId();
    run(`
      INSERT INTO campaigns (id, name, description, campaign_type, target_segments, content, schedule_date, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?)
    `, [id, name, description, campaign_type || 'email', JSON.stringify(target_segments || []), content, schedule_date, timestamp()]);
    
    res.json({ success: true, campaign: { id, name, status: 'draft' } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/campaigns/:id/launch', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    
    const campaign = get(`SELECT * FROM campaigns WHERE id = ?`, [id]);
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }
    
    const targetSegments = JSON.parse(campaign.target_segments || '[]');
    
    // Get target guests
    let guestSql = `SELECT id FROM guests WHERE 1=1`;
    if (targetSegments.length > 0) {
      guestSql += ` AND segment_id IN (SELECT id FROM guest_segments WHERE segment_code IN (${targetSegments.map(() => '?').join(',')}))`;
    }
    
    const guests = query(guestSql, targetSegments);
    
    // Add recipients
    for (const guest of guests) {
      run(`INSERT INTO campaign_recipients (id, campaign_id, guest_id, status, created_at) VALUES (?, ?, ?, 'pending', ?)`,
        [generateId(), id, guest.id, timestamp()]);
    }
    
    // Update campaign
    run(`UPDATE campaigns SET status = 'active', sent_count = ?, updated_at = ? WHERE id = ?`,
      [guests.length, timestamp(), id]);
    
    res.json({ success: true, message: 'Campaign launched', recipients: guests.length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// ANALYTICS
// ============================================

app.get('/analytics/segments', async (req, res) => {
  try {
    await ensureTables();
    
    const segmentStats = query(`
      SELECT s.segment_code, s.segment_name, s.color,
        COUNT(g.id) as guest_count,
        SUM((SELECT COUNT(*) FROM reservations WHERE guest_id = g.id)) as total_bookings,
        SUM((SELECT SUM(total_amount) FROM reservations WHERE guest_id = g.id AND status = 'checked_out')) as total_revenue
      FROM guest_segments s
      LEFT JOIN guests g ON g.segment_id = s.id
      WHERE s.active = 1
      GROUP BY s.id
      ORDER BY total_revenue DESC
    `);
    
    res.json({ success: true, segment_stats: segmentStats });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/analytics/rfm', async (req, res) => {
  try {
    await ensureTables();
    
    // RFM Analysis - Recency, Frequency, Monetary
    const guests = query(`
      SELECT g.id, g.first_name, g.last_name,
        (SELECT MAX(check_out_date) FROM reservations WHERE guest_id = g.id) as last_stay,
        (SELECT COUNT(*) FROM reservations WHERE guest_id = g.id) as frequency,
        (SELECT SUM(total_amount) FROM reservations WHERE guest_id = g.id AND status = 'checked_out') as monetary
      FROM guests g
    `);
    
    const today = new Date();
    const rfmData = guests.map(g => {
      const lastStay = g.last_stay ? new Date(g.last_stay) : null;
      const daysSinceStay = lastStay ? Math.floor((today - lastStay) / (1000 * 60 * 60 * 24)) : 999;
      
      // Simple RFM scoring (1-5)
      const recencyScore = daysSinceStay <= 30 ? 5 : daysSinceStay <= 90 ? 4 : daysSinceStay <= 180 ? 3 : daysSinceStay <= 365 ? 2 : 1;
      const frequencyScore = (g.frequency || 0) >= 10 ? 5 : (g.frequency || 0) >= 5 ? 4 : (g.frequency || 0) >= 3 ? 3 : (g.frequency || 0) >= 2 ? 2 : 1;
      const monetaryScore = (g.monetary || 0) >= 100000 ? 5 : (g.monetary || 0) >= 50000 ? 4 : (g.monetary || 0) >= 20000 ? 3 : (g.monetary || 0) >= 5000 ? 2 : 1;
      
      return {
        guest_id: g.id,
        name: `${g.first_name || ''} ${g.last_name || ''}`.trim(),
        recency: recencyScore,
        frequency: frequencyScore,
        monetary: monetaryScore,
        rfm_score: recencyScore + frequencyScore + monetaryScore,
        segment: recencyScore + frequencyScore + monetaryScore >= 12 ? 'Champions' :
                 recencyScore >= 4 && frequencyScore >= 4 ? 'Loyal' :
                 recencyScore >= 4 ? 'Potential Loyalist' :
                 recencyScore <= 2 && frequencyScore >= 3 ? 'At Risk' :
                 recencyScore <= 2 ? 'Lost' : 'Regular'
      };
    });
    
    // Summary by RFM segment
    const summary = {};
    rfmData.forEach(r => {
      if (!summary[r.segment]) summary[r.segment] = { count: 0, avg_score: 0 };
      summary[r.segment].count++;
      summary[r.segment].avg_score += r.rfm_score;
    });
    Object.keys(summary).forEach(k => {
      summary[k].avg_score = Math.round((summary[k].avg_score / summary[k].count) * 10) / 10;
    });
    
    res.json({ success: true, rfm_data: rfmData.slice(0, 100), summary });
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
