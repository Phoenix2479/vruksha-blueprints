/**
 * Guest Messaging Service - Niyam Hospitality (Max Lite)
 * Automated guest communication via SMS, WhatsApp, Email
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8968;
const SERVICE_NAME = 'guest_messaging';

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
  
  // Message templates
  db.run(`
    CREATE TABLE IF NOT EXISTS message_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      channel TEXT DEFAULT 'email',
      trigger_event TEXT,
      category TEXT,
      subject TEXT,
      body TEXT NOT NULL,
      variables TEXT,
      is_active INTEGER DEFAULT 1,
      send_time_offset INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Sent messages log
  db.run(`
    CREATE TABLE IF NOT EXISTS sent_messages (
      id TEXT PRIMARY KEY,
      template_id TEXT,
      guest_id TEXT,
      reservation_id TEXT,
      channel TEXT NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT,
      body TEXT,
      variables_used TEXT,
      status TEXT DEFAULT 'pending',
      sent_at TEXT,
      delivered_at TEXT,
      opened_at TEXT,
      clicked_at TEXT,
      failed_reason TEXT,
      external_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Automation rules
  db.run(`
    CREATE TABLE IF NOT EXISTS messaging_automations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      trigger_event TEXT NOT NULL,
      template_id TEXT NOT NULL,
      channel TEXT DEFAULT 'email',
      delay_minutes INTEGER DEFAULT 0,
      conditions TEXT,
      is_active INTEGER DEFAULT 1,
      send_count INTEGER DEFAULT 0,
      last_triggered TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Scheduled messages
  db.run(`
    CREATE TABLE IF NOT EXISTS scheduled_messages (
      id TEXT PRIMARY KEY,
      automation_id TEXT,
      template_id TEXT,
      guest_id TEXT NOT NULL,
      reservation_id TEXT,
      channel TEXT NOT NULL,
      recipient TEXT NOT NULL,
      scheduled_for TEXT NOT NULL,
      variables TEXT,
      status TEXT DEFAULT 'scheduled',
      sent_message_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Guest communication preferences
  db.run(`
    CREATE TABLE IF NOT EXISTS guest_comm_preferences (
      id TEXT PRIMARY KEY,
      guest_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      opt_in INTEGER DEFAULT 1,
      preferred_language TEXT DEFAULT 'en',
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(guest_id, channel)
    )
  `);
  
  // Seed default templates
  const existingTemplates = get(`SELECT COUNT(*) as count FROM message_templates`);
  if (!existingTemplates || existingTemplates.count === 0) {
    const defaultTemplates = [
      { name: 'Booking Confirmation', channel: 'email', trigger: 'booking_confirmed', subject: 'Your reservation is confirmed - {{confirmation_number}}', body: 'Dear {{guest_name}},\n\nThank you for your reservation!\n\nConfirmation: {{confirmation_number}}\nCheck-in: {{check_in_date}}\nCheck-out: {{check_out_date}}\nRoom: {{room_type}}\n\nWe look forward to welcoming you!' },
      { name: 'Pre-Arrival', channel: 'email', trigger: 'pre_arrival', subject: 'Your stay is approaching - {{property_name}}', body: 'Dear {{guest_name}},\n\nWe\'re excited to welcome you in {{days_until_arrival}} days!\n\nCheck-in time: 3:00 PM\nRoom: {{room_type}}\n\nIs there anything we can prepare for your arrival?' },
      { name: 'Check-In Welcome', channel: 'sms', trigger: 'checked_in', subject: null, body: 'Welcome to {{property_name}}, {{guest_name}}! Your room {{room_number}} is ready. WiFi: {{wifi_password}}. Need help? Reply to this message.' },
      { name: 'Post-Stay Feedback', channel: 'email', trigger: 'checked_out', subject: 'How was your stay?', body: 'Dear {{guest_name}},\n\nThank you for staying with us! We\'d love to hear about your experience.\n\nPlease take a moment to share your feedback: {{feedback_link}}\n\nWe hope to see you again soon!' }
    ];
    
    for (const t of defaultTemplates) {
      run(`INSERT INTO message_templates (id, name, channel, trigger_event, subject, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), t.name, t.channel, t.trigger, t.subject, t.body, timestamp()]);
    }
  }
  
  return db;
}

// ============================================
// MESSAGE TEMPLATES
// ============================================

app.get('/templates', async (req, res) => {
  try {
    await ensureTables();
    const { channel, trigger, active_only } = req.query;
    
    let sql = `SELECT * FROM message_templates WHERE 1=1`;
    const params = [];
    
    if (channel) { sql += ` AND channel = ?`; params.push(channel); }
    if (trigger) { sql += ` AND trigger_event = ?`; params.push(trigger); }
    if (active_only === 'true') { sql += ` AND is_active = 1`; }
    
    sql += ` ORDER BY name`;
    
    const templates = query(sql, params);
    res.json({ success: true, templates });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/templates/:id', async (req, res) => {
  try {
    await ensureTables();
    const template = get(`SELECT * FROM message_templates WHERE id = ?`, [req.params.id]);
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    res.json({ success: true, template });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/templates', async (req, res) => {
  try {
    await ensureTables();
    const { name, channel, trigger_event, category, subject, body, variables, send_time_offset } = req.body;
    
    const id = generateId();
    run(`
      INSERT INTO message_templates (id, name, channel, trigger_event, category, subject, body, variables, send_time_offset, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, name, channel || 'email', trigger_event, category, subject, body, JSON.stringify(variables || []), send_time_offset || 0, timestamp()]);
    
    res.json({ success: true, template: { id, name } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/templates/:id', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { name, channel, trigger_event, category, subject, body, variables, is_active, send_time_offset } = req.body;
    
    run(`
      UPDATE message_templates SET
        name = COALESCE(?, name),
        channel = COALESCE(?, channel),
        trigger_event = COALESCE(?, trigger_event),
        category = COALESCE(?, category),
        subject = COALESCE(?, subject),
        body = COALESCE(?, body),
        variables = COALESCE(?, variables),
        is_active = COALESCE(?, is_active),
        send_time_offset = COALESCE(?, send_time_offset),
        updated_at = ?
      WHERE id = ?
    `, [name, channel, trigger_event, category, subject, body, variables ? JSON.stringify(variables) : null, is_active, send_time_offset, timestamp(), id]);
    
    res.json({ success: true, message: 'Template updated' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// SEND MESSAGES
// ============================================

function replaceVariables(text, variables) {
  if (!text) return text;
  let result = text;
  for (const [key, value] of Object.entries(variables || {})) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
  }
  return result;
}

app.post('/send', async (req, res) => {
  try {
    await ensureTables();
    const { template_id, guest_id, reservation_id, channel, recipient, variables, subject, body } = req.body;
    
    let finalSubject = subject;
    let finalBody = body;
    let finalChannel = channel;
    
    // If template provided, use it
    if (template_id) {
      const template = get(`SELECT * FROM message_templates WHERE id = ?`, [template_id]);
      if (template) {
        finalSubject = replaceVariables(template.subject, variables);
        finalBody = replaceVariables(template.body, variables);
        finalChannel = template.channel;
      }
    } else {
      finalSubject = replaceVariables(subject, variables);
      finalBody = replaceVariables(body, variables);
    }
    
    // Check opt-in
    if (guest_id) {
      const prefs = get(`SELECT * FROM guest_comm_preferences WHERE guest_id = ? AND channel = ?`, [guest_id, finalChannel]);
      if (prefs && prefs.opt_in === 0) {
        return res.status(400).json({ success: false, error: 'Guest has opted out of this channel' });
      }
    }
    
    const messageId = generateId();
    
    // In production, this would call actual SMS/Email provider
    // For lite, we simulate by marking as sent
    run(`
      INSERT INTO sent_messages (id, template_id, guest_id, reservation_id, channel, recipient, subject, body, variables_used, status, sent_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?)
    `, [messageId, template_id, guest_id, reservation_id, finalChannel, recipient, finalSubject, finalBody, JSON.stringify(variables || {}), timestamp(), timestamp()]);
    
    res.json({
      success: true,
      message: {
        id: messageId,
        channel: finalChannel,
        recipient,
        status: 'sent'
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/send-bulk', async (req, res) => {
  try {
    await ensureTables();
    const { template_id, recipients } = req.body;
    
    const template = get(`SELECT * FROM message_templates WHERE id = ?`, [template_id]);
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    
    let sentCount = 0;
    let failedCount = 0;
    
    for (const r of recipients || []) {
      // Check opt-in
      if (r.guest_id) {
        const prefs = get(`SELECT * FROM guest_comm_preferences WHERE guest_id = ? AND channel = ? AND opt_in = 0`, [r.guest_id, template.channel]);
        if (prefs) {
          failedCount++;
          continue;
        }
      }
      
      const messageId = generateId();
      const finalSubject = replaceVariables(template.subject, r.variables);
      const finalBody = replaceVariables(template.body, r.variables);
      
      run(`
        INSERT INTO sent_messages (id, template_id, guest_id, reservation_id, channel, recipient, subject, body, variables_used, status, sent_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?)
      `, [messageId, template_id, r.guest_id, r.reservation_id, template.channel, r.recipient, finalSubject, finalBody, JSON.stringify(r.variables || {}), timestamp(), timestamp()]);
      sentCount++;
    }
    
    res.json({ success: true, sent: sentCount, failed: failedCount });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// MESSAGE HISTORY
// ============================================

app.get('/messages', async (req, res) => {
  try {
    await ensureTables();
    const { guest_id, reservation_id, channel, status, limit = 50 } = req.query;
    
    let sql = `SELECT * FROM sent_messages WHERE 1=1`;
    const params = [];
    
    if (guest_id) { sql += ` AND guest_id = ?`; params.push(guest_id); }
    if (reservation_id) { sql += ` AND reservation_id = ?`; params.push(reservation_id); }
    if (channel) { sql += ` AND channel = ?`; params.push(channel); }
    if (status) { sql += ` AND status = ?`; params.push(status); }
    
    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(parseInt(limit));
    
    const messages = query(sql, params);
    res.json({ success: true, messages });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/messages/:id', async (req, res) => {
  try {
    await ensureTables();
    const message = get(`SELECT * FROM sent_messages WHERE id = ?`, [req.params.id]);
    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }
    res.json({ success: true, message });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Track delivery events
app.post('/messages/:id/track', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { event } = req.body; // delivered, opened, clicked, failed
    
    const field = {
      delivered: 'delivered_at',
      opened: 'opened_at',
      clicked: 'clicked_at'
    }[event];
    
    if (field) {
      run(`UPDATE sent_messages SET ${field} = ?, status = ? WHERE id = ?`, [timestamp(), event, id]);
    } else if (event === 'failed') {
      run(`UPDATE sent_messages SET status = 'failed', failed_reason = ? WHERE id = ?`, [req.body.reason, id]);
    }
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// AUTOMATIONS
// ============================================

app.get('/automations', async (req, res) => {
  try {
    await ensureTables();
    const { active_only } = req.query;
    
    let sql = `
      SELECT a.*, t.name as template_name
      FROM messaging_automations a
      LEFT JOIN message_templates t ON a.template_id = t.id
      WHERE 1=1
    `;
    
    if (active_only === 'true') { sql += ` AND a.is_active = 1`; }
    sql += ` ORDER BY a.trigger_event, a.name`;
    
    const automations = query(sql);
    res.json({ success: true, automations });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/automations', async (req, res) => {
  try {
    await ensureTables();
    const { name, trigger_event, template_id, channel, delay_minutes, conditions } = req.body;
    
    const id = generateId();
    run(`
      INSERT INTO messaging_automations (id, name, trigger_event, template_id, channel, delay_minutes, conditions, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `, [id, name, trigger_event, template_id, channel || 'email', delay_minutes || 0, JSON.stringify(conditions || {}), timestamp()]);
    
    res.json({ success: true, automation: { id, name } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/automations/:id', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { name, trigger_event, template_id, delay_minutes, conditions, is_active } = req.body;
    
    run(`
      UPDATE messaging_automations SET
        name = COALESCE(?, name),
        trigger_event = COALESCE(?, trigger_event),
        template_id = COALESCE(?, template_id),
        delay_minutes = COALESCE(?, delay_minutes),
        conditions = COALESCE(?, conditions),
        is_active = COALESCE(?, is_active)
      WHERE id = ?
    `, [name, trigger_event, template_id, delay_minutes, conditions ? JSON.stringify(conditions) : null, is_active, id]);
    
    res.json({ success: true, message: 'Automation updated' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Trigger automation (called by other services)
app.post('/trigger', async (req, res) => {
  try {
    await ensureTables();
    const { event, guest_id, reservation_id, recipient, variables } = req.body;
    
    const automations = query(`
      SELECT a.*, t.subject, t.body, t.channel
      FROM messaging_automations a
      JOIN message_templates t ON a.template_id = t.id
      WHERE a.trigger_event = ? AND a.is_active = 1
    `, [event]);
    
    let scheduledCount = 0;
    
    for (const auto of automations) {
      if (auto.delay_minutes > 0) {
        // Schedule for later
        const scheduledFor = new Date(Date.now() + auto.delay_minutes * 60 * 1000).toISOString();
        run(`
          INSERT INTO scheduled_messages (id, automation_id, template_id, guest_id, reservation_id, channel, recipient, scheduled_for, variables, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)
        `, [generateId(), auto.id, auto.template_id, guest_id, reservation_id, auto.channel, recipient, scheduledFor, JSON.stringify(variables || {}), timestamp()]);
      } else {
        // Send immediately
        const messageId = generateId();
        const finalSubject = replaceVariables(auto.subject, variables);
        const finalBody = replaceVariables(auto.body, variables);
        
        run(`
          INSERT INTO sent_messages (id, template_id, guest_id, reservation_id, channel, recipient, subject, body, variables_used, status, sent_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?)
        `, [messageId, auto.template_id, guest_id, reservation_id, auto.channel, recipient, finalSubject, finalBody, JSON.stringify(variables || {}), timestamp(), timestamp()]);
      }
      
      // Update automation stats
      run(`UPDATE messaging_automations SET send_count = send_count + 1, last_triggered = ? WHERE id = ?`, [timestamp(), auto.id]);
      scheduledCount++;
    }
    
    res.json({ success: true, triggered: scheduledCount });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// SCHEDULED MESSAGES
// ============================================

app.get('/scheduled', async (req, res) => {
  try {
    await ensureTables();
    const { status = 'scheduled' } = req.query;
    
    const messages = query(`
      SELECT s.*, t.name as template_name
      FROM scheduled_messages s
      LEFT JOIN message_templates t ON s.template_id = t.id
      WHERE s.status = ?
      ORDER BY s.scheduled_for ASC
    `, [status]);
    
    res.json({ success: true, scheduled: messages });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Process scheduled messages (would be called by cron)
app.post('/process-scheduled', async (req, res) => {
  try {
    await ensureTables();
    
    const due = query(`
      SELECT s.*, t.subject, t.body
      FROM scheduled_messages s
      JOIN message_templates t ON s.template_id = t.id
      WHERE s.status = 'scheduled' AND s.scheduled_for <= datetime('now')
    `);
    
    let processedCount = 0;
    
    for (const msg of due) {
      const variables = JSON.parse(msg.variables || '{}');
      const messageId = generateId();
      const finalSubject = replaceVariables(msg.subject, variables);
      const finalBody = replaceVariables(msg.body, variables);
      
      run(`
        INSERT INTO sent_messages (id, template_id, guest_id, reservation_id, channel, recipient, subject, body, variables_used, status, sent_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?)
      `, [messageId, msg.template_id, msg.guest_id, msg.reservation_id, msg.channel, msg.recipient, finalSubject, finalBody, msg.variables, timestamp(), timestamp()]);
      
      run(`UPDATE scheduled_messages SET status = 'sent', sent_message_id = ? WHERE id = ?`, [messageId, msg.id]);
      processedCount++;
    }
    
    res.json({ success: true, processed: processedCount });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// GUEST PREFERENCES
// ============================================

app.get('/preferences/:guestId', async (req, res) => {
  try {
    await ensureTables();
    const prefs = query(`SELECT * FROM guest_comm_preferences WHERE guest_id = ?`, [req.params.guestId]);
    res.json({ success: true, preferences: prefs });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/preferences/:guestId', async (req, res) => {
  try {
    await ensureTables();
    const { guestId } = req.params;
    const { channel, opt_in, preferred_language } = req.body;
    
    run(`
      INSERT OR REPLACE INTO guest_comm_preferences (id, guest_id, channel, opt_in, preferred_language, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [generateId(), guestId, channel, opt_in ? 1 : 0, preferred_language || 'en', timestamp()]);
    
    res.json({ success: true });
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
    const { days = 30 } = req.query;
    
    const totals = get(`
      SELECT 
        COUNT(*) as total_sent,
        SUM(CASE WHEN delivered_at IS NOT NULL THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened,
        SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) as clicked,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM sent_messages
      WHERE created_at > datetime('now', '-${parseInt(days)} days')
    `);
    
    const byChannel = query(`
      SELECT channel, COUNT(*) as count
      FROM sent_messages
      WHERE created_at > datetime('now', '-${parseInt(days)} days')
      GROUP BY channel
    `);
    
    const scheduled = get(`SELECT COUNT(*) as count FROM scheduled_messages WHERE status = 'scheduled'`);
    
    res.json({
      success: true,
      stats: {
        ...totals,
        open_rate: totals?.total_sent > 0 ? Math.round((totals.opened / totals.total_sent) * 100) : 0,
        click_rate: totals?.opened > 0 ? Math.round((totals.clicked / totals.opened) * 100) : 0,
        by_channel: byChannel,
        pending_scheduled: scheduled?.count || 0
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
