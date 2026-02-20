// CRM & Segmentation Service - Niyam Hospitality
// Guest CRM with segmentation, automated campaigns, and personalization

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
const SERVICE_NAME = 'crm_segmentation';
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Observability
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
const segmentUpdates = new promClient.Counter({ name: 'crm_segment_updates_total', help: 'Total segment updates', registers: [registry] });
const campaignsTriggered = new promClient.Counter({ name: 'crm_campaigns_triggered_total', help: 'Total campaigns triggered', registers: [registry] });
const leadsConverted = new promClient.Counter({ name: 'crm_leads_converted_total', help: 'Total leads converted', registers: [registry] });

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
// GUEST PROFILES (Enhanced)
// ============================================

app.get('/guests', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { segment, search, limit = 50, offset = 0 } = req.query;
    
    let sql = `
      SELECT g.*, 
             gs.segment_name, gs.segment_code,
             (SELECT COUNT(*) FROM hotel_bookings WHERE guest_id = g.id) as total_bookings,
             (SELECT SUM(total_amount) FROM hotel_bookings WHERE guest_id = g.id AND status = 'checked_out') as lifetime_value,
             (SELECT MAX(check_out_date) FROM hotel_bookings WHERE guest_id = g.id AND status = 'checked_out') as last_stay
      FROM hotel_guests g
      LEFT JOIN hotel_guest_segments gs ON g.segment_id = gs.id
      WHERE g.tenant_id = $1
    `;
    const params = [tenantId];
    let paramIdx = 2;
    
    if (segment) {
      sql += ` AND gs.segment_code = $${paramIdx++}`;
      params.push(segment);
    }
    if (search) {
      sql += ` AND (g.full_name ILIKE $${paramIdx} OR g.email ILIKE $${paramIdx} OR g.phone ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }
    
    sql += ` ORDER BY g.created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await query(sql, params);
    
    // Get total count
    const countRes = await query(`SELECT COUNT(*) FROM hotel_guests WHERE tenant_id = $1`, [tenantId]);
    
    res.json({ 
      success: true, 
      guests: result.rows,
      total: parseInt(countRes.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/guests/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    // Get guest with segment and stats
    const guestRes = await query(`
      SELECT g.*, gs.segment_name, gs.segment_code,
             (SELECT COUNT(*) FROM hotel_bookings WHERE guest_id = g.id) as total_bookings,
             (SELECT SUM(total_amount) FROM hotel_bookings WHERE guest_id = g.id AND status = 'checked_out') as lifetime_value,
             (SELECT AVG(total_amount) FROM hotel_bookings WHERE guest_id = g.id AND status = 'checked_out') as avg_booking_value
      FROM hotel_guests g
      LEFT JOIN hotel_guest_segments gs ON g.segment_id = gs.id
      WHERE g.id = $1 AND g.tenant_id = $2
    `, [id, tenantId]);
    
    if (guestRes.rowCount === 0) {
      return res.status(404).json({ error: 'Guest not found' });
    }
    
    // Get booking history
    const bookingsRes = await query(`
      SELECT b.id, b.check_in_date, b.check_out_date, b.status, b.total_amount, r.room_number, r.room_type
      FROM hotel_bookings b
      JOIN hotel_rooms r ON b.room_id = r.id
      WHERE b.guest_id = $1 AND b.tenant_id = $2
      ORDER BY b.check_in_date DESC
      LIMIT 10
    `, [id, tenantId]);
    
    // Get preferences and notes
    const notesRes = await query(`
      SELECT * FROM hotel_guest_notes WHERE guest_id = $1 AND tenant_id = $2
      ORDER BY created_at DESC LIMIT 20
    `, [id, tenantId]);
    
    // Get interactions/touchpoints
    const interactionsRes = await query(`
      SELECT * FROM hotel_guest_interactions WHERE guest_id = $1 AND tenant_id = $2
      ORDER BY interaction_date DESC LIMIT 20
    `, [id, tenantId]);
    
    res.json({
      success: true,
      guest: guestRes.rows[0],
      bookings: bookingsRes.rows,
      notes: notesRes.rows,
      interactions: interactionsRes.rows
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// SEGMENTS
// ============================================

app.get('/segments', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    
    const result = await query(`
      SELECT s.*, 
             (SELECT COUNT(*) FROM hotel_guests WHERE segment_id = s.id) as guest_count
      FROM hotel_guest_segments s
      WHERE s.tenant_id = $1
      ORDER BY s.priority ASC, s.segment_name
    `, [tenantId]);
    
    res.json({ success: true, segments: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const SegmentSchema = z.object({
  segment_code: z.string().min(1),
  segment_name: z.string().min(1),
  description: z.string().optional(),
  color: z.string().optional(),
  priority: z.number().default(100),
  criteria: z.object({
    min_stays: z.number().optional(),
    min_lifetime_value: z.number().optional(),
    min_avg_spend: z.number().optional(),
    last_stay_within_days: z.number().optional(),
    booking_sources: z.array(z.string()).optional(),
    room_types: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional()
  }).optional(),
  auto_assign: z.boolean().default(false)
});

app.post('/segments', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = SegmentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const data = parsed.data;
    
    const result = await query(`
      INSERT INTO hotel_guest_segments (tenant_id, segment_code, segment_name, description, color, priority, criteria, auto_assign)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [tenantId, data.segment_code, data.segment_name, data.description, data.color, data.priority, data.criteria, data.auto_assign]);
    
    res.json({ success: true, segment: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/segments/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const parsed = SegmentSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const data = parsed.data;
    const updates = [];
    const params = [tenantId, id];
    let paramIdx = 3;
    
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        updates.push(`${key} = $${paramIdx++}`);
        params.push(key === 'criteria' ? JSON.stringify(value) : value);
      }
    });
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    const result = await query(`
      UPDATE hotel_guest_segments SET ${updates.join(', ')}, updated_at = NOW()
      WHERE tenant_id = $1 AND id = $2
      RETURNING *
    `, params);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Segment not found' });
    }
    
    res.json({ success: true, segment: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// AUTO-SEGMENTATION
// ============================================

app.post('/segments/auto-assign', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    
    await client.query('BEGIN');
    
    // Get all auto-assign segments ordered by priority
    const segmentsRes = await client.query(`
      SELECT * FROM hotel_guest_segments 
      WHERE tenant_id = $1 AND auto_assign = true
      ORDER BY priority ASC
    `, [tenantId]);
    
    let totalUpdated = 0;
    const updates = [];
    
    for (const segment of segmentsRes.rows) {
      const criteria = segment.criteria || {};
      
      // Build dynamic query based on criteria
      let whereConditions = ['g.tenant_id = $1', 'g.segment_id IS DISTINCT FROM $2'];
      const params = [tenantId, segment.id];
      let paramIdx = 3;
      
      if (criteria.min_stays) {
        whereConditions.push(`(SELECT COUNT(*) FROM hotel_bookings WHERE guest_id = g.id AND status = 'checked_out') >= $${paramIdx++}`);
        params.push(criteria.min_stays);
      }
      
      if (criteria.min_lifetime_value) {
        whereConditions.push(`COALESCE((SELECT SUM(total_amount) FROM hotel_bookings WHERE guest_id = g.id AND status = 'checked_out'), 0) >= $${paramIdx++}`);
        params.push(criteria.min_lifetime_value);
      }
      
      if (criteria.last_stay_within_days) {
        whereConditions.push(`(SELECT MAX(check_out_date) FROM hotel_bookings WHERE guest_id = g.id) >= CURRENT_DATE - $${paramIdx++}::int`);
        params.push(criteria.last_stay_within_days);
      }
      
      // Update guests matching criteria
      const updateRes = await client.query(`
        UPDATE hotel_guests g SET segment_id = $2, updated_at = NOW()
        WHERE ${whereConditions.join(' AND ')}
        RETURNING id
      `, params);
      
      if (updateRes.rowCount > 0) {
        totalUpdated += updateRes.rowCount;
        updates.push({ segment: segment.segment_code, count: updateRes.rowCount });
      }
    }
    
    await client.query('COMMIT');
    
    segmentUpdates.inc(totalUpdated);
    
    await publishEnvelope('hospitality.crm.segment_updated.v1', 1, {
      tenant_id: tenantId,
      total_updated: totalUpdated,
      updates
    });
    
    res.json({ success: true, total_updated: totalUpdated, updates });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

app.post('/guests/:id/segment', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { segment_id } = req.body;
    
    const result = await query(`
      UPDATE hotel_guests SET segment_id = $1, updated_at = NOW()
      WHERE id = $2 AND tenant_id = $3
      RETURNING *
    `, [segment_id, id, tenantId]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Guest not found' });
    }
    
    segmentUpdates.inc();
    
    res.json({ success: true, guest: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// LEADS
// ============================================

app.get('/leads', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { status, source, limit = 50 } = req.query;
    
    let sql = `
      SELECT l.*, u.full_name as assigned_to_name
      FROM hotel_crm_leads l
      LEFT JOIN users u ON l.assigned_to = u.id
      WHERE l.tenant_id = $1
    `;
    const params = [tenantId];
    let paramIdx = 2;
    
    if (status) {
      sql += ` AND l.status = $${paramIdx++}`;
      params.push(status);
    }
    if (source) {
      sql += ` AND l.source = $${paramIdx++}`;
      params.push(source);
    }
    
    sql += ` ORDER BY l.created_at DESC LIMIT $${paramIdx}`;
    params.push(parseInt(limit));
    
    const result = await query(sql, params);
    res.json({ success: true, leads: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const LeadSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  source: z.enum(['website', 'phone', 'walk_in', 'referral', 'social', 'email', 'event', 'other']).default('website'),
  inquiry_type: z.enum(['room_booking', 'group_booking', 'event', 'corporate', 'wedding', 'other']).default('room_booking'),
  expected_arrival: z.string().optional(),
  expected_nights: z.number().optional(),
  expected_rooms: z.number().optional(),
  budget: z.number().optional(),
  notes: z.string().optional(),
  assigned_to: z.string().uuid().optional()
});

app.post('/leads', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = LeadSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const data = parsed.data;
    
    const result = await query(`
      INSERT INTO hotel_crm_leads (tenant_id, name, email, phone, company, source, inquiry_type, expected_arrival, expected_nights, expected_rooms, budget, notes, assigned_to, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'new')
      RETURNING *
    `, [tenantId, data.name, data.email, data.phone, data.company, data.source, data.inquiry_type, data.expected_arrival, data.expected_nights, data.expected_rooms, data.budget, data.notes, data.assigned_to]);
    
    res.json({ success: true, lead: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/leads/:id/status', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { status } = req.body;
    
    const validStatuses = ['new', 'contacted', 'qualified', 'proposal_sent', 'negotiating', 'won', 'lost'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const result = await query(`
      UPDATE hotel_crm_leads SET status = $1, updated_at = NOW()
      WHERE id = $2 AND tenant_id = $3
      RETURNING *
    `, [status, id, tenantId]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    res.json({ success: true, lead: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/leads/:id/convert', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { booking_id, group_id } = req.body;
    
    await client.query('BEGIN');
    
    // Get lead
    const leadRes = await client.query(`
      SELECT * FROM hotel_crm_leads WHERE id = $1 AND tenant_id = $2
    `, [id, tenantId]);
    
    if (leadRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    const lead = leadRes.rows[0];
    
    // Create or find guest
    let guestId;
    if (lead.email) {
      const existingGuest = await client.query(`
        SELECT id FROM hotel_guests WHERE email = $1 AND tenant_id = $2
      `, [lead.email, tenantId]);
      
      if (existingGuest.rowCount > 0) {
        guestId = existingGuest.rows[0].id;
      }
    }
    
    if (!guestId) {
      const newGuest = await client.query(`
        INSERT INTO hotel_guests (tenant_id, full_name, email, phone, company, source)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [tenantId, lead.name, lead.email, lead.phone, lead.company, `lead_${lead.source}`]);
      guestId = newGuest.rows[0].id;
    }
    
    // Update lead status
    await client.query(`
      UPDATE hotel_crm_leads 
      SET status = 'won', converted_at = NOW(), converted_guest_id = $1, converted_booking_id = $2, converted_group_id = $3
      WHERE id = $4
    `, [guestId, booking_id, group_id, id]);
    
    await client.query('COMMIT');
    
    leadsConverted.inc();
    
    await publishEnvelope('hospitality.crm.lead_converted.v1', 1, {
      lead_id: id,
      guest_id: guestId,
      booking_id,
      group_id
    });
    
    res.json({ success: true, guest_id: guestId });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ============================================
// GUEST NOTES & INTERACTIONS
// ============================================

app.post('/guests/:id/notes', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { note_type, content, is_alert } = req.body;
    
    const result = await query(`
      INSERT INTO hotel_guest_notes (tenant_id, guest_id, note_type, content, is_alert, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [tenantId, id, note_type || 'general', content, is_alert || false, req.user?.id]);
    
    res.json({ success: true, note: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/guests/:id/interactions', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { interaction_type, channel, summary, outcome } = req.body;
    
    const result = await query(`
      INSERT INTO hotel_guest_interactions (tenant_id, guest_id, interaction_type, channel, summary, outcome, staff_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [tenantId, id, interaction_type, channel, summary, outcome, req.user?.id]);
    
    res.json({ success: true, interaction: result.rows[0] });
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
    const { status, segment } = req.query;
    
    let sql = `
      SELECT c.*, s.segment_name,
             (SELECT COUNT(*) FROM hotel_campaign_targets WHERE campaign_id = c.id) as target_count,
             (SELECT COUNT(*) FROM hotel_campaign_targets WHERE campaign_id = c.id AND sent_at IS NOT NULL) as sent_count,
             (SELECT COUNT(*) FROM hotel_campaign_targets WHERE campaign_id = c.id AND opened_at IS NOT NULL) as opened_count
      FROM hotel_crm_campaigns c
      LEFT JOIN hotel_guest_segments s ON c.target_segment_id = s.id
      WHERE c.tenant_id = $1
    `;
    const params = [tenantId];
    let paramIdx = 2;
    
    if (status) {
      sql += ` AND c.status = $${paramIdx++}`;
      params.push(status);
    }
    if (segment) {
      sql += ` AND c.target_segment_id = $${paramIdx++}`;
      params.push(segment);
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
  campaign_type: z.enum(['email', 'sms', 'whatsapp', 'push']).default('email'),
  target_segment_id: z.string().uuid().optional(),
  subject: z.string().optional(),
  content: z.string().min(1),
  offer_code: z.string().optional(),
  offer_value: z.number().optional(),
  scheduled_at: z.string().optional()
});

app.post('/campaigns', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = CampaignSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const data = parsed.data;
    
    const result = await query(`
      INSERT INTO hotel_crm_campaigns (tenant_id, name, campaign_type, target_segment_id, subject, content, offer_code, offer_value, scheduled_at, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft')
      RETURNING *
    `, [tenantId, data.name, data.campaign_type, data.target_segment_id, data.subject, data.content, data.offer_code, data.offer_value, data.scheduled_at]);
    
    res.json({ success: true, campaign: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/campaigns/:id/send', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    await client.query('BEGIN');
    
    // Get campaign
    const campaignRes = await client.query(`
      SELECT * FROM hotel_crm_campaigns WHERE id = $1 AND tenant_id = $2
    `, [id, tenantId]);
    
    if (campaignRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    const campaign = campaignRes.rows[0];
    
    // Get target guests
    let guestQuery = `SELECT id, full_name, email, phone FROM hotel_guests WHERE tenant_id = $1`;
    const guestParams = [tenantId];
    
    if (campaign.target_segment_id) {
      guestQuery += ' AND segment_id = $2';
      guestParams.push(campaign.target_segment_id);
    }
    
    const guestsRes = await client.query(guestQuery, guestParams);
    
    // Create campaign targets
    let sentCount = 0;
    for (const guest of guestsRes.rows) {
      const contact = campaign.campaign_type === 'email' ? guest.email : guest.phone;
      if (!contact) continue;
      
      await client.query(`
        INSERT INTO hotel_campaign_targets (campaign_id, guest_id, contact, sent_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT DO NOTHING
      `, [id, guest.id, contact]);
      
      sentCount++;
    }
    
    // Update campaign status
    await client.query(`
      UPDATE hotel_crm_campaigns SET status = 'sent', sent_at = NOW() WHERE id = $1
    `, [id]);
    
    await client.query('COMMIT');
    
    campaignsTriggered.inc();
    
    await publishEnvelope('hospitality.crm.campaign_triggered.v1', 1, {
      campaign_id: id,
      sent_count: sentCount
    });
    
    res.json({ success: true, sent_count: sentCount });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ============================================
// ANALYTICS
// ============================================

app.get('/analytics/overview', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    
    const stats = await query(`
      SELECT 
        (SELECT COUNT(*) FROM hotel_guests WHERE tenant_id = $1) as total_guests,
        (SELECT COUNT(*) FROM hotel_guests WHERE tenant_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '30 days') as new_guests_30d,
        (SELECT COUNT(*) FROM hotel_crm_leads WHERE tenant_id = $1 AND status NOT IN ('won', 'lost')) as active_leads,
        (SELECT COUNT(*) FROM hotel_crm_leads WHERE tenant_id = $1 AND status = 'won' AND converted_at >= CURRENT_DATE - INTERVAL '30 days') as converted_leads_30d,
        (SELECT AVG(total_amount) FROM hotel_bookings WHERE tenant_id = $1 AND status = 'checked_out') as avg_booking_value,
        (SELECT COUNT(DISTINCT guest_id) FROM hotel_bookings WHERE tenant_id = $1 AND status = 'checked_out' 
          AND guest_id IN (SELECT guest_id FROM hotel_bookings WHERE tenant_id = $1 GROUP BY guest_id HAVING COUNT(*) > 1)) as repeat_guests
    `, [tenantId]);
    
    // Get segment distribution
    const segmentDist = await query(`
      SELECT s.segment_name, s.segment_code, COUNT(g.id) as count
      FROM hotel_guest_segments s
      LEFT JOIN hotel_guests g ON g.segment_id = s.id
      WHERE s.tenant_id = $1
      GROUP BY s.id
      ORDER BY count DESC
    `, [tenantId]);
    
    // Get lead funnel
    const leadFunnel = await query(`
      SELECT status, COUNT(*) as count
      FROM hotel_crm_leads
      WHERE tenant_id = $1
      GROUP BY status
    `, [tenantId]);
    
    res.json({
      success: true,
      overview: stats.rows[0],
      segment_distribution: segmentDist.rows,
      lead_funnel: leadFunnel.rows
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/analytics/guest-value', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    
    const result = await query(`
      SELECT 
        g.id, g.full_name, g.email, s.segment_name,
        COUNT(b.id) as total_bookings,
        SUM(b.total_amount) as lifetime_value,
        AVG(b.total_amount) as avg_booking_value,
        MAX(b.check_out_date) as last_stay,
        MIN(b.check_in_date) as first_stay
      FROM hotel_guests g
      LEFT JOIN hotel_guest_segments s ON g.segment_id = s.id
      LEFT JOIN hotel_bookings b ON g.id = b.guest_id AND b.status = 'checked_out'
      WHERE g.tenant_id = $1
      GROUP BY g.id, s.segment_name
      HAVING COUNT(b.id) > 0
      ORDER BY lifetime_value DESC NULLS LAST
      LIMIT 100
    `, [tenantId]);
    
    res.json({ success: true, guests: result.rows });
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

const PORT = process.env.PORT || 8934;
app.listen(PORT, () => {
  console.log(`✅ CRM & Segmentation Service listening on ${PORT}`);
});
