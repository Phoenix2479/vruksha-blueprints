// Kitchen Order Display (KDS) Service - Niyam Hospitality
// Real-time kitchen display system for order management

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const promClient = require('prom-client');

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
const SERVICE_NAME = 'kitchen_order_display';
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
// KDS DISPLAY - ACTIVE ORDERS
// ============================================

app.get('/display', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { station } = req.query; // kitchen, bar, dessert, etc.
    
    let sql = `
      SELECT 
        o.id, o.order_number, o.status, o.order_type, o.created_at, o.notes,
        t.table_number, t.zone,
        r.room_number,
        json_agg(
          json_build_object(
            'id', oi.id,
            'name', oi.item_name,
            'quantity', oi.quantity,
            'notes', oi.notes,
            'status', oi.status,
            'modifiers', oi.modifiers
          ) ORDER BY oi.created_at
        ) as items
      FROM restaurant_orders o
      LEFT JOIN restaurant_tables t ON o.table_id = t.id
      LEFT JOIN hotel_rooms r ON o.room_id = r.id
      JOIN restaurant_order_items oi ON o.id = oi.order_id
      WHERE o.tenant_id = $1 
        AND o.status IN ('kitchen_ready', 'cooking')
    `;
    
    const params = [tenantId];
    
    if (station) {
      // Filter by printer station
      sql += ` AND EXISTS (
        SELECT 1 FROM restaurant_menu_items m 
        WHERE m.id = oi.menu_item_id AND m.printer_station = $2
      )`;
      params.push(station);
    }
    
    sql += ` GROUP BY o.id, t.table_number, t.zone, r.room_number
             ORDER BY 
               CASE WHEN o.status = 'cooking' THEN 0 ELSE 1 END,
               o.created_at ASC`;
    
    const result = await query(sql, params);
    
    // Calculate wait times
    const orders = result.rows.map(order => {
      const createdAt = new Date(order.created_at);
      const now = new Date();
      const waitMinutes = Math.floor((now - createdAt) / 60000);
      
      return {
        ...order,
        wait_time_minutes: waitMinutes,
        is_overdue: waitMinutes > 20,
        priority: waitMinutes > 30 ? 'urgent' : waitMinutes > 20 ? 'high' : 'normal',
        source: order.table_number ? `Table ${order.table_number}` : 
                order.room_number ? `Room ${order.room_number}` : 
                order.order_type
      };
    });
    
    res.json({ success: true, orders });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// ORDER ACTIONS (BUMP BAR)
// ============================================

// Start cooking an order
app.post('/orders/:id/start', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    const result = await query(`
      UPDATE restaurant_orders 
      SET status = 'cooking', updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2 AND status = 'kitchen_ready'
      RETURNING *
    `, [id, tenantId]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Order not found or already started' });
    }
    
    // Update all items to cooking
    await query(`
      UPDATE restaurant_order_items SET status = 'cooking'
      WHERE order_id = $1
    `, [id]);
    
    await publishEnvelope('hospitality.kds.order_started.v1', 1, { order_id: id });
    
    res.json({ success: true, order: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Mark order as ready (bump)
app.post('/orders/:id/ready', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    const result = await query(`
      UPDATE restaurant_orders 
      SET status = 'ready', updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2 AND status = 'cooking'
      RETURNING *
    `, [id, tenantId]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Order not found or not cooking' });
    }
    
    // Update all items to ready
    await query(`
      UPDATE restaurant_order_items SET status = 'ready'
      WHERE order_id = $1
    `, [id]);
    
    await publishEnvelope('hospitality.kds.order_ready.v1', 1, { order_id: id });
    
    res.json({ success: true, order: result.rows[0], message: 'Order ready for pickup' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Mark individual item as ready
app.post('/items/:id/ready', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    const result = await query(`
      UPDATE restaurant_order_items 
      SET status = 'ready'
      WHERE id = $1 AND tenant_id = $2
      RETURNING *, order_id
    `, [id, tenantId]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    // Check if all items in order are ready
    const orderId = result.rows[0].order_id;
    const pendingRes = await query(`
      SELECT COUNT(*) FROM restaurant_order_items 
      WHERE order_id = $1 AND status != 'ready'
    `, [orderId]);
    
    const allReady = parseInt(pendingRes.rows[0].count) === 0;
    
    if (allReady) {
      await query(`UPDATE restaurant_orders SET status = 'ready' WHERE id = $1`, [orderId]);
      await publishEnvelope('hospitality.kds.order_ready.v1', 1, { order_id: orderId });
    }
    
    res.json({ success: true, item: result.rows[0], order_complete: allReady });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Recall an order (bring back to display)
app.post('/orders/:id/recall', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    const result = await query(`
      UPDATE restaurant_orders 
      SET status = 'cooking', updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2 AND status = 'ready'
      RETURNING *
    `, [id, tenantId]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json({ success: true, order: result.rows[0], message: 'Order recalled to display' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// READY ORDERS (Expo View)
// ============================================

app.get('/ready', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    
    const result = await query(`
      SELECT 
        o.id, o.order_number, o.order_type, o.updated_at,
        t.table_number, t.zone,
        r.room_number,
        json_agg(
          json_build_object('name', oi.item_name, 'quantity', oi.quantity)
        ) as items
      FROM restaurant_orders o
      LEFT JOIN restaurant_tables t ON o.table_id = t.id
      LEFT JOIN hotel_rooms r ON o.room_id = r.id
      JOIN restaurant_order_items oi ON o.id = oi.order_id
      WHERE o.tenant_id = $1 AND o.status = 'ready'
      GROUP BY o.id, t.table_number, t.zone, r.room_number
      ORDER BY o.updated_at ASC
    `, [tenantId]);
    
    res.json({ success: true, orders: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Mark as served (picked up)
app.post('/orders/:id/served', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    const result = await query(`
      UPDATE restaurant_orders 
      SET status = 'served', updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2 AND status = 'ready'
      RETURNING *
    `, [id, tenantId]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    await query(`
      UPDATE restaurant_order_items SET status = 'served'
      WHERE order_id = $1
    `, [id]);
    
    await publishEnvelope('hospitality.kds.order_served.v1', 1, { order_id: id });
    
    res.json({ success: true, order: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// STATS & METRICS
// ============================================

app.get('/stats', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    
    const [queueRes, avgTimeRes, servedRes] = await Promise.all([
      query(`
        SELECT status, COUNT(*) as count
        FROM restaurant_orders
        WHERE tenant_id = $1 AND status IN ('kitchen_ready', 'cooking', 'ready')
        GROUP BY status
      `, [tenantId]),
      query(`
        SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/60) as avg_minutes
        FROM restaurant_orders
        WHERE tenant_id = $1 AND status = 'served'
        AND created_at > NOW() - INTERVAL '4 hours'
      `, [tenantId]),
      query(`
        SELECT COUNT(*) as count
        FROM restaurant_orders
        WHERE tenant_id = $1 AND status = 'served'
        AND created_at > NOW() - INTERVAL '1 hour'
      `, [tenantId])
    ]);
    
    const statusCounts = { kitchen_ready: 0, cooking: 0, ready: 0 };
    queueRes.rows.forEach(r => { statusCounts[r.status] = parseInt(r.count); });
    
    res.json({
      success: true,
      stats: {
        in_queue: statusCounts.kitchen_ready,
        cooking: statusCounts.cooking,
        ready_for_pickup: statusCounts.ready,
        total_active: statusCounts.kitchen_ready + statusCounts.cooking + statusCounts.ready,
        avg_prep_time_minutes: Math.round(avgTimeRes.rows[0]?.avg_minutes || 0),
        served_last_hour: parseInt(servedRes.rows[0].count)
      }
    });
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

const PORT = process.env.PORT || 8916;
app.listen(PORT, () => {
  console.log(`✅ Kitchen Order Display Service listening on ${PORT}`);
});
