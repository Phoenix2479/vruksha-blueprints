// Curbside Pickup Scheduler Service
// Slot booking, arrival notifications, fulfillment

const express = require('express');
const path = require('path');
const fs = require('fs');
const { query, getClient } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');
const kvStore = require('@vruksha/platform/nats/kv_store');

const app = express();
app.use(express.json());

const started = Date.now();
let dbReady = false;

// Initialize KV store
(async () => {
  try {
    await kvStore.connect();
    console.log('✅ Curbside Pickup Scheduler: NATS KV Store connected');
    dbReady = true;
  } catch (error) {
    console.error('❌ Curbside Pickup Scheduler: Failed to connect:', error.message);
  }
})();

// Middleware
app.use((req, res, next) => {
  console.log(`[Curbside Pickup Scheduler] ${req.method} ${req.path}`);
  next();
});

app.use((err, req, res, next) => {
  console.error('[Curbside Pickup Scheduler] Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// IMPLEMENTATION ENDPOINTS
// ============================================

// TODO: Add specific endpoints for Curbside Pickup Scheduler

// Example endpoint
app.get('/status', async (req, res) => {
  res.json({ 
    success: true, 
    service: 'curbside_pickup_scheduler',
    description: 'Slot booking, arrival notifications, fulfillment',
    ready: dbReady
  });
});

// ============================================
// HEALTH & STATUS
// ============================================

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', service: 'curbside_pickup_scheduler' });
});

app.get('/readyz', (req, res) => {
  res.json({ 
    status: dbReady ? 'ready' : 'not_ready',
    service: 'curbside_pickup_scheduler',
    nats_kv: dbReady
  });
});

app.get('/stats', (req, res) => {
  res.json({ 
    uptime: Math.round((Date.now() - started) / 1000),
    service: 'curbside_pickup_scheduler',
    version: '1.0.0'
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 8817;

// Serve embedded UI from ui/dist if it exists
const UI_DIST_PATH = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(UI_DIST_PATH)) {
  console.log('📦 Serving embedded UI from ui/dist');
  app.use(express.static(UI_DIST_PATH));
  
  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || 
        req.path.startsWith('/health') ||
        req.path.startsWith('/metrics')) {
      return next();
    }
    res.sendFile(path.join(UI_DIST_PATH, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`\n✅ Curbside Pickup Scheduler service listening on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`\nService: Slot booking, arrival notifications, fulfillment\n`);
});
