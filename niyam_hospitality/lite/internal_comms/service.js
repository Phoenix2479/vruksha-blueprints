/**
 * Internal Communications Service - Niyam Hospitality (Max Lite)
 * Staff messaging, announcements, shift handovers
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8924;
const SERVICE_NAME = 'internal_comms';

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
  
  // Announcements
  db.run(`
    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      priority TEXT DEFAULT 'normal',
      target_departments TEXT,
      target_roles TEXT,
      author_id TEXT,
      author_name TEXT,
      is_pinned INTEGER DEFAULT 0,
      expires_at TEXT,
      publish_at TEXT,
      status TEXT DEFAULT 'published',
      read_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Announcement reads tracking
  db.run(`
    CREATE TABLE IF NOT EXISTS announcement_reads (
      id TEXT PRIMARY KEY,
      announcement_id TEXT NOT NULL,
      staff_id TEXT NOT NULL,
      read_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(announcement_id, staff_id)
    )
  `);
  
  // Messages (direct and group)
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT,
      content TEXT NOT NULL,
      message_type TEXT DEFAULT 'text',
      attachments TEXT,
      is_urgent INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Conversations
  db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      conversation_type TEXT DEFAULT 'direct',
      name TEXT,
      department TEXT,
      participants TEXT,
      last_message_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Conversation participants
  db.run(`
    CREATE TABLE IF NOT EXISTS conversation_participants (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      staff_id TEXT NOT NULL,
      joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_read_at TEXT,
      is_muted INTEGER DEFAULT 0,
      UNIQUE(conversation_id, staff_id)
    )
  `);
  
  // Shift handovers
  db.run(`
    CREATE TABLE IF NOT EXISTS shift_handovers (
      id TEXT PRIMARY KEY,
      department TEXT NOT NULL,
      shift_date TEXT NOT NULL,
      outgoing_shift TEXT NOT NULL,
      incoming_shift TEXT NOT NULL,
      handover_by TEXT NOT NULL,
      handover_by_name TEXT,
      received_by TEXT,
      received_by_name TEXT,
      summary TEXT,
      pending_tasks TEXT,
      important_notes TEXT,
      guest_issues TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      acknowledged_at TEXT
    )
  `);
  
  // Quick updates (status board)
  db.run(`
    CREATE TABLE IF NOT EXISTS quick_updates (
      id TEXT PRIMARY KEY,
      department TEXT,
      update_type TEXT DEFAULT 'info',
      content TEXT NOT NULL,
      posted_by TEXT,
      posted_by_name TEXT,
      expires_at TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Create default department channels
  const existingConvs = get(`SELECT COUNT(*) as count FROM conversations WHERE conversation_type = 'department'`);
  if (!existingConvs || existingConvs.count === 0) {
    const departments = ['Front Office', 'Housekeeping', 'F&B', 'Kitchen', 'Maintenance', 'Management'];
    for (const dept of departments) {
      run(`INSERT INTO conversations (id, conversation_type, name, department, created_at) VALUES (?, 'department', ?, ?, ?)`,
        [generateId(), `${dept} Channel`, dept, timestamp()]);
    }
  }
  
  return db;
}

// ============================================
// ANNOUNCEMENTS
// ============================================

app.get('/announcements', async (req, res) => {
  try {
    await ensureTables();
    const { status, department, priority, staff_id } = req.query;
    
    let sql = `SELECT * FROM announcements WHERE 1=1`;
    const params = [];
    
    if (status) {
      sql += ` AND status = ?`;
      params.push(status);
    } else {
      sql += ` AND status = 'published' AND (expires_at IS NULL OR expires_at > datetime('now'))`;
    }
    
    if (department) {
      sql += ` AND (target_departments IS NULL OR target_departments LIKE ?)`;
      params.push(`%${department}%`);
    }
    
    if (priority) {
      sql += ` AND priority = ?`;
      params.push(priority);
    }
    
    sql += ` ORDER BY is_pinned DESC, priority DESC, created_at DESC`;
    
    let announcements = query(sql, params);
    
    // If staff_id provided, mark which ones are read
    if (staff_id) {
      const reads = query(`SELECT announcement_id FROM announcement_reads WHERE staff_id = ?`, [staff_id]);
      const readIds = new Set(reads.map(r => r.announcement_id));
      announcements = announcements.map(a => ({ ...a, is_read: readIds.has(a.id) }));
    }
    
    res.json({ success: true, announcements });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/announcements', async (req, res) => {
  try {
    await ensureTables();
    const { title, content, priority, target_departments, target_roles, author_id, author_name, is_pinned, expires_at, publish_at } = req.body;
    
    const id = generateId();
    const status = publish_at && new Date(publish_at) > new Date() ? 'scheduled' : 'published';
    
    run(`
      INSERT INTO announcements (id, title, content, priority, target_departments, target_roles, author_id, author_name, is_pinned, expires_at, publish_at, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, title, content, priority || 'normal', JSON.stringify(target_departments || []), JSON.stringify(target_roles || []), author_id, author_name, is_pinned ? 1 : 0, expires_at, publish_at, status, timestamp()]);
    
    res.json({ success: true, announcement: { id, title, status } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/announcements/:id/read', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { staff_id } = req.body;
    
    try {
      run(`INSERT INTO announcement_reads (id, announcement_id, staff_id, read_at) VALUES (?, ?, ?, ?)`,
        [generateId(), id, staff_id, timestamp()]);
      run(`UPDATE announcements SET read_count = read_count + 1 WHERE id = ?`, [id]);
    } catch (e) { /* already read */ }
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.delete('/announcements/:id', async (req, res) => {
  try {
    await ensureTables();
    run(`UPDATE announcements SET status = 'archived' WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// CONVERSATIONS / MESSAGING
// ============================================

app.get('/conversations', async (req, res) => {
  try {
    await ensureTables();
    const { staff_id, type } = req.query;
    
    let sql = `SELECT c.* FROM conversations c`;
    const params = [];
    
    if (staff_id) {
      sql += ` JOIN conversation_participants cp ON c.id = cp.conversation_id WHERE cp.staff_id = ?`;
      params.push(staff_id);
    } else {
      sql += ` WHERE 1=1`;
    }
    
    if (type) {
      sql += ` AND c.conversation_type = ?`;
      params.push(type);
    }
    
    sql += ` ORDER BY c.last_message_at DESC NULLS LAST`;
    
    const conversations = query(sql, params);
    
    // Get unread counts if staff_id provided
    if (staff_id) {
      for (const conv of conversations) {
        const participant = get(`SELECT last_read_at FROM conversation_participants WHERE conversation_id = ? AND staff_id = ?`, [conv.id, staff_id]);
        const unreadCount = get(`SELECT COUNT(*) as count FROM messages WHERE conversation_id = ? AND created_at > COALESCE(?, '1970-01-01')`, [conv.id, participant?.last_read_at]);
        conv.unread_count = unreadCount?.count || 0;
      }
    }
    
    res.json({ success: true, conversations });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/conversations', async (req, res) => {
  try {
    await ensureTables();
    const { conversation_type, name, department, participants } = req.body;
    
    const id = generateId();
    run(`INSERT INTO conversations (id, conversation_type, name, department, participants, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, conversation_type || 'direct', name, department, JSON.stringify(participants || []), timestamp()]);
    
    // Add participants
    for (const staffId of participants || []) {
      run(`INSERT INTO conversation_participants (id, conversation_id, staff_id, joined_at) VALUES (?, ?, ?, ?)`,
        [generateId(), id, staffId, timestamp()]);
    }
    
    res.json({ success: true, conversation: { id, name } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// MESSAGES
// ============================================

app.get('/conversations/:conversationId/messages', async (req, res) => {
  try {
    await ensureTables();
    const { conversationId } = req.params;
    const { limit = 50, before } = req.query;
    
    let sql = `SELECT * FROM messages WHERE conversation_id = ?`;
    const params = [conversationId];
    
    if (before) {
      sql += ` AND created_at < ?`;
      params.push(before);
    }
    
    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(parseInt(limit));
    
    const messages = query(sql, params).reverse();
    res.json({ success: true, messages });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/conversations/:conversationId/messages', async (req, res) => {
  try {
    await ensureTables();
    const { conversationId } = req.params;
    const { sender_id, sender_name, content, message_type, attachments, is_urgent } = req.body;
    
    const id = generateId();
    run(`
      INSERT INTO messages (id, conversation_id, sender_id, sender_name, content, message_type, attachments, is_urgent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, conversationId, sender_id, sender_name, content, message_type || 'text', JSON.stringify(attachments || []), is_urgent ? 1 : 0, timestamp()]);
    
    // Update conversation last_message_at
    run(`UPDATE conversations SET last_message_at = ? WHERE id = ?`, [timestamp(), conversationId]);
    
    // Update sender's last_read_at
    run(`UPDATE conversation_participants SET last_read_at = ? WHERE conversation_id = ? AND staff_id = ?`,
      [timestamp(), conversationId, sender_id]);
    
    res.json({ success: true, message: { id, content } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/conversations/:conversationId/read', async (req, res) => {
  try {
    await ensureTables();
    const { conversationId } = req.params;
    const { staff_id } = req.body;
    
    run(`UPDATE conversation_participants SET last_read_at = ? WHERE conversation_id = ? AND staff_id = ?`,
      [timestamp(), conversationId, staff_id]);
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// SHIFT HANDOVERS
// ============================================

app.get('/handovers', async (req, res) => {
  try {
    await ensureTables();
    const { department, status, date } = req.query;
    
    let sql = `SELECT * FROM shift_handovers WHERE 1=1`;
    const params = [];
    
    if (department) { sql += ` AND department = ?`; params.push(department); }
    if (status) { sql += ` AND status = ?`; params.push(status); }
    if (date) { sql += ` AND shift_date = ?`; params.push(date); }
    
    sql += ` ORDER BY shift_date DESC, created_at DESC`;
    
    const handovers = query(sql, params);
    res.json({ success: true, handovers: handovers.map(h => ({ ...h, pending_tasks: JSON.parse(h.pending_tasks || '[]'), guest_issues: JSON.parse(h.guest_issues || '[]') })) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/handovers', async (req, res) => {
  try {
    await ensureTables();
    const { department, shift_date, outgoing_shift, incoming_shift, handover_by, handover_by_name, summary, pending_tasks, important_notes, guest_issues } = req.body;
    
    const id = generateId();
    run(`
      INSERT INTO shift_handovers (id, department, shift_date, outgoing_shift, incoming_shift, handover_by, handover_by_name, summary, pending_tasks, important_notes, guest_issues, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `, [id, department, shift_date, outgoing_shift, incoming_shift, handover_by, handover_by_name, summary, JSON.stringify(pending_tasks || []), important_notes, JSON.stringify(guest_issues || []), timestamp()]);
    
    res.json({ success: true, handover: { id } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/handovers/:id/acknowledge', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { received_by, received_by_name } = req.body;
    
    run(`UPDATE shift_handovers SET status = 'acknowledged', received_by = ?, received_by_name = ?, acknowledged_at = ? WHERE id = ?`,
      [received_by, received_by_name, timestamp(), id]);
    
    res.json({ success: true, message: 'Handover acknowledged' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// QUICK UPDATES
// ============================================

app.get('/updates', async (req, res) => {
  try {
    await ensureTables();
    const { department } = req.query;
    
    let sql = `SELECT * FROM quick_updates WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))`;
    const params = [];
    
    if (department) {
      sql += ` AND (department IS NULL OR department = ?)`;
      params.push(department);
    }
    
    sql += ` ORDER BY created_at DESC`;
    
    const updates = query(sql, params);
    res.json({ success: true, updates });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/updates', async (req, res) => {
  try {
    await ensureTables();
    const { department, update_type, content, posted_by, posted_by_name, expires_at } = req.body;
    
    const id = generateId();
    run(`
      INSERT INTO quick_updates (id, department, update_type, content, posted_by, posted_by_name, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, department, update_type || 'info', content, posted_by, posted_by_name, expires_at, timestamp()]);
    
    res.json({ success: true, update: { id } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.delete('/updates/:id', async (req, res) => {
  try {
    await ensureTables();
    run(`UPDATE quick_updates SET is_active = 0 WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
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
