// Room Service & In-Room Dining - Niyam Hospitality
// Handles room service orders, mini-bar, and in-room dining

const express = require('express');
const path = require('path');
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
const SERVICE_NAME = 'room_service_dining';
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
// ROOM SERVICE MENU
// ============================================

app.get('/menu', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { category, available_only } = req.query;
    
    let sql = `
      SELECT * FROM restaurant_menu_items 
      WHERE tenant_id = $1 AND printer_station = 'room_service'
    `;
    const params = [tenantId];
    
    if (available_only === 'true') {
      sql += ' AND is_available = true';
    }
    
    sql += ' ORDER BY category_id, name';
    
    const result = await query(sql, params);
    
    // If no room service items, return regular menu
    if (result.rows.length === 0) {
      const fallbackRes = await query(`
        SELECT * FROM restaurant_menu_items 
        WHERE tenant_id = $1 AND is_available = true
        ORDER BY category_id, name
      `, [tenantId]);
      return res.json({ success: true, menu: fallbackRes.rows });
    }
    
    res.json({ success: true, menu: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// ROOM SERVICE ORDERS
// ============================================

app.get('/orders', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { status, room_id } = req.query;
    
    let sql = `
      SELECT o.*, r.room_number,
        json_agg(json_build_object(
          'id', oi.id,
          'name', oi.item_name,
          'quantity', oi.quantity,
          'price', oi.unit_price,
          'notes', oi.notes
        )) as items
      FROM restaurant_orders o
      LEFT JOIN hotel_rooms r ON o.room_id = r.id
      LEFT JOIN restaurant_order_items oi ON o.id = oi.order_id
      WHERE o.tenant_id = $1 AND o.order_type = 'room_service'
    `;
    const params = [tenantId];
    let paramIdx = 2;
    
    if (status) {
      sql += ` AND o.status = $${paramIdx++}`;
      params.push(status);
    }
    if (room_id) {
      sql += ` AND o.room_id = $${paramIdx++}`;
      params.push(room_id);
    }
    
    sql += ' GROUP BY o.id, r.room_number ORDER BY o.created_at DESC';
    
    const result = await query(sql, params);
    res.json({ success: true, orders: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const OrderSchema = z.object({
  room_id: z.string().uuid(),
  items: z.array(z.object({
    menu_item_id: z.string().uuid(),
    quantity: z.number().min(1),
    notes: z.string().optional()
  })),
  delivery_time: z.string().optional(), // "asap" or specific time
  special_instructions: z.string().optional(),
  charge_to_room: z.boolean().default(true)
});

app.post('/orders', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const parsed = OrderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const data = parsed.data;
    
    await client.query('BEGIN');
    
    // Create order
    const orderRes = await client.query(`
      INSERT INTO restaurant_orders (tenant_id, room_id, order_type, status, notes)
      VALUES ($1, $2, 'room_service', 'open', $3)
      RETURNING id
    `, [tenantId, data.room_id, data.special_instructions]);
    
    const orderId = orderRes.rows[0].id;
    let total = 0;
    
    // Add items
    for (const item of data.items) {
      const menuRes = await client.query(
        'SELECT name, price FROM restaurant_menu_items WHERE id = $1',
        [item.menu_item_id]
      );
      
      if (menuRes.rows.length === 0) {
        throw new Error(`Menu item ${item.menu_item_id} not found`);
      }
      
      const { name, price } = menuRes.rows[0];
      const lineTotal = parseFloat(price) * item.quantity;
      total += lineTotal;
      
      await client.query(`
        INSERT INTO restaurant_order_items 
        (tenant_id, order_id, menu_item_id, item_name, quantity, unit_price, total_price, notes, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
      `, [tenantId, orderId, item.menu_item_id, name, item.quantity, price, lineTotal, item.notes]);
    }
    
    // Add service charge (15%)
    const serviceCharge = total * 0.15;
    const grandTotal = total + serviceCharge;
    
    // Update order total
    await client.query(`
      UPDATE restaurant_orders 
      SET total_amount = $1, status = 'kitchen_ready'
      WHERE id = $2
    `, [grandTotal, orderId]);
    
    await client.query('COMMIT');
    
    // Get room number for notification
    const roomRes = await query('SELECT room_number FROM hotel_rooms WHERE id = $1', [data.room_id]);
    
    await publishEnvelope('hospitality.room_service.order_placed.v1', 1, {
      order_id: orderId,
      room_id: data.room_id,
      room_number: roomRes.rows[0]?.room_number,
      total: grandTotal,
      item_count: data.items.length
    });
    
    res.json({
      success: true,
      order: {
        id: orderId,
        subtotal: total,
        service_charge: serviceCharge,
        total: grandTotal,
        status: 'kitchen_ready',
        estimated_delivery: data.delivery_time || '30-45 minutes'
      }
    });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

app.patch('/orders/:id/status', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { status } = req.body; // preparing, ready, delivering, delivered
    
    const result = await query(`
      UPDATE restaurant_orders 
      SET status = $1, updated_at = NOW()
      WHERE id = $2 AND tenant_id = $3
      RETURNING *
    `, [status, id, tenantId]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    await publishEnvelope('hospitality.room_service.status_changed.v1', 1, {
      order_id: id,
      status,
      room_id: result.rows[0].room_id
    });
    
    // When delivered, publish charge event for accounting
    if (status === 'delivered' || status === 'served') {
      const order = result.rows[0];
      await publishEnvelope('hospitality.room_service.charge.v1', 1, {
        charge_id: id,
        order_id: id,
        room_id: order.room_id,
        amount: parseFloat(order.total_amount) || 0,
        total: parseFloat(order.total_amount) || 0,
        charge_type: 'room_service',
        description: `Room Service Order #${id}`,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({ success: true, order: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// MINI-BAR
// ============================================

// In-memory mini-bar inventory per room
const miniBarInventory = new Map();

// Default mini-bar items
const defaultMiniBarItems = [
  { id: 'mb-1', name: 'Mineral Water', price: 5, category: 'beverages', quantity: 2 },
  { id: 'mb-2', name: 'Soft Drink', price: 4, category: 'beverages', quantity: 4 },
  { id: 'mb-3', name: 'Beer', price: 8, category: 'alcohol', quantity: 2 },
  { id: 'mb-4', name: 'Wine (Mini)', price: 15, category: 'alcohol', quantity: 2 },
  { id: 'mb-5', name: 'Chocolate Bar', price: 6, category: 'snacks', quantity: 2 },
  { id: 'mb-6', name: 'Chips', price: 5, category: 'snacks', quantity: 2 },
  { id: 'mb-7', name: 'Nuts', price: 7, category: 'snacks', quantity: 2 },
  { id: 'mb-8', name: 'Juice', price: 6, category: 'beverages', quantity: 2 }
];

app.get('/minibar/:room_id', async (req, res) => {
  try {
    const { room_id } = req.params;
    
    let inventory = miniBarInventory.get(room_id);
    if (!inventory) {
      inventory = JSON.parse(JSON.stringify(defaultMiniBarItems));
      miniBarInventory.set(room_id, inventory);
    }
    
    res.json({ success: true, items: inventory });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/minibar/:room_id/consume', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { room_id } = req.params;
    const { items } = req.body; // [{ id: 'mb-1', quantity: 1 }]
    
    let inventory = miniBarInventory.get(room_id);
    if (!inventory) {
      inventory = JSON.parse(JSON.stringify(defaultMiniBarItems));
    }
    
    let totalCharge = 0;
    const consumed = [];
    
    for (const consumedItem of items) {
      const item = inventory.find(i => i.id === consumedItem.id);
      if (item && item.quantity >= consumedItem.quantity) {
        item.quantity -= consumedItem.quantity;
        const charge = item.price * consumedItem.quantity;
        totalCharge += charge;
        consumed.push({
          name: item.name,
          quantity: consumedItem.quantity,
          price: item.price,
          total: charge
        });
      }
    }
    
    miniBarInventory.set(room_id, inventory);
    
    // Charge to room (would update hotel_bookings in production)
    await publishEnvelope('hospitality.room_service.minibar_consumed.v1', 1, {
      room_id,
      items: consumed,
      total_charge: totalCharge
    });
    
    // Publish accounting charge event for mini-bar
    if (totalCharge > 0) {
      await publishEnvelope('hospitality.room_service.charge.v1', 1, {
        charge_id: `minibar-${room_id}-${Date.now()}`,
        room_id,
        amount: totalCharge,
        total: totalCharge,
        charge_type: 'minibar',
        description: `Mini-bar consumption: ${consumed.map(c => c.name).join(', ')}`,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      success: true,
      consumed,
      total_charge: totalCharge,
      message: 'Charged to room'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/minibar/:room_id/restock', async (req, res) => {
  try {
    const { room_id } = req.params;
    
    miniBarInventory.set(room_id, JSON.parse(JSON.stringify(defaultMiniBarItems)));
    
    res.json({ success: true, message: 'Mini-bar restocked', items: defaultMiniBarItems });
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
    const today = new Date().toISOString().split('T')[0];
    
    const [ordersRes, revenueRes, avgTimeRes] = await Promise.all([
      query(`
        SELECT status, COUNT(*) as count
        FROM restaurant_orders
        WHERE tenant_id = $1 AND order_type = 'room_service' AND DATE(created_at) = $2
        GROUP BY status
      `, [tenantId, today]),
      query(`
        SELECT COALESCE(SUM(total_amount), 0) as revenue
        FROM restaurant_orders
        WHERE tenant_id = $1 AND order_type = 'room_service' AND DATE(created_at) = $2
      `, [tenantId, today]),
      query(`
        SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/60) as avg_minutes
        FROM restaurant_orders
        WHERE tenant_id = $1 AND order_type = 'room_service' AND status = 'served'
        AND DATE(created_at) = $2
      `, [tenantId, today])
    ]);
    
    const statusCounts = {};
    ordersRes.rows.forEach(r => { statusCounts[r.status] = parseInt(r.count); });
    
    res.json({
      success: true,
      stats: {
        orders_today: Object.values(statusCounts).reduce((a, b) => a + b, 0),
        pending: statusCounts.open || 0,
        in_kitchen: statusCounts.kitchen_ready || 0,
        delivered: statusCounts.served || 0,
        revenue_today: parseFloat(revenueRes.rows[0].revenue),
        avg_delivery_time: Math.round(avgTimeRes.rows[0]?.avg_minutes || 35)
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
const fs = require('fs');

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

const PORT = process.env.PORT || 8914;
app.listen(PORT, () => {
  console.log(`✅ Room Service & Dining Service listening on ${PORT}`);
});
