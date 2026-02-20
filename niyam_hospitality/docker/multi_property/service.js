// Multi-Property Management Service
// Central dashboard for hotel chains

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const promClient = require('prom-client');

let db, sdk;
try {
  db = require('../../../../db/postgres');
  sdk = require('../../../../platform/sdk/node');
} catch (_) {
  db = { query: async () => ({ rows: [] }), getClient: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) };
  sdk = { publishEnvelope: async () => {} };
}

const { query, getClient } = db;
const { publishEnvelope } = sdk;

const app = express();
const SERVICE_NAME = 'multi_property';
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

const getTenantId = (req) => req.headers['x-tenant-id'] || DEFAULT_TENANT_ID;

// ============================================
// PROPERTIES
// ============================================

app.get('/properties', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const result = await query(`
      SELECT p.*,
             (SELECT COUNT(*) FROM hotel_rooms WHERE property_id = p.id) as total_rooms,
             (SELECT COUNT(*) FROM hotel_rooms WHERE property_id = p.id AND status = 'occupied') as occupied_rooms,
             (SELECT COALESCE(SUM(total_amount), 0) FROM hotel_bookings WHERE property_id = p.id AND check_in_date >= DATE_TRUNC('month', NOW())) as revenue_mtd
      FROM properties p
      WHERE p.tenant_id = $1 AND p.is_active = true
      ORDER BY p.name
    `, [tenantId]);
    res.json({ success: true, properties: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/properties', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { code, name, type, address, city, country, phone, email, timezone, currency, settings } = req.body;
    
    const result = await query(`
      INSERT INTO properties (tenant_id, code, name, type, address, city, country, phone, email, timezone, currency, settings, is_active, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, NOW())
      RETURNING *
    `, [tenantId, code, name, type, address, city, country, phone, email, timezone || 'UTC', currency || 'USD', JSON.stringify(settings || {})]);
    
    res.json({ success: true, property: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/properties/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    const result = await query(`SELECT * FROM properties WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Property not found' });
    
    res.json({ success: true, property: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// PORTFOLIO DASHBOARD
// ============================================

app.get('/dashboard', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    
    const [propertiesRes, occupancyRes, revenueRes, arrivalsRes] = await Promise.all([
      query(`SELECT COUNT(*) FROM properties WHERE tenant_id = $1 AND is_active = true`, [tenantId]),
      query(`
        SELECT 
          (SELECT COUNT(*) FROM hotel_rooms r JOIN properties p ON r.property_id = p.id WHERE p.tenant_id = $1) as total_rooms,
          (SELECT COUNT(*) FROM hotel_rooms r JOIN properties p ON r.property_id = p.id WHERE p.tenant_id = $1 AND r.status = 'occupied') as occupied
      `, [tenantId]),
      query(`
        SELECT COALESCE(SUM(total_amount), 0) as revenue
        FROM hotel_bookings b
        JOIN properties p ON b.property_id = p.id
        WHERE p.tenant_id = $1 AND b.check_in_date >= DATE_TRUNC('month', NOW())
      `, [tenantId]),
      query(`
        SELECT COUNT(*) FROM hotel_bookings b
        JOIN properties p ON b.property_id = p.id
        WHERE p.tenant_id = $1 AND DATE(b.check_in_date) = CURRENT_DATE AND b.status = 'confirmed'
      `, [tenantId]),
    ]);
    
    const totalRooms = parseInt(occupancyRes.rows[0].total_rooms) || 1;
    const occupiedRooms = parseInt(occupancyRes.rows[0].occupied) || 0;
    
    res.json({
      success: true,
      dashboard: {
        total_properties: parseInt(propertiesRes.rows[0].count),
        total_rooms: totalRooms,
        portfolio_occupancy: Math.round((occupiedRooms / totalRooms) * 100),
        revenue_mtd: parseFloat(revenueRes.rows[0].revenue),
        arrivals_today: parseInt(arrivalsRes.rows[0].count),
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/dashboard/comparison', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    
    const result = await query(`
      SELECT 
        p.id, p.name, p.code, p.city,
        (SELECT COUNT(*) FROM hotel_rooms WHERE property_id = p.id) as total_rooms,
        (SELECT COUNT(*) FROM hotel_rooms WHERE property_id = p.id AND status = 'occupied') as occupied_rooms,
        (SELECT COALESCE(SUM(total_amount), 0) FROM hotel_bookings WHERE property_id = p.id AND check_in_date >= DATE_TRUNC('month', NOW())) as revenue_mtd,
        (SELECT COALESCE(AVG(total_amount / GREATEST(1, EXTRACT(day FROM check_out_date - check_in_date))), 0)
         FROM hotel_bookings WHERE property_id = p.id AND check_in_date >= DATE_TRUNC('month', NOW())) as adr
      FROM properties p
      WHERE p.tenant_id = $1 AND p.is_active = true
      ORDER BY revenue_mtd DESC
    `, [tenantId]);
    
    const comparison = result.rows.map(row => ({
      ...row,
      occupancy: Math.round((parseInt(row.occupied_rooms) / Math.max(1, parseInt(row.total_rooms))) * 100),
      adr: Math.round(parseFloat(row.adr)),
      revpar: Math.round(parseFloat(row.revenue_mtd) / Math.max(1, parseInt(row.total_rooms) * new Date().getDate())),
    }));
    
    res.json({ success: true, comparison });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// CROSS-PROPERTY REPORTS
// ============================================

app.get('/reports/occupancy', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { days = 30 } = req.query;
    
    const result = await query(`
      SELECT 
        p.id as property_id, p.name as property_name,
        DATE(b.check_in_date) as date,
        COUNT(*) as room_nights
      FROM hotel_bookings b
      JOIN properties p ON b.property_id = p.id
      WHERE p.tenant_id = $1 
        AND b.status IN ('checked_in', 'checked_out')
        AND b.check_in_date >= NOW() - INTERVAL '${parseInt(days)} days'
      GROUP BY p.id, p.name, DATE(b.check_in_date)
      ORDER BY date, p.name
    `, [tenantId]);
    
    res.json({ success: true, data: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/reports/revenue', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { period = 'month' } = req.query;
    
    let dateFormat, interval;
    if (period === 'week') { dateFormat = 'YYYY-IW'; interval = '8 weeks'; }
    else if (period === 'month') { dateFormat = 'YYYY-MM'; interval = '12 months'; }
    else { dateFormat = 'YYYY-MM-DD'; interval = '30 days'; }
    
    const result = await query(`
      SELECT 
        p.id as property_id, p.name as property_name,
        TO_CHAR(b.check_in_date, '${dateFormat}') as period,
        COALESCE(SUM(b.total_amount), 0) as revenue,
        COUNT(*) as bookings
      FROM hotel_bookings b
      JOIN properties p ON b.property_id = p.id
      WHERE p.tenant_id = $1 
        AND b.check_in_date >= NOW() - INTERVAL '${interval}'
      GROUP BY p.id, p.name, TO_CHAR(b.check_in_date, '${dateFormat}')
      ORDER BY period, p.name
    `, [tenantId]);
    
    res.json({ success: true, data: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// CENTRALIZED SETTINGS
// ============================================

app.get('/settings/rate-plans', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const result = await query(`
      SELECT * FROM chain_rate_plans WHERE tenant_id = $1 ORDER BY name
    `, [tenantId]);
    res.json({ success: true, rate_plans: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/settings/rate-plans', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { code, name, description, base_rate_modifier, applies_to_properties } = req.body;
    
    const result = await query(`
      INSERT INTO chain_rate_plans (tenant_id, code, name, description, base_rate_modifier, applies_to_properties, is_active, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, true, NOW())
      RETURNING *
    `, [tenantId, code, name, description, base_rate_modifier || 1.0, JSON.stringify(applies_to_properties || [])]);
    
    res.json({ success: true, rate_plan: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/settings/push-rates', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { rate_plan_id, property_ids, from_date, to_date } = req.body;
    
    // Queue rate push job
    const result = await query(`
      INSERT INTO chain_rate_push_jobs (tenant_id, rate_plan_id, property_ids, date_from, date_to, status, created_at)
      VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
      RETURNING *
    `, [tenantId, rate_plan_id, JSON.stringify(property_ids), from_date, to_date]);
    
    await publishEnvelope('hospitality.chain.rate_push_requested.v1', 1, { job_id: result.rows[0].id });
    
    res.json({ success: true, job: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// ALERTS & NOTIFICATIONS
// ============================================

app.get('/alerts', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const result = await query(`
      SELECT a.*, p.name as property_name
      FROM chain_alerts a
      LEFT JOIN properties p ON a.property_id = p.id
      WHERE a.tenant_id = $1 AND a.is_resolved = false
      ORDER BY a.severity DESC, a.created_at DESC
    `, [tenantId]);
    res.json({ success: true, alerts: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/alerts/:id/resolve', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    await query(`
      UPDATE chain_alerts SET is_resolved = true, resolved_at = NOW() WHERE id = $1 AND tenant_id = $2
    `, [id, tenantId]);
    
    res.json({ success: true });
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
    
    const [propsRes, alertsRes] = await Promise.all([
      query(`SELECT COUNT(*) FROM properties WHERE tenant_id = $1 AND is_active = true`, [tenantId]),
      query(`SELECT COUNT(*) FROM chain_alerts WHERE tenant_id = $1 AND is_resolved = false`, [tenantId]),
    ]);
    
    res.json({
      success: true,
      stats: {
        total_properties: parseInt(propsRes.rows[0].count),
        active_alerts: parseInt(alertsRes.rows[0].count),
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health
app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
app.get('/readyz', (req, res) => res.json({ status: 'ready' }));


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

const PORT = process.env.PORT || 8891;
app.listen(PORT, () => console.log(`Multi-Property Service listening on ${PORT}`));
