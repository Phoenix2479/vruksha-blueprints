// Revenue Management AI Service
// Dynamic pricing, demand forecasting, and rate optimization

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
const SERVICE_NAME = 'revenue_management';
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
// DEMAND FORECASTING
// ============================================

app.get('/forecast', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { from_date, to_date, room_type } = req.query;
    
    // Get historical data for forecasting
    const historicalRes = await query(`
      SELECT DATE(check_in_date) as date, COUNT(*) as bookings, 
             AVG(total_amount / GREATEST(1, EXTRACT(day FROM check_out_date - check_in_date))) as adr
      FROM hotel_bookings
      WHERE tenant_id = $1 AND status IN ('confirmed', 'checked_in', 'checked_out')
        AND check_in_date >= NOW() - INTERVAL '365 days'
      GROUP BY DATE(check_in_date)
      ORDER BY date
    `, [tenantId]);
    
    // Simple forecasting model (in production, use ML)
    const forecast = [];
    const start = new Date(from_date || new Date());
    const end = new Date(to_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
    
    // Calculate averages by day of week
    const dayAvg = {};
    historicalRes.rows.forEach(row => {
      const dow = new Date(row.date).getDay();
      if (!dayAvg[dow]) dayAvg[dow] = { bookings: [], adr: [] };
      dayAvg[dow].bookings.push(parseInt(row.bookings));
      dayAvg[dow].adr.push(parseFloat(row.adr) || 0);
    });
    
    Object.keys(dayAvg).forEach(dow => {
      const b = dayAvg[dow].bookings;
      const a = dayAvg[dow].adr;
      dayAvg[dow] = {
        avg_bookings: b.reduce((s, v) => s + v, 0) / b.length,
        avg_adr: a.reduce((s, v) => s + v, 0) / a.length,
      };
    });
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      const avg = dayAvg[dow] || { avg_bookings: 5, avg_adr: 100 };
      
      // Add some variance
      const variance = 0.2;
      const demand = Math.round(avg.avg_bookings * (1 + (Math.random() - 0.5) * variance));
      const suggestedRate = Math.round(avg.avg_adr * (1 + (demand > avg.avg_bookings ? 0.1 : -0.05)));
      
      forecast.push({
        date: d.toISOString().split('T')[0],
        predicted_demand: demand,
        demand_level: demand > avg.avg_bookings * 1.2 ? 'high' : demand < avg.avg_bookings * 0.8 ? 'low' : 'normal',
        suggested_rate: suggestedRate,
        confidence: 0.7 + Math.random() * 0.2,
      });
    }
    
    res.json({ success: true, forecast });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// RATE RECOMMENDATIONS
// ============================================

app.get('/recommendations', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    // Get current rates
    const currentRates = await query(`
      SELECT room_type, bar_rate FROM hotel_bar_rates WHERE tenant_id = $1 AND rate_date = $2
    `, [tenantId, targetDate]);
    
    // Get competitor rates
    const competitorRates = await query(`
      SELECT AVG(rate) as avg_rate, room_type FROM hotel_competitor_rates
      WHERE tenant_id = $1 AND rate_date = $2
      GROUP BY room_type
    `, [tenantId, targetDate]);
    
    // Get occupancy forecast
    const occupancyRes = await query(`
      SELECT COUNT(*) as booked FROM hotel_bookings
      WHERE tenant_id = $1 AND check_in_date <= $2 AND check_out_date > $2
        AND status IN ('confirmed', 'checked_in')
    `, [tenantId, targetDate]);
    
    const totalRoomsRes = await query(`SELECT COUNT(*) FROM hotel_rooms WHERE tenant_id = $1`, [tenantId]);
    
    const occupancy = parseInt(occupancyRes.rows[0].booked) / Math.max(1, parseInt(totalRoomsRes.rows[0].count));
    
    // Generate recommendations
    const recommendations = currentRates.rows.map(rate => {
      const compRate = competitorRates.rows.find(c => c.room_type === rate.room_type);
      const compAvg = compRate ? parseFloat(compRate.avg_rate) : rate.bar_rate;
      
      let action = 'maintain';
      let suggestedRate = rate.bar_rate;
      let reason = '';
      
      if (occupancy > 0.85) {
        action = 'increase';
        suggestedRate = Math.round(rate.bar_rate * 1.15);
        reason = 'High occupancy - demand exceeds supply';
      } else if (occupancy < 0.5) {
        action = 'decrease';
        suggestedRate = Math.round(rate.bar_rate * 0.9);
        reason = 'Low occupancy - stimulate demand';
      } else if (rate.bar_rate > compAvg * 1.2) {
        action = 'decrease';
        suggestedRate = Math.round(compAvg * 1.1);
        reason = 'Rate significantly above competitors';
      } else if (rate.bar_rate < compAvg * 0.8) {
        action = 'increase';
        suggestedRate = Math.round(compAvg * 0.95);
        reason = 'Opportunity to increase rates';
      }
      
      return {
        room_type: rate.room_type,
        current_rate: rate.bar_rate,
        competitor_avg: Math.round(compAvg),
        suggested_rate: suggestedRate,
        action,
        reason,
        potential_impact: action === 'increase' ? '+' + Math.round((suggestedRate - rate.bar_rate) * occupancy * 10) : 
                          action === 'decrease' ? 'Volume increase expected' : 'Stable',
      };
    });
    
    res.json({
      success: true,
      date: targetDate,
      occupancy: Math.round(occupancy * 100),
      recommendations,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/recommendations/apply', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { recommendations } = req.body; // Array of { room_type, date, new_rate }
    
    await client.query('BEGIN');
    
    for (const rec of recommendations) {
      await client.query(`
        INSERT INTO hotel_bar_rates (tenant_id, room_type, rate_date, bar_rate, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (tenant_id, room_type, rate_date)
        DO UPDATE SET bar_rate = $4, updated_at = NOW()
      `, [tenantId, rec.room_type, rec.date, rec.new_rate]);
      
      // Log the change
      await client.query(`
        INSERT INTO revenue_rate_changes (tenant_id, room_type, rate_date, old_rate, new_rate, source, created_at)
        VALUES ($1, $2, $3, $4, $5, 'ai_recommendation', NOW())
      `, [tenantId, rec.room_type, rec.date, rec.old_rate, rec.new_rate]);
    }
    
    await client.query('COMMIT');
    
    await publishEnvelope('hospitality.revenue.rates_updated.v1', 1, { count: recommendations.length });
    
    res.json({ success: true, applied: recommendations.length });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ============================================
// PRICING RULES
// ============================================

app.get('/rules', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const result = await query(`
      SELECT * FROM revenue_pricing_rules WHERE tenant_id = $1 ORDER BY priority
    `, [tenantId]);
    res.json({ success: true, rules: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/rules', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { name, rule_type, conditions, action_type, action_value, priority, is_active } = req.body;
    
    const result = await query(`
      INSERT INTO revenue_pricing_rules (tenant_id, name, rule_type, conditions, action_type, action_value, priority, is_active, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *
    `, [tenantId, name, rule_type, JSON.stringify(conditions), action_type, action_value, priority || 100, is_active !== false]);
    
    res.json({ success: true, rule: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// PERFORMANCE ANALYTICS
// ============================================

app.get('/performance', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { period = '30' } = req.query;
    
    const result = await query(`
      SELECT 
        DATE(check_in_date) as date,
        COUNT(*) as room_nights,
        SUM(total_amount) as revenue,
        AVG(total_amount / GREATEST(1, EXTRACT(day FROM check_out_date - check_in_date))) as adr
      FROM hotel_bookings
      WHERE tenant_id = $1 
        AND status IN ('checked_in', 'checked_out')
        AND check_in_date >= NOW() - INTERVAL '${parseInt(period)} days'
      GROUP BY DATE(check_in_date)
      ORDER BY date
    `, [tenantId]);
    
    // Calculate RevPAR
    const totalRoomsRes = await query(`SELECT COUNT(*) FROM hotel_rooms WHERE tenant_id = $1`, [tenantId]);
    const totalRooms = parseInt(totalRoomsRes.rows[0].count) || 1;
    
    const performance = result.rows.map(row => ({
      date: row.date,
      room_nights: parseInt(row.room_nights),
      revenue: parseFloat(row.revenue),
      adr: Math.round(parseFloat(row.adr) || 0),
      occupancy: Math.round((parseInt(row.room_nights) / totalRooms) * 100),
      revpar: Math.round((parseFloat(row.revenue) / totalRooms)),
    }));
    
    res.json({ success: true, performance });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/kpis', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    
    const [currentRes, lastMonthRes, totalRoomsRes] = await Promise.all([
      query(`
        SELECT COUNT(*) as nights, COALESCE(SUM(total_amount), 0) as revenue
        FROM hotel_bookings WHERE tenant_id = $1 AND status IN ('checked_in', 'checked_out')
          AND check_in_date >= DATE_TRUNC('month', NOW())
      `, [tenantId]),
      query(`
        SELECT COUNT(*) as nights, COALESCE(SUM(total_amount), 0) as revenue
        FROM hotel_bookings WHERE tenant_id = $1 AND status IN ('checked_in', 'checked_out')
          AND check_in_date >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
          AND check_in_date < DATE_TRUNC('month', NOW())
      `, [tenantId]),
      query(`SELECT COUNT(*) FROM hotel_rooms WHERE tenant_id = $1`, [tenantId]),
    ]);
    
    const totalRooms = parseInt(totalRoomsRes.rows[0].count) || 1;
    const daysInMonth = new Date().getDate();
    const availableRoomNights = totalRooms * daysInMonth;
    
    const currentNights = parseInt(currentRes.rows[0].nights);
    const currentRevenue = parseFloat(currentRes.rows[0].revenue);
    const lastNights = parseInt(lastMonthRes.rows[0].nights);
    const lastRevenue = parseFloat(lastMonthRes.rows[0].revenue);
    
    res.json({
      success: true,
      kpis: {
        occupancy: Math.round((currentNights / availableRoomNights) * 100),
        adr: currentNights > 0 ? Math.round(currentRevenue / currentNights) : 0,
        revpar: Math.round(currentRevenue / availableRoomNights),
        revenue_mtd: currentRevenue,
        revenue_change: lastRevenue > 0 ? Math.round(((currentRevenue - lastRevenue) / lastRevenue) * 100) : 0,
        room_nights_sold: currentNights,
      }
    });
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
    
    const [rulesRes, changesRes] = await Promise.all([
      query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active) as active FROM revenue_pricing_rules WHERE tenant_id = $1`, [tenantId]),
      query(`SELECT COUNT(*) FROM revenue_rate_changes WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '7 days'`, [tenantId]),
    ]);
    
    res.json({
      success: true,
      stats: {
        total_rules: parseInt(rulesRes.rows[0].total),
        active_rules: parseInt(rulesRes.rows[0].active),
        rate_changes_week: parseInt(changesRes.rows[0].count),
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

const PORT = process.env.PORT || 8919;
app.listen(PORT, () => console.log(`Revenue Management Service listening on ${PORT}`));
