// Kitchen Operations Service (KDS)
// Manages KOTs, order status, preparation times

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const promClient = require('prom-client');
const { z } = require('zod');
const path = require('path');
const fs = require('fs');

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
const SERVICE_NAME = 'kitchen_operations';
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// Security & Middleware
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
// API ENDPOINTS
// ============================================

// Get active orders (KOTs)
app.get('/kots', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { status } = req.query; // 'kitchen_ready', 'cooking', 'ready'
    
    let sql = `
      SELECT 
        ro.id, ro.table_id, ro.status, ro.order_number, ro.created_at,
        rt.table_number, rt.zone,
        json_agg(
          json_build_object(
            'id', roi.id,
            'name', roi.item_name,
            'quantity', roi.quantity,
            'notes', roi.notes,
            'status', roi.status,
            'modifiers', roi.modifiers
          )
        ) as items
      FROM restaurant_orders ro
      JOIN restaurant_tables rt ON ro.table_id = rt.id
      JOIN restaurant_order_items roi ON ro.id = roi.order_id
      WHERE ro.tenant_id = $1
    `;
    
    const params = [tenantId];
    if (status) {
      sql += ` AND ro.status = $2`;
      params.push(status);
    } else {
      // Default: show active kitchen orders
      sql += ` AND ro.status IN ('kitchen_ready', 'cooking')`;
    }
    
    sql += ` GROUP BY ro.id, rt.table_number, rt.zone ORDER BY ro.created_at ASC`;
    
    const result = await query(sql, params);
    res.json({ success: true, orders: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update Order Status (Bump Bar)
app.patch('/kots/:id/status', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { status } = req.body; // 'cooking', 'ready', 'served'
    
    const result = await query(
      `UPDATE restaurant_orders SET status = $1, updated_at = NOW() 
       WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [status, id, tenantId]
    );
    
    if (result.rowCount === 0) return res.status(404).json({ error: 'Order not found' });
    
    // Also update item statuses for consistency
    let itemStatus = 'pending';
    if (status === 'cooking') itemStatus = 'cooking';
    if (status === 'ready') itemStatus = 'ready';
    if (status === 'served') itemStatus = 'served';
    
    await query(
      `UPDATE restaurant_order_items SET status = $1 WHERE order_id = $2`,
      [itemStatus, id]
    );

    await publishEnvelope('restaurant.kitchen.status_changed.v1', 1, { 
      order_id: id, 
      status,
      timestamp: new Date().toISOString()
    });
    
    res.json({ success: true, order: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update specific item status
app.patch('/items/:id/status', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { status } = req.body;
    
    const result = await query(
      `UPDATE restaurant_order_items SET status = $1 
       WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [status, id, tenantId]
    );
    
    if (result.rowCount === 0) return res.status(404).json({ error: 'Item not found' });
    
    res.json({ success: true, item: result.rows[0] });
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

const PORT = process.env.PORT || 8920;
app.listen(PORT, () => {
  console.log(`✅ Kitchen Operations Service listening on ${PORT}`);
});
