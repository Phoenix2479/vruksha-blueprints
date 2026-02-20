// Travel Agent Portal Service - Niyam Hospitality
// B2B portal for travel agents and corporate accounts

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
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
  kvStore = { connect: async () => {} };
}

const { query, getClient } = db;
const { publishEnvelope } = sdk;

const app = express();
const SERVICE_NAME = 'travel_agent_portal';
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
app.get('/metrics', async (req, res) => { res.set('Content-Type', registry.contentType); res.end(await registry.metrics()); });

const SKIP_AUTH = (process.env.SKIP_AUTH || 'true').toLowerCase() === 'true';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

app.use((req, res, next) => {
  if (SKIP_AUTH) return next();
  const token = req.headers.authorization?.split(' ')[1];
  if (token) { try { req.user = jwt.verify(token, JWT_SECRET); } catch (e) {} }
  next();
});

function getTenantId(req) { return req.headers['x-tenant-id'] || req.user?.tenant_id || DEFAULT_TENANT_ID; }

let natsReady = false;
(async () => { try { await kvStore.connect(); natsReady = true; } catch (e) {} })();

// ============================================
// TRAVEL AGENTS
// ============================================

app.get('/agents', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { status, search } = req.query;
    
    let sql = `
      SELECT a.*, 
             (SELECT COUNT(*) FROM hotel_agent_bookings WHERE agent_id = a.id) as total_bookings,
             (SELECT SUM(commission_amount) FROM hotel_agent_bookings WHERE agent_id = a.id AND commission_paid = false) as pending_commission
      FROM hotel_travel_agents a
      WHERE a.tenant_id = $1
    `;
    const params = [tenantId];
    let idx = 2;
    
    if (status) { sql += ` AND a.status = $${idx++}`; params.push(status); }
    if (search) { sql += ` AND (a.company_name ILIKE $${idx} OR a.contact_name ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    
    sql += ' ORDER BY a.company_name';
    const result = await query(sql, params);
    res.json({ success: true, agents: result.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const AgentSchema = z.object({
  company_name: z.string().min(1),
  contact_name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  iata_number: z.string().optional(),
  tax_id: z.string().optional(),
  agent_type: z.enum(['travel_agent', 'tour_operator', 'ota', 'corporate', 'consortium']).default('travel_agent'),
  commission_rate: z.number().min(0).max(50).default(10),
  payment_terms: z.number().default(30),
  credit_limit: z.number().min(0).default(0),
  special_rates: z.boolean().default(false)
});

app.post('/agents', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = AgentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const d = parsed.data;
    const agentCode = `TA${Date.now().toString(36).toUpperCase()}`;
    const tempPassword = uuidv4().slice(0, 8);
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    
    const result = await query(`
      INSERT INTO hotel_travel_agents (tenant_id, agent_code, company_name, contact_name, email, phone, address, city, country, iata_number, tax_id, agent_type, commission_rate, payment_terms, credit_limit, special_rates, password_hash, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'active')
      RETURNING *
    `, [tenantId, agentCode, d.company_name, d.contact_name, d.email, d.phone, d.address, d.city, d.country, d.iata_number, d.tax_id, d.agent_type, d.commission_rate, d.payment_terms, d.credit_limit, d.special_rates, passwordHash]);
    
    res.json({ success: true, agent: result.rows[0], temp_password: tempPassword });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// AGENT LOGIN
// ============================================

app.post('/agents/login', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { email, password } = req.body;
    
    const result = await query(`
      SELECT * FROM hotel_travel_agents WHERE tenant_id = $1 AND email = $2 AND status = 'active'
    `, [tenantId, email]);
    
    if (result.rowCount === 0) return res.status(401).json({ error: 'Invalid credentials' });
    
    const agent = result.rows[0];
    const valid = await bcrypt.compare(password, agent.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    
    const token = jwt.sign({ agent_id: agent.id, tenant_id: tenantId, type: 'agent' }, JWT_SECRET, { expiresIn: '24h' });
    
    await query(`UPDATE hotel_travel_agents SET last_login = NOW() WHERE id = $1`, [agent.id]);
    
    res.json({ success: true, token, agent: { id: agent.id, company_name: agent.company_name, email: agent.email } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// AGENT RATES (Special negotiated rates)
// ============================================

app.get('/agents/:agentId/rates', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { agentId } = req.params;
    
    const result = await query(`
      SELECT ar.*, rt.name as room_type_name
      FROM hotel_agent_rates ar
      LEFT JOIN hotel_room_types rt ON ar.room_type = rt.code AND ar.tenant_id = rt.tenant_id
      WHERE ar.tenant_id = $1 AND ar.agent_id = $2
        AND (ar.valid_to IS NULL OR ar.valid_to >= CURRENT_DATE)
      ORDER BY ar.room_type
    `, [tenantId, agentId]);
    
    res.json({ success: true, rates: result.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/agents/:agentId/rates', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { agentId } = req.params;
    const { room_type, rate, valid_from, valid_to, rate_type } = req.body;
    
    const result = await query(`
      INSERT INTO hotel_agent_rates (tenant_id, agent_id, room_type, rate, rate_type, valid_from, valid_to)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (tenant_id, agent_id, room_type) DO UPDATE SET rate = $4, rate_type = $5, valid_from = $6, valid_to = $7, updated_at = NOW()
      RETURNING *
    `, [tenantId, agentId, room_type, rate, rate_type || 'net', valid_from, valid_to]);
    
    res.json({ success: true, rate: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// AGENT BOOKINGS
// ============================================

app.get('/bookings', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { agent_id, status, from_date, to_date } = req.query;
    
    let sql = `
      SELECT ab.*, a.company_name as agent_name, g.full_name as guest_name, r.room_number
      FROM hotel_agent_bookings ab
      JOIN hotel_travel_agents a ON ab.agent_id = a.id
      JOIN hotel_bookings b ON ab.booking_id = b.id
      JOIN hotel_guests g ON b.guest_id = g.id
      JOIN hotel_rooms r ON b.room_id = r.id
      WHERE ab.tenant_id = $1
    `;
    const params = [tenantId];
    let idx = 2;
    
    if (agent_id) { sql += ` AND ab.agent_id = $${idx++}`; params.push(agent_id); }
    if (status) { sql += ` AND ab.status = $${idx++}`; params.push(status); }
    if (from_date) { sql += ` AND b.check_in_date >= $${idx++}`; params.push(from_date); }
    if (to_date) { sql += ` AND b.check_in_date <= $${idx++}`; params.push(to_date); }
    
    sql += ' ORDER BY ab.created_at DESC LIMIT 100';
    const result = await query(sql, params);
    res.json({ success: true, bookings: result.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const AgentBookingSchema = z.object({
  agent_id: z.string().uuid(),
  guest_name: z.string().min(1),
  guest_email: z.string().email().optional(),
  guest_phone: z.string().optional(),
  room_id: z.string().uuid(),
  check_in_date: z.string(),
  check_out_date: z.string(),
  adults: z.number().min(1).default(1),
  children: z.number().min(0).default(0),
  rate_type: z.enum(['net', 'commissionable', 'package']).default('commissionable'),
  gross_amount: z.number().positive(),
  notes: z.string().optional()
});

app.post('/bookings', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const parsed = AgentBookingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const d = parsed.data;
    
    await client.query('BEGIN');
    
    // Get agent details
    const agentRes = await client.query(`SELECT * FROM hotel_travel_agents WHERE id = $1 AND tenant_id = $2`, [d.agent_id, tenantId]);
    if (agentRes.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Agent not found' }); }
    
    const agent = agentRes.rows[0];
    
    // Calculate commission
    let commissionAmount = 0;
    if (d.rate_type === 'commissionable') {
      commissionAmount = d.gross_amount * (agent.commission_rate / 100);
    }
    const netAmount = d.gross_amount - commissionAmount;
    
    // Create guest
    let guestRes = await client.query(`SELECT id FROM hotel_guests WHERE tenant_id = $1 AND email = $2`, [tenantId, d.guest_email]);
    let guestId;
    if (guestRes.rowCount > 0) {
      guestId = guestRes.rows[0].id;
    } else {
      const newGuest = await client.query(`
        INSERT INTO hotel_guests (tenant_id, full_name, email, phone, source) VALUES ($1, $2, $3, $4, 'travel_agent')
        RETURNING id
      `, [tenantId, d.guest_name, d.guest_email, d.guest_phone]);
      guestId = newGuest.rows[0].id;
    }
    
    // Create booking
    const bookingId = uuidv4();
    const confirmationNumber = `TA${agent.agent_code}-${Date.now().toString(36).toUpperCase()}`;
    
    await client.query(`
      INSERT INTO hotel_bookings (id, tenant_id, guest_id, room_id, check_in_date, check_out_date, status, total_amount, adults_count, children_count, notes, source, confirmation_number)
      VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', $7, $8, $9, $10, 'travel_agent', $11)
    `, [bookingId, tenantId, guestId, d.room_id, d.check_in_date, d.check_out_date, d.gross_amount, d.adults, d.children, d.notes, confirmationNumber]);
    
    // Create agent booking record
    const agentBookingRes = await client.query(`
      INSERT INTO hotel_agent_bookings (tenant_id, agent_id, booking_id, gross_amount, net_amount, commission_rate, commission_amount, rate_type, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'confirmed')
      RETURNING *
    `, [tenantId, d.agent_id, bookingId, d.gross_amount, netAmount, agent.commission_rate, commissionAmount, d.rate_type]);
    
    await client.query('COMMIT');
    
    await publishEnvelope('hospitality.travel_agent.booking_created.v1', 1, { booking_id: bookingId, agent_id: d.agent_id, commission: commissionAmount });
    
    res.json({ success: true, booking: { ...agentBookingRes.rows[0], confirmation_number: confirmationNumber } });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

// ============================================
// COMMISSIONS
// ============================================

app.get('/commissions', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { agent_id, paid, from_date, to_date } = req.query;
    
    let sql = `
      SELECT ab.*, a.company_name, b.confirmation_number, b.check_in_date, b.check_out_date
      FROM hotel_agent_bookings ab
      JOIN hotel_travel_agents a ON ab.agent_id = a.id
      JOIN hotel_bookings b ON ab.booking_id = b.id
      WHERE ab.tenant_id = $1 AND ab.commission_amount > 0
    `;
    const params = [tenantId];
    let idx = 2;
    
    if (agent_id) { sql += ` AND ab.agent_id = $${idx++}`; params.push(agent_id); }
    if (paid === 'true') { sql += ` AND ab.commission_paid = true`; }
    else if (paid === 'false') { sql += ` AND ab.commission_paid = false`; }
    if (from_date) { sql += ` AND b.check_out_date >= $${idx++}`; params.push(from_date); }
    if (to_date) { sql += ` AND b.check_out_date <= $${idx++}`; params.push(to_date); }
    
    sql += ' ORDER BY b.check_out_date DESC';
    const result = await query(sql, params);
    
    // Calculate totals
    const total = result.rows.reduce((sum, r) => sum + parseFloat(r.commission_amount), 0);
    const paid_total = result.rows.filter(r => r.commission_paid).reduce((sum, r) => sum + parseFloat(r.commission_amount), 0);
    
    res.json({ success: true, commissions: result.rows, summary: { total, paid: paid_total, pending: total - paid_total } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/commissions/pay', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { agent_id, booking_ids, payment_reference } = req.body;
    
    await client.query('BEGIN');
    
    const result = await client.query(`
      UPDATE hotel_agent_bookings 
      SET commission_paid = true, commission_paid_date = NOW(), payment_reference = $1
      WHERE tenant_id = $2 AND agent_id = $3 AND id = ANY($4) AND commission_paid = false
      RETURNING *
    `, [payment_reference, tenantId, agent_id, booking_ids]);
    
    const totalPaid = result.rows.reduce((sum, r) => sum + parseFloat(r.commission_amount), 0);
    
    await client.query('COMMIT');
    
    await publishEnvelope('hospitality.travel_agent.commission_calculated.v1', 1, { agent_id, amount: totalPaid, count: result.rowCount });
    
    res.json({ success: true, paid_count: result.rowCount, total_paid: totalPaid });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

// ============================================
// CORPORATE ACCOUNTS
// ============================================

app.get('/corporates', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    
    const result = await query(`
      SELECT c.*, 
             (SELECT COUNT(*) FROM hotel_bookings WHERE source = 'corporate' AND notes LIKE '%' || c.company_name || '%') as total_room_nights,
             (SELECT SUM(total_amount) FROM hotel_bookings WHERE source = 'corporate' AND notes LIKE '%' || c.company_name || '%') as total_revenue
      FROM hotel_corporate_accounts c
      WHERE c.tenant_id = $1
      ORDER BY c.company_name
    `, [tenantId]);
    
    res.json({ success: true, corporates: result.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/corporates', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { company_name, contact_name, email, phone, address, billing_address, tax_id, discount_rate, credit_limit, payment_terms } = req.body;
    
    const accountCode = `CORP${Date.now().toString(36).toUpperCase()}`;
    
    const result = await query(`
      INSERT INTO hotel_corporate_accounts (tenant_id, account_code, company_name, contact_name, email, phone, address, billing_address, tax_id, discount_rate, credit_limit, payment_terms, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active')
      RETURNING *
    `, [tenantId, accountCode, company_name, contact_name, email, phone, address, billing_address, tax_id, discount_rate || 10, credit_limit || 0, payment_terms || 30]);
    
    res.json({ success: true, corporate: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// STATS
// ============================================

app.get('/stats', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    
    const result = await query(`
      SELECT 
        (SELECT COUNT(*) FROM hotel_travel_agents WHERE tenant_id = $1 AND status = 'active') as active_agents,
        (SELECT COUNT(*) FROM hotel_corporate_accounts WHERE tenant_id = $1 AND status = 'active') as active_corporates,
        (SELECT SUM(commission_amount) FROM hotel_agent_bookings WHERE tenant_id = $1 AND commission_paid = false) as pending_commissions,
        (SELECT COUNT(*) FROM hotel_agent_bookings WHERE tenant_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '30 days') as bookings_30d
    `, [tenantId]);
    
    res.json({ success: true, stats: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/healthz', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME }));
app.get('/readyz', (req, res) => res.json({ status: natsReady ? 'ready' : 'degraded' }));


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

const PORT = process.env.PORT || 8936;
app.listen(PORT, () => console.log(`✅ Travel Agent Portal Service listening on ${PORT}`));
