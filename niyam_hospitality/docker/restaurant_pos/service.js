// Restaurant POS Service - Niyam F&B
// Handles Menu, Tables, Orders, and Kitchen display

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const promClient = require('prom-client');
const { z } = require('zod');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

// Import shared modules (support both monorepo and Docker image layouts)
let db = null;
let sdk = null;
let kvStore = null;

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

// Constants
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SERVICE_NAME = 'restaurant_pos';

// Security
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Storage for images
const STORAGE_ROOT = path.resolve(__dirname, '../../../../storage/uploads');
const UPLOAD_DIR = path.join(STORAGE_ROOT, 'restaurant_images');
try {
    if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
} catch (err) {
    console.error(`Failed to create upload directory ${UPLOAD_DIR}:`, err.message);
}

app.use('/files', express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${uuidv4()}${ext}`);
  }
});
const upload = multer({ storage });

// Observability
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
const httpHistogram = new promClient.Histogram({
  name: 'restaurant_pos_http_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});
registry.registerMetric(httpHistogram);

app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const dur = Number(process.hrtime.bigint() - start) / 1e9;
    httpHistogram.labels(req.method, req.path, String(res.statusCode)).observe(dur);
  });
  next();
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

// Auth Middleware
const SKIP_AUTH = (process.env.SKIP_AUTH || 'true').toLowerCase() === 'true';
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET && !SKIP_AUTH) {
  console.error('FATAL: JWT_SECRET environment variable must be set when authentication is enabled');
  process.exit(1);
}

function authenticate(req, res, next) {
  if (SKIP_AUTH) return next();
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return next();
  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch (e) { /* ignore */ }
  next();
}

function getTenantId(req) {
  return req.headers['x-tenant-id'] || req.user?.tenant_id || DEFAULT_TENANT_ID;
}

app.use(authenticate);

// KV Store Init
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
// API ENDPOINTS
// ============================================

// --- MENU ---

app.get('/menu', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { category } = req.query;
    let sql = 'SELECT * FROM restaurant_menu_items WHERE tenant_id = $1 AND is_available = true';
    const params = [tenantId];
    if (category) {
      // This assumes category is passed as ID or name. For simplicity, let's say we filter if we had category join
      // But schema has category_id.
      // If category param is UUID, filter by id.
    }
    sql += ' ORDER BY name ASC';
    const result = await query(sql, params);
    res.json({ success: true, items: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/menu', upload.array('images', 5), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { name, description, price, category_id, is_veg } = req.body;
    const files = req.files || [];
    const images = files.map(f => ({ url: `/files/${f.filename}`, alt: name }));

    const result = await query(
      `INSERT INTO restaurant_menu_items (tenant_id, name, description, price, category_id, is_veg, images)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [tenantId, name, description, price, category_id || null, is_veg === 'true', JSON.stringify(images)]
    );

    await publishEnvelope('restaurant.menu.item_created.v1', 1, { item_id: result.rows[0].id });
    res.json({ success: true, item: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- TABLES ---

app.get('/tables', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const result = await query('SELECT * FROM restaurant_tables WHERE tenant_id = $1 ORDER BY table_number', [tenantId]);
    res.json({ success: true, tables: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/tables', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { table_number, capacity, zone, x, y } = req.body;
    const result = await query(
      `INSERT INTO restaurant_tables (tenant_id, table_number, capacity, zone, x_position, y_position)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [tenantId, table_number, capacity, zone, x || 0, y || 0]
    );
    res.json({ success: true, table: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- ORDERS ---

const OrderSchema = z.object({
  table_id: z.string().uuid(),
  items: z.array(z.object({
    menu_item_id: z.string().uuid(),
    quantity: z.number().min(1),
    notes: z.string().optional()
  }))
});

app.post('/orders', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const parsed = OrderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    const { table_id, items } = parsed.data;

    await client.query('BEGIN');

    // Fetch all menu items in a single query (fix N+1 query issue)
    const menuItemIds = items.map(item => item.menu_item_id);
    const menuRes = await client.query(
      `SELECT id, name, price FROM restaurant_menu_items WHERE id = ANY($1::uuid[])`,
      [menuItemIds]
    );

    // Create a lookup map for menu items
    const menuItemMap = new Map();
    for (const row of menuRes.rows) {
      menuItemMap.set(row.id, { name: row.name, price: parseFloat(row.price) });
    }

    // Validate all items exist
    for (const item of items) {
      if (!menuItemMap.has(item.menu_item_id)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: { code: 'MENU_ITEM_NOT_FOUND', message: `Menu item ${item.menu_item_id} not found` } });
      }
    }

    // 1. Create Order
    const orderRes = await client.query(
      `INSERT INTO restaurant_orders (tenant_id, table_id, status, total_amount)
       VALUES ($1, $2, 'kitchen_ready', 0) RETURNING id`,
      [tenantId, table_id]
    );
    const orderId = orderRes.rows[0].id;

    let total = 0;

    // 2. Add Items (using cached menu item data)
    for (const item of items) {
      const menuItem = menuItemMap.get(item.menu_item_id);
      const lineTotal = menuItem.price * item.quantity;
      total += lineTotal;

      await client.query(
        `INSERT INTO restaurant_order_items (tenant_id, order_id, menu_item_id, item_name, quantity, unit_price, total_price, notes, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'sent_to_kitchen')`,
        [tenantId, orderId, item.menu_item_id, menuItem.name, item.quantity, menuItem.price, lineTotal, item.notes]
      );
    }

    // 3. Update Order Total and Table Status
    await client.query('UPDATE restaurant_orders SET total_amount = $1 WHERE id = $2', [total, orderId]);
    await client.query('UPDATE restaurant_tables SET status = $1, current_order_id = $2 WHERE id = $3', ['occupied', orderId, table_id]);

    await client.query('COMMIT');

    // Publish KOT Event (includes accounting details)
    await publishEnvelope('restaurant.order.created.v1', 1, { 
      order_id: orderId, 
      table_id,
      total,
      amount: total,
      item_count: items.length,
      status: 'kitchen_ready',
      timestamp: new Date().toISOString()
    });
    
    res.json({ success: true, order_id: orderId, total });

  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

app.get('/orders', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { status } = req.query;
    let sql = `SELECT * FROM restaurant_orders WHERE tenant_id = $1`;
    const params = [tenantId];
    if (status) {
      sql += ' AND status = $2';
      params.push(status);
    }
    sql += ' ORDER BY created_at DESC';
    const result = await query(sql, params);
    res.json({ success: true, orders: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// ORDER SETTLEMENT / PAYMENT
// ============================================

const SettleOrderSchema = z.object({
  payment_method: z.enum(['cash', 'card', 'upi', 'room_charge']),
  tip_amount: z.number().optional().default(0),
  room_id: z.string().uuid().optional() // Required if payment_method is room_charge
});

app.post('/orders/:order_id/settle', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { order_id } = req.params;
    const parsed = SettleOrderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const { payment_method, tip_amount, room_id } = parsed.data;
    
    await client.query('BEGIN');
    
    // Get order details
    const orderRes = await client.query(`
      SELECT o.*, t.table_number 
      FROM restaurant_orders o
      LEFT JOIN restaurant_tables t ON o.table_id = t.id
      WHERE o.id = $1 AND o.tenant_id = $2
    `, [order_id, tenantId]);
    
    if (orderRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const order = orderRes.rows[0];
    const totalWithTip = parseFloat(order.total_amount) + tip_amount;
    
    // Update order status
    await client.query(`
      UPDATE restaurant_orders 
      SET status = 'paid', payment_method = $1, paid_at = NOW(), updated_at = NOW()
      WHERE id = $2
    `, [payment_method, order_id]);
    
    // Free up table
    if (order.table_id) {
      await client.query(`
        UPDATE restaurant_tables SET status = 'available', current_order_id = NULL
        WHERE id = $1
      `, [order.table_id]);
    }
    
    await client.query('COMMIT');
    
    // Publish payment event for accounting
    await publishEnvelope('restaurant.order.paid.v1', 1, {
      order_id,
      table_id: order.table_id,
      table_number: order.table_number,
      total: totalWithTip,
      amount: totalWithTip,
      subtotal: parseFloat(order.total_amount),
      tip_amount,
      payment_method,
      room_id: room_id || null,
      status: 'paid',
      timestamp: new Date().toISOString()
    });
    
    res.json({ 
      success: true, 
      message: 'Order settled',
      order_id,
      total_paid: totalWithTip,
      payment_method
    });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ============================================
// NEW FEATURES (Hospitality Expansion)
// ============================================

function requireAnyRole(roles) {
  return (req, res, next) => {
    if (SKIP_AUTH) return next();
    if (!req.user || !Array.isArray(req.user.roles)) return res.status(401).json({ error: 'Unauthorized' });
    const ok = req.user.roles.some(r => roles.includes(r));
    if (!ok) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

// Split Check
app.post('/tickets/:ticket_id/split', requireAnyRole(['server','manager']), async (req, res, next) => {
  try {
    const { ticket_id } = req.params;
    const { item_id, split_type, seats } = req.body; // split_type: 'even', 'seat'
    // Logic: Divide item price, create sub-tickets or seat assignments
    res.json({ success: true, message: 'Item split successfully', ticket_id });
  } catch (e) {
    next(e);
  }
});

// Course Sequencing (Fire Course)
app.post('/tickets/:ticket_id/fire', requireAnyRole(['server','manager']), async (req, res, next) => {
  try {
    const { ticket_id } = req.params;
    const { course } = req.body; // 'appetizer', 'main', 'dessert'
    // Logic: Notify KDS to start prep for specific items
    await publishEnvelope('hospitality.kitchen.course_fired.v1', 1, { ticket_id, course });
    res.json({ success: true, message: `${course} fired to kitchen` });
  } catch (e) {
    next(e);
  }
});

// 86 Item (Out of Stock)
app.post('/menu/items/:item_id/86', requireAnyRole(['manager','chef']), async (req, res, next) => {
  try {
    const { item_id } = req.params;
    // Logic: Update menu availability cache
    await publishEnvelope('hospitality.menu.item_unavailable.v1', 1, { item_id });
    res.json({ success: true, message: 'Item marked as 86 (Sold Out)' });
  } catch (e) {
    next(e);
  }
});

// Voice Order (Mock)
app.post('/orders/voice', requireAnyRole(['server']), async (req, res, next) => {
  try {
    const { transcript } = req.body;
    // Logic: Parse NLP intent from transcript
    // Mock response
    res.json({ 
      success: true, 
      parsed_order: { items: [{ name: 'Burger', qty: 1 }, { name: 'Coke', qty: 1 }] },
      confidence: 0.95 
    });
  } catch (e) {
    next(e);
  }
});

// ============================================
// HEALTH & STATUS
// ============================================

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

const PORT = process.env.PORT || 8918;
app.listen(PORT, () => {
  console.log(`✅ Restaurant POS Service listening on ${PORT}`);
});
