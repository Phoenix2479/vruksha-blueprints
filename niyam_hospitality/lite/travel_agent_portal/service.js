/**
 * Travel Agent Portal Service - Niyam Hospitality (Max Lite)
 * B2B portal for travel agents and corporate accounts
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8948;
const SERVICE_NAME = 'travel_agent_portal';

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) { app.use(express.static(uiPath)); }

app.get('/health', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME, mode: 'lite' }));

// Simple password hashing for lite version
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function ensureTables() {
  const db = await initDb();
  
  db.run(`CREATE TABLE IF NOT EXISTS travel_agents (
    id TEXT PRIMARY KEY, agent_code TEXT UNIQUE NOT NULL, company_name TEXT NOT NULL,
    contact_name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, phone TEXT, address TEXT,
    city TEXT, country TEXT, iata_number TEXT, tax_id TEXT,
    agent_type TEXT DEFAULT 'travel_agent', commission_rate REAL DEFAULT 10,
    payment_terms INTEGER DEFAULT 30, credit_limit REAL DEFAULT 0,
    current_balance REAL DEFAULT 0, special_rates INTEGER DEFAULT 0,
    password_hash TEXT, status TEXT DEFAULT 'pending', last_login_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS agent_rates (
    id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, room_type TEXT NOT NULL,
    rate REAL NOT NULL, rate_type TEXT DEFAULT 'net', valid_from TEXT, valid_to TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(agent_id, room_type)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS agent_bookings (
    id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, booking_id TEXT,
    confirmation_number TEXT UNIQUE, guest_name TEXT NOT NULL, guest_email TEXT,
    guest_phone TEXT, room_type TEXT, room_id TEXT, check_in TEXT NOT NULL,
    check_out TEXT NOT NULL, adults INTEGER DEFAULT 1, children INTEGER DEFAULT 0,
    gross_amount REAL NOT NULL, net_amount REAL, commission_rate REAL,
    commission_amount REAL DEFAULT 0, rate_type TEXT DEFAULT 'commissionable',
    commission_paid INTEGER DEFAULT 0, commission_paid_date TEXT, payment_reference TEXT,
    status TEXT DEFAULT 'pending', notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS corporate_accounts (
    id TEXT PRIMARY KEY, account_code TEXT UNIQUE NOT NULL, company_name TEXT NOT NULL,
    contact_name TEXT, email TEXT, phone TEXT, address TEXT, billing_address TEXT,
    tax_id TEXT, discount_rate REAL DEFAULT 10, credit_limit REAL DEFAULT 0,
    current_balance REAL DEFAULT 0, payment_terms INTEGER DEFAULT 30,
    status TEXT DEFAULT 'active', created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS corporate_bookings (
    id TEXT PRIMARY KEY, corporate_id TEXT NOT NULL, booking_id TEXT,
    confirmation_number TEXT, booker_name TEXT, booker_email TEXT,
    guest_name TEXT NOT NULL, check_in TEXT, check_out TEXT,
    room_type TEXT, gross_amount REAL, discount_amount REAL DEFAULT 0,
    net_amount REAL, status TEXT DEFAULT 'confirmed', invoice_number TEXT,
    invoice_date TEXT, paid INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS agent_statements (
    id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, statement_date TEXT NOT NULL,
    period_start TEXT, period_end TEXT, opening_balance REAL DEFAULT 0,
    total_bookings REAL DEFAULT 0, total_commissions REAL DEFAULT 0,
    payments_received REAL DEFAULT 0, closing_balance REAL DEFAULT 0,
    status TEXT DEFAULT 'draft', sent_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  return db;
}

// TRAVEL AGENTS
app.get('/agents', async (req, res) => {
  try {
    await ensureTables();
    const { status, search, agent_type } = req.query;
    let sql = `SELECT a.*, 
               (SELECT COUNT(*) FROM agent_bookings WHERE agent_id = a.id) as total_bookings,
               (SELECT SUM(commission_amount) FROM agent_bookings WHERE agent_id = a.id AND commission_paid = 0) as pending_commission,
               (SELECT SUM(gross_amount) FROM agent_bookings WHERE agent_id = a.id AND created_at > datetime('now', '-30 days')) as revenue_30d
               FROM travel_agents a WHERE 1=1`;
    const params = [];
    if (status) { sql += ` AND a.status = ?`; params.push(status); }
    if (agent_type) { sql += ` AND a.agent_type = ?`; params.push(agent_type); }
    if (search) { sql += ` AND (a.company_name LIKE ? OR a.contact_name LIKE ? OR a.email LIKE ?)`; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    sql += ` ORDER BY a.company_name`;
    res.json({ success: true, agents: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/agents/:id', async (req, res) => {
  try {
    await ensureTables();
    const agent = get(`SELECT * FROM travel_agents WHERE id = ?`, [req.params.id]);
    if (!agent) return res.status(404).json({ success: false, error: 'Agent not found' });
    
    const rates = query(`SELECT ar.*, rt.name as room_type_name FROM agent_rates ar LEFT JOIN room_types rt ON ar.room_type = rt.code WHERE ar.agent_id = ?`, [req.params.id]);
    const recentBookings = query(`SELECT * FROM agent_bookings WHERE agent_id = ? ORDER BY created_at DESC LIMIT 10`, [req.params.id]);
    
    delete agent.password_hash;
    res.json({ success: true, agent: { ...agent, rates, recent_bookings: recentBookings } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/agents', async (req, res) => {
  try {
    await ensureTables();
    const { company_name, contact_name, email, phone, address, city, country, iata_number, tax_id, agent_type, commission_rate, payment_terms, credit_limit, special_rates } = req.body;
    
    const id = generateId();
    const agentCode = `TA${Date.now().toString(36).toUpperCase()}`;
    const tempPassword = Math.random().toString(36).slice(2, 10);
    const passwordHash = hashPassword(tempPassword);
    
    run(`INSERT INTO travel_agents (id, agent_code, company_name, contact_name, email, phone, address, city, country, iata_number, tax_id, agent_type, commission_rate, payment_terms, credit_limit, special_rates, password_hash, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      [id, agentCode, company_name, contact_name, email, phone, address, city, country, iata_number, tax_id, agent_type || 'travel_agent', commission_rate || 10, payment_terms || 30, credit_limit || 0, special_rates ? 1 : 0, passwordHash, timestamp()]);
    
    res.json({ success: true, agent: { id, agent_code: agentCode, company_name, email }, temp_password: tempPassword });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/agents/:id', async (req, res) => {
  try {
    await ensureTables();
    const { company_name, contact_name, phone, address, city, country, commission_rate, payment_terms, credit_limit, special_rates, status } = req.body;
    run(`UPDATE travel_agents SET company_name = COALESCE(?, company_name), contact_name = COALESCE(?, contact_name), phone = COALESCE(?, phone), address = COALESCE(?, address), city = COALESCE(?, city), country = COALESCE(?, country), commission_rate = COALESCE(?, commission_rate), payment_terms = COALESCE(?, payment_terms), credit_limit = COALESCE(?, credit_limit), special_rates = COALESCE(?, special_rates), status = COALESCE(?, status) WHERE id = ?`,
      [company_name, contact_name, phone, address, city, country, commission_rate, payment_terms, credit_limit, special_rates, status, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// AGENT LOGIN
app.post('/agents/login', async (req, res) => {
  try {
    await ensureTables();
    const { email, password } = req.body;
    
    const agent = get(`SELECT * FROM travel_agents WHERE email = ? AND status = 'active'`, [email]);
    if (!agent) return res.status(401).json({ success: false, error: 'Invalid credentials' });
    
    const passwordHash = hashPassword(password);
    if (agent.password_hash !== passwordHash) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    
    run(`UPDATE travel_agents SET last_login_at = ? WHERE id = ?`, [timestamp(), agent.id]);
    
    // Simple token (in production use JWT)
    const token = `${agent.id}:${Date.now()}:${crypto.randomBytes(16).toString('hex')}`;
    
    res.json({ success: true, token, agent: { id: agent.id, agent_code: agent.agent_code, company_name: agent.company_name, email: agent.email, commission_rate: agent.commission_rate } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/agents/:id/reset-password', async (req, res) => {
  try {
    await ensureTables();
    const newPassword = Math.random().toString(36).slice(2, 10);
    const passwordHash = hashPassword(newPassword);
    run(`UPDATE travel_agents SET password_hash = ? WHERE id = ?`, [passwordHash, req.params.id]);
    res.json({ success: true, new_password: newPassword });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// AGENT RATES
app.get('/agents/:agentId/rates', async (req, res) => {
  try {
    await ensureTables();
    const rates = query(`SELECT ar.*, rt.name as room_type_name FROM agent_rates ar LEFT JOIN room_types rt ON ar.room_type = rt.code WHERE ar.agent_id = ? AND (ar.valid_to IS NULL OR ar.valid_to >= date('now'))`, [req.params.agentId]);
    res.json({ success: true, rates });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/agents/:agentId/rates', async (req, res) => {
  try {
    await ensureTables();
    const { room_type, rate, rate_type, valid_from, valid_to } = req.body;
    const id = generateId();
    run(`INSERT INTO agent_rates (id, agent_id, room_type, rate, rate_type, valid_from, valid_to, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(agent_id, room_type) DO UPDATE SET rate = ?, rate_type = ?, valid_from = ?, valid_to = ?`,
      [id, req.params.agentId, room_type, rate, rate_type || 'net', valid_from, valid_to, timestamp(), rate, rate_type || 'net', valid_from, valid_to]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// AGENT BOOKINGS
app.get('/bookings', async (req, res) => {
  try {
    await ensureTables();
    const { agent_id, status, from_date, to_date, limit = 100 } = req.query;
    let sql = `SELECT ab.*, ta.company_name as agent_name, ta.agent_code FROM agent_bookings ab LEFT JOIN travel_agents ta ON ab.agent_id = ta.id WHERE 1=1`;
    const params = [];
    if (agent_id) { sql += ` AND ab.agent_id = ?`; params.push(agent_id); }
    if (status) { sql += ` AND ab.status = ?`; params.push(status); }
    if (from_date) { sql += ` AND ab.check_in >= ?`; params.push(from_date); }
    if (to_date) { sql += ` AND ab.check_in <= ?`; params.push(to_date); }
    sql += ` ORDER BY ab.created_at DESC LIMIT ?`;
    params.push(parseInt(limit));
    res.json({ success: true, bookings: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/bookings', async (req, res) => {
  try {
    await ensureTables();
    const { agent_id, guest_name, guest_email, guest_phone, room_type, room_id, check_in, check_out, adults, children, gross_amount, rate_type, notes } = req.body;
    
    // Get agent
    const agent = get(`SELECT * FROM travel_agents WHERE id = ?`, [agent_id]);
    if (!agent) return res.status(404).json({ success: false, error: 'Agent not found' });
    
    // Calculate commission
    let commissionAmount = 0;
    if (rate_type === 'commissionable' || !rate_type) {
      commissionAmount = gross_amount * (agent.commission_rate / 100);
    }
    const netAmount = gross_amount - commissionAmount;
    
    const id = generateId();
    const confirmationNumber = `${agent.agent_code}-${Date.now().toString(36).toUpperCase()}`;
    
    run(`INSERT INTO agent_bookings (id, agent_id, confirmation_number, guest_name, guest_email, guest_phone, room_type, room_id, check_in, check_out, adults, children, gross_amount, net_amount, commission_rate, commission_amount, rate_type, status, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)`,
      [id, agent_id, confirmationNumber, guest_name, guest_email, guest_phone, room_type, room_id, check_in, check_out, adults || 1, children || 0, gross_amount, netAmount, agent.commission_rate, commissionAmount, rate_type || 'commissionable', notes, timestamp()]);
    
    // Create actual reservation
    if (room_id) {
      const reservationId = generateId();
      let guestId = get(`SELECT id FROM guests WHERE email = ?`, [guest_email])?.id;
      if (!guestId) {
        guestId = generateId();
        run(`INSERT INTO guests (id, name, email, phone, source, created_at) VALUES (?, ?, ?, ?, 'travel_agent', ?)`,
          [guestId, guest_name, guest_email, guest_phone, timestamp()]);
      }
      run(`INSERT INTO reservations (id, confirmation_number, guest_id, room_id, check_in_date, check_out_date, adults, children, total_amount, source, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'travel_agent', 'confirmed', ?)`,
        [reservationId, confirmationNumber, guestId, room_id, check_in, check_out, adults || 1, children || 0, gross_amount, timestamp()]);
      run(`UPDATE agent_bookings SET booking_id = ? WHERE id = ?`, [reservationId, id]);
    }
    
    res.json({ success: true, booking: { id, confirmation_number: confirmationNumber, gross_amount, net_amount: netAmount, commission_amount: commissionAmount } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/bookings/:id/cancel', async (req, res) => {
  try {
    await ensureTables();
    const { cancellation_reason } = req.body;
    run(`UPDATE agent_bookings SET status = 'cancelled', notes = COALESCE(notes || ' | ', '') || 'Cancelled: ' || ? WHERE id = ?`,
      [cancellation_reason || 'No reason provided', req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// COMMISSIONS
app.get('/commissions', async (req, res) => {
  try {
    await ensureTables();
    const { agent_id, paid, from_date, to_date } = req.query;
    let sql = `SELECT ab.*, ta.company_name, ta.agent_code FROM agent_bookings ab JOIN travel_agents ta ON ab.agent_id = ta.id WHERE ab.commission_amount > 0`;
    const params = [];
    if (agent_id) { sql += ` AND ab.agent_id = ?`; params.push(agent_id); }
    if (paid === 'true') sql += ` AND ab.commission_paid = 1`;
    else if (paid === 'false') sql += ` AND ab.commission_paid = 0`;
    if (from_date) { sql += ` AND ab.check_out >= ?`; params.push(from_date); }
    if (to_date) { sql += ` AND ab.check_out <= ?`; params.push(to_date); }
    sql += ` ORDER BY ab.check_out DESC`;
    
    const commissions = query(sql, params);
    const total = commissions.reduce((sum, c) => sum + c.commission_amount, 0);
    const paidTotal = commissions.filter(c => c.commission_paid).reduce((sum, c) => sum + c.commission_amount, 0);
    
    res.json({ success: true, commissions, summary: { total, paid: paidTotal, pending: total - paidTotal } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/commissions/pay', async (req, res) => {
  try {
    await ensureTables();
    const { agent_id, booking_ids, payment_reference } = req.body;
    
    let totalPaid = 0;
    let count = 0;
    for (const bookingId of booking_ids || []) {
      const booking = get(`SELECT commission_amount FROM agent_bookings WHERE id = ? AND agent_id = ? AND commission_paid = 0`, [bookingId, agent_id]);
      if (booking) {
        run(`UPDATE agent_bookings SET commission_paid = 1, commission_paid_date = ?, payment_reference = ? WHERE id = ?`,
          [timestamp(), payment_reference, bookingId]);
        totalPaid += booking.commission_amount;
        count++;
      }
    }
    
    res.json({ success: true, paid_count: count, total_paid: totalPaid });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// CORPORATE ACCOUNTS
app.get('/corporates', async (req, res) => {
  try {
    await ensureTables();
    const { status, search } = req.query;
    let sql = `SELECT c.*, (SELECT COUNT(*) FROM corporate_bookings WHERE corporate_id = c.id) as total_bookings, (SELECT SUM(net_amount) FROM corporate_bookings WHERE corporate_id = c.id) as total_revenue FROM corporate_accounts c WHERE 1=1`;
    const params = [];
    if (status) { sql += ` AND c.status = ?`; params.push(status); }
    if (search) { sql += ` AND (c.company_name LIKE ? OR c.contact_name LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
    sql += ` ORDER BY c.company_name`;
    res.json({ success: true, corporates: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/corporates', async (req, res) => {
  try {
    await ensureTables();
    const { company_name, contact_name, email, phone, address, billing_address, tax_id, discount_rate, credit_limit, payment_terms } = req.body;
    const id = generateId();
    const accountCode = `CORP${Date.now().toString(36).toUpperCase()}`;
    run(`INSERT INTO corporate_accounts (id, account_code, company_name, contact_name, email, phone, address, billing_address, tax_id, discount_rate, credit_limit, payment_terms, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      [id, accountCode, company_name, contact_name, email, phone, address, billing_address, tax_id, discount_rate || 10, credit_limit || 0, payment_terms || 30, timestamp()]);
    res.json({ success: true, corporate: { id, account_code: accountCode, company_name } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/corporates/:id/bookings', async (req, res) => {
  try {
    await ensureTables();
    const { booker_name, booker_email, guest_name, check_in, check_out, room_type, gross_amount } = req.body;
    
    const corporate = get(`SELECT * FROM corporate_accounts WHERE id = ?`, [req.params.id]);
    if (!corporate) return res.status(404).json({ success: false, error: 'Corporate account not found' });
    
    const discountAmount = gross_amount * (corporate.discount_rate / 100);
    const netAmount = gross_amount - discountAmount;
    
    const id = generateId();
    const confirmationNumber = `${corporate.account_code}-${Date.now().toString(36).toUpperCase()}`;
    
    run(`INSERT INTO corporate_bookings (id, corporate_id, confirmation_number, booker_name, booker_email, guest_name, check_in, check_out, room_type, gross_amount, discount_amount, net_amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)`,
      [id, req.params.id, confirmationNumber, booker_name, booker_email, guest_name, check_in, check_out, room_type, gross_amount, discountAmount, netAmount, timestamp()]);
    
    res.json({ success: true, booking: { id, confirmation_number: confirmationNumber, gross_amount, discount_amount: discountAmount, net_amount: netAmount } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// STATS
app.get('/stats', async (req, res) => {
  try {
    await ensureTables();
    const agents = get(`SELECT COUNT(*) as count FROM travel_agents WHERE status = 'active'`);
    const corporates = get(`SELECT COUNT(*) as count FROM corporate_accounts WHERE status = 'active'`);
    const pendingCommissions = get(`SELECT SUM(commission_amount) as amount FROM agent_bookings WHERE commission_paid = 0`);
    const bookings30d = get(`SELECT COUNT(*) as count, SUM(gross_amount) as revenue FROM agent_bookings WHERE created_at > datetime('now', '-30 days')`);
    
    res.json({
      success: true,
      stats: {
        active_agents: agents?.count || 0,
        active_corporates: corporates?.count || 0,
        pending_commissions: pendingCommissions?.amount || 0,
        bookings_30d: bookings30d?.count || 0,
        revenue_30d: bookings30d?.revenue || 0
      }
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

async function start() {
  await ensureTables();
  app.get('*', (req, res) => {
    if (fs.existsSync(path.join(uiPath, 'index.html'))) res.sendFile(path.join(uiPath, 'index.html'));
    else res.json({ service: SERVICE_NAME, mode: 'lite', status: 'running' });
  });
  app.listen(PORT, () => console.log(`✅ ${SERVICE_NAME} (Lite) running on port ${PORT}`));
}

start();
