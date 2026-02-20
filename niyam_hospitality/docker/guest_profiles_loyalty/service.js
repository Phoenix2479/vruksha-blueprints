// Guest Profiles & Loyalty Service - Niyam Hospitality
// Manages guest profiles, preferences, loyalty points, and history

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const promClient = require('prom-client');
const { z } = require('zod');

let db, sdk, kvStore;
try {
  db = require('../../../../db/postgres');
  sdk = require('../../../../platform/sdk/node');
  kvStore = require('../../../../platform/nats/kv_store');
} catch (_) {
  db = require('@vruksha/platform/db/postgres');
  sdk = require('@vruksha/platform/sdk/node');
  kvStore = require('@vruksha/platform/nats/kv_store');
}

const { query, getClient } = db;
const { publishEnvelope } = sdk;

const app = express();
const SERVICE_NAME = 'guest_profiles_loyalty';
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Observability
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
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

// NATS KV
let dbReady = false;
(async () => {
  try {
    await kvStore.connect();
    console.log(`✅ ${SERVICE_NAME}: NATS KV Connected`);
    dbReady = true;
  } catch (e) {
    console.error(`❌ ${SERVICE_NAME}: NATS KV Failed`, e);
  }
})();

// ============================================
// GUEST PROFILES
// ============================================

app.get('/guests', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { search, limit = 50 } = req.query;
    
    let sql = `
      SELECT g.*, 
        (SELECT COUNT(*) FROM hotel_bookings WHERE guest_id = g.id) as total_stays,
        (SELECT COALESCE(SUM(total_amount), 0) FROM hotel_bookings WHERE guest_id = g.id AND status = 'checked_out') as lifetime_value
      FROM hotel_guests g
      WHERE g.tenant_id = $1
    `;
    const params = [tenantId];
    
    if (search) {
      sql += ` AND (g.full_name ILIKE $2 OR g.email ILIKE $2 OR g.phone ILIKE $2)`;
      params.push(`%${search}%`);
    }
    
    sql += ` ORDER BY g.created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));
    
    const result = await query(sql, params);
    res.json({ success: true, guests: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/guests/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    const guestRes = await query(`
      SELECT * FROM hotel_guests WHERE id = $1 AND tenant_id = $2
    `, [id, tenantId]);
    
    if (guestRes.rowCount === 0) {
      return res.status(404).json({ error: 'Guest not found' });
    }
    
    // Get stay history
    const historyRes = await query(`
      SELECT b.id, b.check_in_date, b.check_out_date, b.status, b.total_amount,
             r.room_number, r.room_type
      FROM hotel_bookings b
      JOIN hotel_rooms r ON b.room_id = r.id
      WHERE b.guest_id = $1
      ORDER BY b.check_in_date DESC
      LIMIT 10
    `, [id]);
    
    // Calculate stats
    const statsRes = await query(`
      SELECT 
        COUNT(*) as total_stays,
        COALESCE(SUM(total_amount), 0) as lifetime_value,
        COALESCE(AVG(total_amount), 0) as avg_spend
      FROM hotel_bookings
      WHERE guest_id = $1 AND status = 'checked_out'
    `, [id]);
    
    res.json({
      success: true,
      guest: guestRes.rows[0],
      stay_history: historyRes.rows,
      stats: statsRes.rows[0]
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const GuestSchema = z.object({
  full_name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  id_proof_type: z.string().optional(),
  id_proof_number: z.string().optional(),
  address: z.string().optional(),
  preferences: z.object({}).passthrough().optional()
});

app.post('/guests', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = GuestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const data = parsed.data;
    
    const result = await query(`
      INSERT INTO hotel_guests (tenant_id, full_name, email, phone, id_proof_type, id_proof_number, address, preferences)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [tenantId, data.full_name, data.email, data.phone, data.id_proof_type, 
        data.id_proof_number, data.address, JSON.stringify(data.preferences || {})]);
    
    res.json({ success: true, guest: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/guests/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const updates = req.body;
    
    const fields = [];
    const values = [id, tenantId];
    let paramIdx = 3;
    
    const allowedFields = ['full_name', 'email', 'phone', 'id_proof_type', 'id_proof_number', 'address', 'preferences'];
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = $${paramIdx++}`);
        values.push(key === 'preferences' ? JSON.stringify(value) : value);
      }
    }
    
    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    const result = await query(`
      UPDATE hotel_guests SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
      RETURNING *
    `, values);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Guest not found' });
    }
    
    res.json({ success: true, guest: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// LOYALTY POINTS
// ============================================

app.get('/loyalty/:guest_id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { guest_id } = req.params;
    
    const guestRes = await query(`
      SELECT id, full_name, loyalty_points FROM hotel_guests
      WHERE id = $1 AND tenant_id = $2
    `, [guest_id, tenantId]);
    
    if (guestRes.rowCount === 0) {
      return res.status(404).json({ error: 'Guest not found' });
    }
    
    const guest = guestRes.rows[0];
    const points = guest.loyalty_points || 0;
    
    // Determine tier
    let tier = 'Bronze';
    if (points >= 10000) tier = 'Platinum';
    else if (points >= 5000) tier = 'Gold';
    else if (points >= 1000) tier = 'Silver';
    
    res.json({
      success: true,
      loyalty: {
        guest_id,
        guest_name: guest.full_name,
        points,
        tier,
        points_to_next_tier: tier === 'Platinum' ? 0 : 
          tier === 'Gold' ? 10000 - points :
          tier === 'Silver' ? 5000 - points : 1000 - points,
        point_value: points * 0.01 // $0.01 per point
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/loyalty/:guest_id/earn', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { guest_id } = req.params;
    const { amount, reason } = req.body;
    
    // Earn 10 points per dollar spent
    const pointsToAdd = Math.floor(amount * 10);
    
    const result = await query(`
      UPDATE hotel_guests 
      SET loyalty_points = COALESCE(loyalty_points, 0) + $1, updated_at = NOW()
      WHERE id = $2 AND tenant_id = $3
      RETURNING id, full_name, loyalty_points
    `, [pointsToAdd, guest_id, tenantId]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Guest not found' });
    }
    
    await publishEnvelope('hospitality.loyalty.points_earned.v1', 1, {
      guest_id,
      points_earned: pointsToAdd,
      reason,
      new_balance: result.rows[0].loyalty_points
    });
    
    res.json({
      success: true,
      points_earned: pointsToAdd,
      new_balance: result.rows[0].loyalty_points
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/loyalty/:guest_id/redeem', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { guest_id } = req.params;
    const { points, reason } = req.body;
    
    const guestRes = await query(`
      SELECT loyalty_points FROM hotel_guests WHERE id = $1 AND tenant_id = $2
    `, [guest_id, tenantId]);
    
    if (guestRes.rowCount === 0) {
      return res.status(404).json({ error: 'Guest not found' });
    }
    
    const currentPoints = guestRes.rows[0].loyalty_points || 0;
    if (currentPoints < points) {
      return res.status(400).json({ error: 'Insufficient points', available: currentPoints });
    }
    
    const result = await query(`
      UPDATE hotel_guests 
      SET loyalty_points = loyalty_points - $1, updated_at = NOW()
      WHERE id = $2 AND tenant_id = $3
      RETURNING loyalty_points
    `, [points, guest_id, tenantId]);
    
    const redemptionValue = points * 0.01;
    
    await publishEnvelope('hospitality.loyalty.points_redeemed.v1', 1, {
      guest_id,
      points_redeemed: points,
      value: redemptionValue,
      reason
    });
    
    res.json({
      success: true,
      points_redeemed: points,
      redemption_value: redemptionValue,
      new_balance: result.rows[0].loyalty_points
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// PREFERENCES
// ============================================

app.get('/preferences/:guest_id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { guest_id } = req.params;
    
    const result = await query(`
      SELECT preferences FROM hotel_guests WHERE id = $1 AND tenant_id = $2
    `, [guest_id, tenantId]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Guest not found' });
    }
    
    res.json({ success: true, preferences: result.rows[0].preferences || {} });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/preferences/:guest_id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { guest_id } = req.params;
    const preferences = req.body;
    
    const result = await query(`
      UPDATE hotel_guests 
      SET preferences = $1, updated_at = NOW()
      WHERE id = $2 AND tenant_id = $3
      RETURNING preferences
    `, [JSON.stringify(preferences), guest_id, tenantId]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Guest not found' });
    }
    
    res.json({ success: true, preferences: result.rows[0].preferences });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health
app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
app.get('/readyz', (req, res) => res.json({ status: dbReady ? 'ready' : 'not_ready' }));


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

const PORT = process.env.PORT || 8926;
app.listen(PORT, () => {
  console.log(`✅ Guest Profiles & Loyalty Service listening on ${PORT}`);
});
