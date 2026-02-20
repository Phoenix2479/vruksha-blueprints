// E-commerce Integration Service - Refactored
// Supports Shopify, WooCommerce, Custom APIs with webhooks and polling

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const { query } = require('@vruksha/platform/db/postgres');
const { runMigrations } = require('./db/init');

// Route modules
const channelsRouter = require('./routes/channels');
const ordersRouter = require('./routes/orders');
const webhooksRouter = require('./routes/webhooks');
const syncRouter = require('./routes/sync');
const oauthRouter = require('./routes/oauth');

// WebSocket support
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);

// WebSocket server for real-time updates
const wss = new WebSocket.Server({ server, path: '/ws' });
const wsClients = new Map(); // tenantId -> Set of WebSocket clients

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const tenantId = url.searchParams.get('tenant_id') || DEFAULT_TENANT_ID;
  
  // Register client
  if (!wsClients.has(tenantId)) {
    wsClients.set(tenantId, new Set());
  }
  wsClients.get(tenantId).add(ws);
  
  console.log(`🔌 [WS] Client connected (tenant: ${tenantId})`);
  
  // Send initial connection confirmation
  ws.send(JSON.stringify({
    type: 'connected',
    timestamp: new Date().toISOString(),
    message: 'Connected to E-commerce real-time updates'
  }));
  
  // Handle client messages
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
      }
    } catch (e) {
      // Ignore invalid messages
    }
  });
  
  ws.on('close', () => {
    const clients = wsClients.get(tenantId);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        wsClients.delete(tenantId);
      }
    }
    console.log(`🔌 [WS] Client disconnected (tenant: ${tenantId})`);
  });
  
  ws.on('error', (error) => {
    console.error(`[WS] Error:`, error.message);
  });
});

// Broadcast function for real-time updates
function broadcast(tenantId, event) {
  const clients = wsClients.get(tenantId);
  if (clients) {
    const message = JSON.stringify({
      ...event,
      timestamp: new Date().toISOString()
    });
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}

// Make broadcast available to routes
app.set('broadcast', broadcast);
const PORT = process.env.PORT || 8970;
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

let dbReady = false;

// Security
app.use(helmet({ contentSecurityPolicy: false }));

// CORS
const ALLOW_ALL = (process.env.ALLOW_ALL_CORS || 'true').toLowerCase() === 'true';
app.use(cors({
  origin: (origin, cb) => {
    if (ALLOW_ALL || !origin) return cb(null, true);
    return cb(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID']
}));

// Body parser with raw body for webhook signature verification
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// Initialize database on startup
(async () => {
  try {
    await runMigrations();
    console.log('✅ E-commerce: Database migrations completed');
    dbReady = true;
  } catch (e) {
    console.error('❌ E-commerce: Initialization error', e.message);
  }
})();

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(JSON.stringify({
      svc: 'ecommerce_integration',
      ts: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      tenant_id: req.headers['x-tenant-id'] || DEFAULT_TENANT_ID,
      duration_ms: Date.now() - start
    }));
  });
  next();
});

// ============================================
// ROUTES
// ============================================

app.use('/channels', channelsRouter);
app.use('/orders', ordersRouter);
app.use('/webhooks', webhooksRouter);
app.use('/auto-sync', syncRouter);
app.use('/sync', syncRouter);
app.use('/oauth', oauthRouter);

// Legacy endpoint compatibility
app.post('/sync/products', (req, res) => {
  // Forward to sync router
  req.url = '/products';
  syncRouter(req, res);
});

app.post('/sync/inventory', (req, res) => {
  req.url = '/inventory';
  syncRouter(req, res);
});

// ============================================
// HEALTH & STATS
// ============================================

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', service: 'ecommerce_integration' });
});

app.get('/readyz', (req, res) => {
  res.json({ 
    status: dbReady ? 'ready' : 'not_ready',
    service: 'ecommerce_integration'
  });
});

const started = Date.now();
app.get('/stats', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || DEFAULT_TENANT_ID;
    
    // Get counts from database
    const channelsResult = await query(
      'SELECT COUNT(*) as count FROM ecommerce_channels WHERE tenant_id = $1',
      [tenantId]
    );
    
    const statsResult = await query(
      `SELECT 
         COALESCE(SUM(orders_received), 0) as orders_today,
         COALESCE(SUM(webhooks_received), 0) as webhooks_today
       FROM ecommerce_daily_stats
       WHERE tenant_id = $1 AND stat_date = CURRENT_DATE`,
      [tenantId]
    );
    
    const stats = statsResult.rows[0] || {};
    
    res.json({
      status: 'Active',
      uptime: Math.floor((Date.now() - started) / 1000),
      service: 'ecommerce_integration',
      connected_marketplaces: parseInt(channelsResult.rows[0]?.count) || 0,
      pending_syncs: 0,
      auto_sync: {
        orders_received_today: parseInt(stats.orders_today) || 0,
        webhooks_received: parseInt(stats.webhooks_today) || 0
      }
    });
  } catch (error) {
    res.json({
      status: 'Active',
      uptime: Math.floor((Date.now() - started) / 1000),
      service: 'ecommerce_integration',
      connected_marketplaces: 0,
      error: error.message
    });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[E-commerce] Error:', err);
  res.status(err.status || 500).json({ 
    success: false, 
    error: { code: 'SERVER_ERROR', message: err.message } 
  });
});

// ============================================
// SERVE UI
// ============================================

const UI_DIST_PATH = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(UI_DIST_PATH)) {
  console.log('📦 Serving embedded UI from ui/dist');
  app.use(express.static(UI_DIST_PATH));
  
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || 
        req.path.startsWith('/health') ||
        req.path.startsWith('/channels') ||
        req.path.startsWith('/orders') ||
        req.path.startsWith('/webhooks') ||
        req.path.startsWith('/sync') ||
        req.path.startsWith('/auto-sync') ||
        req.path.startsWith('/stats')) {
      return next();
    }
    res.sendFile(path.join(UI_DIST_PATH, 'index.html'));
  });
}

// ============================================
// START SERVER
// ============================================

server.listen(PORT, () => {
  console.log(`\n✅ E-commerce Integration service listening on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`\nEndpoints:`);
  console.log(`  GET/POST /channels          - Manage connected platforms`);
  console.log(`  GET/POST /orders            - View/manage orders`);
  console.log(`  POST     /webhooks/:id/*    - Receive webhooks`);
  console.log(`  POST     /auto-sync/*       - Configure auto-sync`);
  console.log(`  GET      /oauth/*           - OAuth2 flows`);
  console.log(`  GET      /healthz           - Health check\n`);
});
