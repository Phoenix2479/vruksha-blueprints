// Rate Manager Service - Niyam Hospitality
// Dynamic rate management with BAR rates, packages, promotions, and yield management

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
  kvStore = { connect: async () => {} };
}

const { query, getClient } = db;
const { publishEnvelope } = sdk;

const app = express();
const SERVICE_NAME = 'rate_manager';
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
// BAR RATES (Best Available Rates)
// ============================================

app.get('/rates/bar', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { room_type, from_date, to_date } = req.query;
    
    let sql = `
      SELECT br.*, rt.name as room_type_name
      FROM hotel_bar_rates br
      LEFT JOIN hotel_room_types rt ON br.room_type = rt.code AND br.tenant_id = rt.tenant_id
      WHERE br.tenant_id = $1
    `;
    const params = [tenantId];
    let idx = 2;
    
    if (room_type) { sql += ` AND br.room_type = $${idx++}`; params.push(room_type); }
    if (from_date) { sql += ` AND br.effective_from <= $${idx++}`; params.push(to_date || from_date); }
    if (to_date) { sql += ` AND (br.effective_to IS NULL OR br.effective_to >= $${idx++})`; params.push(from_date); }
    
    sql += ' ORDER BY br.room_type, br.effective_from';
    const result = await query(sql, params);
    res.json({ success: true, rates: result.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const BarRateSchema = z.object({
  room_type: z.string(),
  rate_name: z.string().default('BAR'),
  single_rate: z.number().positive(),
  double_rate: z.number().positive(),
  extra_adult: z.number().min(0).default(0),
  extra_child: z.number().min(0).default(0),
  effective_from: z.string(),
  effective_to: z.string().optional(),
  min_stay: z.number().min(1).default(1),
  max_stay: z.number().optional(),
  closed_to_arrival: z.boolean().default(false),
  closed_to_departure: z.boolean().default(false)
});

app.post('/rates/bar', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = BarRateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const d = parsed.data;
    const result = await query(`
      INSERT INTO hotel_bar_rates (tenant_id, room_type, rate_name, single_rate, double_rate, extra_adult, extra_child, effective_from, effective_to, min_stay, max_stay, closed_to_arrival, closed_to_departure)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [tenantId, d.room_type, d.rate_name, d.single_rate, d.double_rate, d.extra_adult, d.extra_child, d.effective_from, d.effective_to, d.min_stay, d.max_stay, d.closed_to_arrival, d.closed_to_departure]);
    
    await publishEnvelope('hospitality.rate_manager.rate_updated.v1', 1, { rate_id: result.rows[0].id, room_type: d.room_type });
    res.json({ success: true, rate: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// RATE CALENDAR (Day-by-day pricing)
// ============================================

app.get('/rates/calendar', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { room_type, from_date, to_date } = req.query;
    
    if (!from_date || !to_date) return res.status(400).json({ error: 'from_date and to_date required' });
    
    const result = await query(`
      SELECT * FROM hotel_rate_calendar
      WHERE tenant_id = $1 AND rate_date >= $2 AND rate_date <= $3
      ${room_type ? 'AND room_type = $4' : ''}
      ORDER BY room_type, rate_date
    `, room_type ? [tenantId, from_date, to_date, room_type] : [tenantId, from_date, to_date]);
    
    res.json({ success: true, calendar: result.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/rates/calendar/bulk', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { room_type, from_date, to_date, price, rate_type, min_stay, is_closed } = req.body;
    
    await client.query('BEGIN');
    
    const start = new Date(from_date);
    const end = new Date(to_date);
    let count = 0;
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      await client.query(`
        INSERT INTO hotel_rate_calendar (tenant_id, room_type, rate_date, price, rate_type, min_stay, is_closed)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (tenant_id, room_type, rate_date) 
        DO UPDATE SET price = $4, rate_type = $5, min_stay = $6, is_closed = $7, updated_at = NOW()
      `, [tenantId, room_type, dateStr, price, rate_type || 'bar', min_stay || 1, is_closed || false]);
      count++;
    }
    
    await client.query('COMMIT');
    res.json({ success: true, updated: count });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

// ============================================
// PACKAGES
// ============================================

app.get('/packages', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { active_only } = req.query;
    
    let sql = `SELECT * FROM hotel_packages WHERE tenant_id = $1`;
    if (active_only === 'true') sql += ` AND is_active = true AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)`;
    sql += ' ORDER BY name';
    
    const result = await query(sql, [tenantId]);
    res.json({ success: true, packages: result.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const PackageSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  package_type: z.enum(['inclusive', 'add_on', 'value_add']).default('inclusive'),
  base_rate_type: z.enum(['bar', 'fixed', 'discount']).default('bar'),
  rate_adjustment: z.number().default(0),
  rate_adjustment_type: z.enum(['percentage', 'fixed']).default('percentage'),
  inclusions: z.array(z.string()).default([]),
  applicable_room_types: z.array(z.string()).optional(),
  valid_from: z.string().optional(),
  valid_to: z.string().optional(),
  min_nights: z.number().min(1).default(1),
  max_nights: z.number().optional(),
  booking_window_start: z.number().optional(),
  booking_window_end: z.number().optional(),
  is_active: z.boolean().default(true)
});

app.post('/packages', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = PackageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const d = parsed.data;
    const result = await query(`
      INSERT INTO hotel_packages (tenant_id, code, name, description, package_type, base_rate_type, rate_adjustment, rate_adjustment_type, inclusions, applicable_room_types, valid_from, valid_to, min_nights, max_nights, booking_window_start, booking_window_end, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `, [tenantId, d.code, d.name, d.description, d.package_type, d.base_rate_type, d.rate_adjustment, d.rate_adjustment_type, d.inclusions, d.applicable_room_types, d.valid_from, d.valid_to, d.min_nights, d.max_nights, d.booking_window_start, d.booking_window_end, d.is_active]);
    
    await publishEnvelope('hospitality.rate_manager.package_created.v1', 1, { package_id: result.rows[0].id, code: d.code });
    res.json({ success: true, package: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// SEASONAL RATES
// ============================================

app.get('/seasons', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const result = await query(`
      SELECT * FROM hotel_seasons WHERE tenant_id = $1 ORDER BY start_date
    `, [tenantId]);
    res.json({ success: true, seasons: result.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/seasons', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { name, season_type, start_date, end_date, rate_multiplier, color } = req.body;
    
    const result = await query(`
      INSERT INTO hotel_seasons (tenant_id, name, season_type, start_date, end_date, rate_multiplier, color)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [tenantId, name, season_type || 'regular', start_date, end_date, rate_multiplier || 1.0, color]);
    
    res.json({ success: true, season: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// COMPETITOR RATES (for yield management)
// ============================================

app.get('/competitors', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const result = await query(`
      SELECT * FROM hotel_competitors WHERE tenant_id = $1 ORDER BY name
    `, [tenantId]);
    res.json({ success: true, competitors: result.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/competitors/rates', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { competitor_id, from_date, to_date } = req.query;
    
    let sql = `
      SELECT cr.*, c.name as competitor_name
      FROM hotel_competitor_rates cr
      JOIN hotel_competitors c ON cr.competitor_id = c.id
      WHERE cr.tenant_id = $1
    `;
    const params = [tenantId];
    let idx = 2;
    
    if (competitor_id) { sql += ` AND cr.competitor_id = $${idx++}`; params.push(competitor_id); }
    if (from_date) { sql += ` AND cr.rate_date >= $${idx++}`; params.push(from_date); }
    if (to_date) { sql += ` AND cr.rate_date <= $${idx++}`; params.push(to_date); }
    
    sql += ' ORDER BY cr.rate_date DESC LIMIT 100';
    const result = await query(sql, params);
    res.json({ success: true, rates: result.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// RATE RECOMMENDATIONS (AI-powered)
// ============================================

app.get('/recommendations', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { room_type, date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    // Get current occupancy and competitor rates
    const [occupancyRes, competitorRes, historyRes] = await Promise.all([
      query(`
        SELECT COUNT(*) as booked, 
               (SELECT COUNT(*) FROM hotel_rooms WHERE tenant_id = $1 AND room_type = $2) as total
        FROM hotel_bookings b
        JOIN hotel_rooms r ON b.room_id = r.id
        WHERE b.tenant_id = $1 AND r.room_type = $2
          AND $3 BETWEEN DATE(b.check_in_date) AND DATE(b.check_out_date) - 1
          AND b.status IN ('confirmed', 'checked_in')
      `, [tenantId, room_type, targetDate]),
      query(`
        SELECT AVG(rate) as avg_competitor_rate
        FROM hotel_competitor_rates
        WHERE tenant_id = $1 AND rate_date = $2
      `, [tenantId, targetDate]),
      query(`
        SELECT AVG(total_amount / GREATEST(1, EXTRACT(DAY FROM check_out_date - check_in_date))) as avg_adr
        FROM hotel_bookings b
        JOIN hotel_rooms r ON b.room_id = r.id
        WHERE b.tenant_id = $1 AND r.room_type = $2 AND b.status = 'checked_out'
          AND b.check_in_date >= CURRENT_DATE - INTERVAL '30 days'
      `, [tenantId, room_type])
    ]);
    
    const occupancy = occupancyRes.rows[0];
    const occupancyRate = occupancy.total > 0 ? (occupancy.booked / occupancy.total) * 100 : 0;
    const competitorAvg = parseFloat(competitorRes.rows[0]?.avg_competitor_rate) || 0;
    const historicalAdr = parseFloat(historyRes.rows[0]?.avg_adr) || 0;
    
    // Simple recommendation logic
    let recommendation = 'maintain';
    let adjustment = 0;
    let reason = '';
    
    if (occupancyRate > 80) {
      recommendation = 'increase';
      adjustment = 10;
      reason = 'High occupancy indicates strong demand';
    } else if (occupancyRate < 40) {
      recommendation = 'decrease';
      adjustment = -10;
      reason = 'Low occupancy suggests need for competitive pricing';
    }
    
    if (competitorAvg > 0 && historicalAdr > competitorAvg * 1.2) {
      recommendation = 'decrease';
      adjustment = -5;
      reason = 'Current rates significantly above market average';
    }
    
    res.json({
      success: true,
      recommendation: {
        action: recommendation,
        adjustment_percent: adjustment,
        reason,
        metrics: {
          current_occupancy: Math.round(occupancyRate),
          competitor_avg: competitorAvg,
          historical_adr: historicalAdr
        }
      }
    });
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
        (SELECT COUNT(*) FROM hotel_bar_rates WHERE tenant_id = $1) as total_rate_plans,
        (SELECT COUNT(*) FROM hotel_packages WHERE tenant_id = $1 AND is_active = true) as active_packages,
        (SELECT COUNT(*) FROM hotel_seasons WHERE tenant_id = $1) as seasons_defined,
        (SELECT AVG(price) FROM hotel_rate_calendar WHERE tenant_id = $1 AND rate_date = CURRENT_DATE) as avg_rate_today
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

const PORT = process.env.PORT || 8935;
app.listen(PORT, () => console.log(`✅ Rate Manager Service listening on ${PORT}`));
