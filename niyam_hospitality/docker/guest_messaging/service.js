// Guest Messaging Service - Niyam Hospitality
// Automated guest communication via SMS, WhatsApp, Email

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const promClient = require('prom-client');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');

let db, sdk, kvStore;
try {
  db = require('../../../../db/postgres');
  sdk = require('../../../../platform/sdk/node');
  kvStore = require('../../../../platform/nats/kv_store');
} catch (_) {
  db = { query: async () => ({ rows: [] }), getClient: async () => ({ query: async () => ({ rows: [], rowCount: 0 }), release: () => {} }) };
  sdk = { publishEnvelope: async () => {} };
  kvStore = { connect: async () => {}, get: async () => null, put: async () => {} };
}

const { query, getClient } = db;
const { publishEnvelope } = sdk;

const app = express();
const SERVICE_NAME = 'guest_messaging';
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Observability
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
const messagesSent = new promClient.Counter({ name: 'guest_messaging_messages_sent_total', help: 'Total messages sent', labelNames: ['channel'], registers: [registry] });
const templatesUsed = new promClient.Counter({ name: 'guest_messaging_templates_used_total', help: 'Total templates used', registers: [registry] });

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

// Auth
const SKIP_AUTH = (process.env.SKIP_AUTH || 'true').toLowerCase() === 'true';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

app.use((req, res, next) => {
  if (SKIP_AUTH) return next();
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try { req.user = jwt.verify(token, JWT_SECRET); } catch (e) {}
  }
  next();
});

function getTenantId(req) {
  return req.headers['x-tenant-id'] || req.user?.tenant_id || DEFAULT_TENANT_ID;
}

// NATS connection
let natsReady = false;
(async () => {
  try {
    await kvStore.connect();
    console.log(`✅ ${SERVICE_NAME}: NATS KV Connected`);
    natsReady = true;
  } catch (e) {
    console.warn(`⚠️ ${SERVICE_NAME}: NATS KV connection failed, running in standalone mode`);
  }
})();

// ============================================
// MESSAGE TEMPLATES
// ============================================

app.get('/templates', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { channel, trigger, category } = req.query;
    
    let sql = `
      SELECT id, name, channel, trigger_event, category, subject, body, variables, is_active, created_at
      FROM hotel_message_templates
      WHERE tenant_id = $1
    `;
    const params = [tenantId];
    let paramIdx = 2;
    
    if (channel) {
      sql += ` AND channel = $${paramIdx++}`;
      params.push(channel);
    }
    if (trigger) {
      sql += ` AND trigger_event = $${paramIdx++}`;
      params.push(trigger);
    }
    if (category) {
      sql += ` AND category = $${paramIdx++}`;
      params.push(category);
    }
    
    sql += ' ORDER BY category, name';
    
    const result = await query(sql, params);
    res.json({ success: true, templates: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const TemplateSchema = z.object({
  name: z.string().min(1),
  channel: z.enum(['email', 'sms', 'whatsapp', 'push']),
  trigger_event: z.enum(['booking_confirmed', 'pre_arrival', 'check_in', 'in_stay', 'check_out', 'post_stay', 'birthday', 'anniversary', 'manual']),
  category: z.string().default('transactional'),
  subject: z.string().optional(),
  body: z.string().min(1),
  variables: z.array(z.string()).default([]),
  is_active: z.boolean().default(true)
});

app.post('/templates', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = TemplateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const data = parsed.data;
    
    const result = await query(`
      INSERT INTO hotel_message_templates (tenant_id, name, channel, trigger_event, category, subject, body, variables, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [tenantId, data.name, data.channel, data.trigger_event, data.category, data.subject, data.body, data.variables, data.is_active]);
    
    res.json({ success: true, template: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/templates/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const parsed = TemplateSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const data = parsed.data;
    const updates = [];
    const params = [tenantId, id];
    let paramIdx = 3;
    
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        updates.push(`${key} = $${paramIdx++}`);
        params.push(key === 'variables' ? value : value);
      }
    });
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    const result = await query(`
      UPDATE hotel_message_templates 
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE tenant_id = $1 AND id = $2
      RETURNING *
    `, params);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    res.json({ success: true, template: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// SEND MESSAGE
// ============================================

const SendMessageSchema = z.object({
  guest_id: z.string().uuid().optional(),
  booking_id: z.string().uuid().optional(),
  template_id: z.string().uuid().optional(),
  channel: z.enum(['email', 'sms', 'whatsapp', 'push']),
  recipient: z.string(), // email, phone, or device token
  subject: z.string().optional(),
  body: z.string(),
  variables: z.record(z.string()).optional(),
  schedule_at: z.string().optional()
});

app.post('/send', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = SendMessageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const data = parsed.data;
    
    // Replace variables in body
    let messageBody = data.body;
    if (data.variables) {
      Object.entries(data.variables).forEach(([key, value]) => {
        messageBody = messageBody.replace(new RegExp(`{{${key}}}`, 'g'), value);
      });
    }
    
    // Create message record
    const messageId = uuidv4();
    await query(`
      INSERT INTO hotel_messages (id, tenant_id, guest_id, booking_id, template_id, channel, recipient, subject, body, status, scheduled_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [messageId, tenantId, data.guest_id, data.booking_id, data.template_id, data.channel, data.recipient, data.subject, messageBody, 
        data.schedule_at ? 'scheduled' : 'pending', data.schedule_at]);
    
    // If not scheduled, send immediately (stub - would integrate with actual providers)
    if (!data.schedule_at) {
      // Simulate sending
      await query(`
        UPDATE hotel_messages SET status = 'sent', sent_at = NOW() WHERE id = $1
      `, [messageId]);
      
      messagesSent.inc({ channel: data.channel });
      
      await publishEnvelope('hospitality.guest_messaging.message_sent.v1', 1, {
        message_id: messageId,
        tenant_id: tenantId,
        channel: data.channel,
        recipient: data.recipient,
        guest_id: data.guest_id
      });
    }
    
    res.json({ 
      success: true, 
      message: { 
        id: messageId, 
        status: data.schedule_at ? 'scheduled' : 'sent',
        channel: data.channel
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// SEND USING TEMPLATE
// ============================================

app.post('/send-template', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { template_id, guest_id, booking_id, variables } = req.body;
    
    // Get template
    const templateRes = await query(`
      SELECT * FROM hotel_message_templates WHERE id = $1 AND tenant_id = $2
    `, [template_id, tenantId]);
    
    if (templateRes.rowCount === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const template = templateRes.rows[0];
    
    // Get guest info
    const guestRes = await query(`
      SELECT g.*, b.check_in_date, b.check_out_date, b.confirmation_number, r.room_number
      FROM hotel_guests g
      LEFT JOIN hotel_bookings b ON g.id = b.guest_id AND (b.id = $3 OR $3 IS NULL)
      LEFT JOIN hotel_rooms r ON b.room_id = r.id
      WHERE g.id = $1 AND g.tenant_id = $2
      ORDER BY b.created_at DESC
      LIMIT 1
    `, [guest_id, tenantId, booking_id]);
    
    if (guestRes.rowCount === 0) {
      return res.status(404).json({ error: 'Guest not found' });
    }
    
    const guest = guestRes.rows[0];
    
    // Build variables
    const allVariables = {
      guest_name: guest.full_name,
      first_name: guest.full_name?.split(' ')[0],
      email: guest.email,
      phone: guest.phone,
      room_number: guest.room_number,
      check_in_date: guest.check_in_date,
      check_out_date: guest.check_out_date,
      confirmation_number: guest.confirmation_number,
      ...variables
    };
    
    // Get recipient based on channel
    let recipient;
    switch (template.channel) {
      case 'email': recipient = guest.email; break;
      case 'sms':
      case 'whatsapp': recipient = guest.phone; break;
      default: recipient = guest.email;
    }
    
    if (!recipient) {
      return res.status(400).json({ error: `No ${template.channel} contact for guest` });
    }
    
    // Replace variables in body and subject
    let body = template.body;
    let subject = template.subject;
    
    Object.entries(allVariables).forEach(([key, value]) => {
      if (value) {
        body = body.replace(new RegExp(`{{${key}}}`, 'g'), value);
        if (subject) subject = subject.replace(new RegExp(`{{${key}}}`, 'g'), value);
      }
    });
    
    // Create and send message
    const messageId = uuidv4();
    await query(`
      INSERT INTO hotel_messages (id, tenant_id, guest_id, booking_id, template_id, channel, recipient, subject, body, status, sent_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'sent', NOW())
    `, [messageId, tenantId, guest_id, booking_id, template_id, template.channel, recipient, subject, body]);
    
    messagesSent.inc({ channel: template.channel });
    templatesUsed.inc();
    
    await publishEnvelope('hospitality.guest_messaging.message_sent.v1', 1, {
      message_id: messageId,
      template_id,
      channel: template.channel,
      guest_id
    });
    
    res.json({ success: true, message: { id: messageId, status: 'sent' } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// CAMPAIGNS
// ============================================

app.get('/campaigns', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { status } = req.query;
    
    let sql = `
      SELECT c.*, t.name as template_name, t.channel,
             (SELECT COUNT(*) FROM hotel_campaign_recipients WHERE campaign_id = c.id) as recipient_count,
             (SELECT COUNT(*) FROM hotel_campaign_recipients WHERE campaign_id = c.id AND sent_at IS NOT NULL) as sent_count
      FROM hotel_campaigns c
      LEFT JOIN hotel_message_templates t ON c.template_id = t.id
      WHERE c.tenant_id = $1
    `;
    const params = [tenantId];
    
    if (status) {
      sql += ' AND c.status = $2';
      params.push(status);
    }
    
    sql += ' ORDER BY c.created_at DESC';
    
    const result = await query(sql, params);
    res.json({ success: true, campaigns: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const CampaignSchema = z.object({
  name: z.string().min(1),
  template_id: z.string().uuid(),
  segment_id: z.string().uuid().optional(),
  guest_ids: z.array(z.string().uuid()).optional(),
  scheduled_at: z.string().optional(),
  variables: z.record(z.string()).optional()
});

app.post('/campaigns', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = CampaignSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const data = parsed.data;
    
    const campaignId = uuidv4();
    await query(`
      INSERT INTO hotel_campaigns (id, tenant_id, name, template_id, segment_id, status, scheduled_at, variables)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [campaignId, tenantId, data.name, data.template_id, data.segment_id, 
        data.scheduled_at ? 'scheduled' : 'draft', data.scheduled_at, data.variables]);
    
    // Add recipients if provided
    if (data.guest_ids && data.guest_ids.length > 0) {
      for (const guestId of data.guest_ids) {
        await query(`
          INSERT INTO hotel_campaign_recipients (campaign_id, guest_id) VALUES ($1, $2)
        `, [campaignId, guestId]);
      }
    }
    
    res.json({ success: true, campaign: { id: campaignId, name: data.name } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/campaigns/:id/send', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    // Get campaign with template
    const campaignRes = await query(`
      SELECT c.*, t.channel, t.subject, t.body
      FROM hotel_campaigns c
      JOIN hotel_message_templates t ON c.template_id = t.id
      WHERE c.id = $1 AND c.tenant_id = $2
    `, [id, tenantId]);
    
    if (campaignRes.rowCount === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    const campaign = campaignRes.rows[0];
    
    // Get recipients
    const recipientsRes = await query(`
      SELECT cr.id as recipient_id, g.id as guest_id, g.full_name, g.email, g.phone
      FROM hotel_campaign_recipients cr
      JOIN hotel_guests g ON cr.guest_id = g.id
      WHERE cr.campaign_id = $1 AND cr.sent_at IS NULL
    `, [id]);
    
    let sentCount = 0;
    for (const recipient of recipientsRes.rows) {
      const contact = campaign.channel === 'email' ? recipient.email : recipient.phone;
      if (!contact) continue;
      
      // Create message
      const messageId = uuidv4();
      let body = campaign.body.replace(/{{guest_name}}/g, recipient.full_name);
      
      await query(`
        INSERT INTO hotel_messages (id, tenant_id, guest_id, template_id, channel, recipient, subject, body, status, sent_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'sent', NOW())
      `, [messageId, tenantId, recipient.guest_id, campaign.template_id, campaign.channel, contact, campaign.subject, body]);
      
      // Mark recipient as sent
      await query(`
        UPDATE hotel_campaign_recipients SET sent_at = NOW(), message_id = $1 WHERE id = $2
      `, [messageId, recipient.recipient_id]);
      
      sentCount++;
      messagesSent.inc({ channel: campaign.channel });
    }
    
    // Update campaign status
    await query(`
      UPDATE hotel_campaigns SET status = 'sent', sent_at = NOW() WHERE id = $1
    `, [id]);
    
    await publishEnvelope('hospitality.guest_messaging.campaign_triggered.v1', 1, {
      campaign_id: id,
      sent_count: sentCount
    });
    
    res.json({ success: true, sent_count: sentCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// MESSAGE HISTORY
// ============================================

app.get('/messages', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { guest_id, booking_id, channel, status, limit = 50 } = req.query;
    
    let sql = `
      SELECT m.*, g.full_name as guest_name, t.name as template_name
      FROM hotel_messages m
      LEFT JOIN hotel_guests g ON m.guest_id = g.id
      LEFT JOIN hotel_message_templates t ON m.template_id = t.id
      WHERE m.tenant_id = $1
    `;
    const params = [tenantId];
    let paramIdx = 2;
    
    if (guest_id) {
      sql += ` AND m.guest_id = $${paramIdx++}`;
      params.push(guest_id);
    }
    if (booking_id) {
      sql += ` AND m.booking_id = $${paramIdx++}`;
      params.push(booking_id);
    }
    if (channel) {
      sql += ` AND m.channel = $${paramIdx++}`;
      params.push(channel);
    }
    if (status) {
      sql += ` AND m.status = $${paramIdx++}`;
      params.push(status);
    }
    
    sql += ` ORDER BY m.created_at DESC LIMIT $${paramIdx}`;
    params.push(parseInt(limit));
    
    const result = await query(sql, params);
    res.json({ success: true, messages: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// AUTOMATION RULES
// ============================================

app.get('/automations', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    
    const result = await query(`
      SELECT a.*, t.name as template_name, t.channel
      FROM hotel_message_automations a
      JOIN hotel_message_templates t ON a.template_id = t.id
      WHERE a.tenant_id = $1
      ORDER BY a.trigger_event, a.delay_hours
    `, [tenantId]);
    
    res.json({ success: true, automations: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const AutomationSchema = z.object({
  name: z.string().min(1),
  trigger_event: z.enum(['booking_confirmed', 'pre_arrival', 'check_in', 'check_out', 'post_stay']),
  template_id: z.string().uuid(),
  delay_hours: z.number().min(0).default(0),
  is_active: z.boolean().default(true)
});

app.post('/automations', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = AutomationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const data = parsed.data;
    
    const result = await query(`
      INSERT INTO hotel_message_automations (tenant_id, name, trigger_event, template_id, delay_hours, is_active)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [tenantId, data.name, data.trigger_event, data.template_id, data.delay_hours, data.is_active]);
    
    res.json({ success: true, automation: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// STATS
// ============================================

app.get('/stats', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { from_date, to_date } = req.query;
    
    const today = new Date().toISOString().split('T')[0];
    const fromDate = from_date || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
    const toDate = to_date || today;
    
    const result = await query(`
      SELECT 
        COUNT(*) as total_messages,
        COUNT(*) FILTER (WHERE status = 'sent') as sent,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE channel = 'email') as email_count,
        COUNT(*) FILTER (WHERE channel = 'sms') as sms_count,
        COUNT(*) FILTER (WHERE channel = 'whatsapp') as whatsapp_count
      FROM hotel_messages
      WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3
    `, [tenantId, fromDate, toDate]);
    
    res.json({ success: true, stats: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health endpoints
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME }));
app.get('/readyz', (req, res) => res.json({ status: natsReady ? 'ready' : 'degraded', nats: natsReady }));


// ============================================
// SERVE EMBEDDED UI (Auto-generated)
// ============================================

const UI_DIST = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(UI_DIST)) {
  console.log('📦 Serving embedded UI from ui/dist');
  app.use(express.static(UI_DIST));
  
  // SPA fallback - serve index.html for non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || 
        req.path.startsWith('/health') ||
        req.path.startsWith('/metrics') ||
        req.path.startsWith('/readyz')) {
      return next();
    }
    res.sendFile(path.join(UI_DIST, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('<html><body style="font-family:system-ui;text-align:center;padding:2rem;"><h1>Service Running</h1><p><a href="/healthz">Health Check</a></p></body></html>');
  });
}

const PORT = process.env.PORT || 8931;
app.listen(PORT, () => {
  console.log(`✅ Guest Messaging Service listening on ${PORT}`);
});
