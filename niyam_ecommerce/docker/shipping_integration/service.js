// Shipping Integration Service
// Carrier management, shipment tracking, and rate calculation

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

// Config
const { ALLOW_ALL_CORS, ORIGIN_ALLOWLIST, PORT } = require('./config/constants');

// Middleware
const { authenticate, requestLogger, metricsHandler, errorHandler } = require('./middleware');

// Routes
const {
  carriersRouter,
  shipmentsRouter,
  trackingRouter,
  ratesRouter,
  healthRouter,
  setDbReady,
  setStarted
} = require('./routes');

// Platform
const kvStore = require('@vruksha/platform/nats/kv_store');

// Database initialization
const { runMigrations } = require('./db/init');

// NATS event consumer
const eventConsumer = require('./services/eventConsumer');

// Initialize Express app
const app = express();

// Security: Helmet
app.use(helmet({ contentSecurityPolicy: false }));

// CORS configuration
app.use(cors({
  origin: (origin, cb) => {
    if (ALLOW_ALL_CORS || !origin || ORIGIN_ALLOWLIST.includes(origin)) {
      return cb(null, true);
    }
    return cb(new Error('CORS not allowed'), false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set startup time
setStarted(Date.now());

// Initialize database and KV store
(async () => {
  try {
    await runMigrations();
    console.log('Shipping Integration: Database migrations complete');

    await kvStore.connect();
    console.log('Shipping Integration: NATS KV Store connected');
    setDbReady(true);

    // Start NATS event consumer
    await eventConsumer.start();
  } catch (error) {
    console.error('Shipping Integration: Failed to initialize:', error.message);
  }
})();

// Request logging and metrics
app.use(requestLogger);

// Metrics endpoint
app.get('/metrics', metricsHandler);

// Authentication middleware
app.use(authenticate);

// Mount API routes
app.use('/api/carriers', carriersRouter);
app.use('/api/shipments', shipmentsRouter);
app.use('/api/tracking', trackingRouter);
app.use('/api/rates', ratesRouter);

// Legacy routes (backward compatibility)
app.use('/carriers', carriersRouter);
app.use('/shipments', shipmentsRouter);
app.use('/tracking', trackingRouter);
app.use('/rates', ratesRouter);

// Health routes - mount at both root and /api for compatibility
app.use('/', healthRouter);
app.use('/api', healthRouter);

// Serve embedded UI from ui/dist if it exists
const UI_DIST = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(UI_DIST)) {
  console.log('Serving embedded UI from ui/dist');
  app.use(express.static(UI_DIST));

  // SPA fallback
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') ||
        req.path.startsWith('/carriers') ||
        req.path.startsWith('/shipments') ||
        req.path.startsWith('/tracking') ||
        req.path.startsWith('/rates') ||
        req.path.startsWith('/health') ||
        req.path.startsWith('/metrics') ||
        req.path.startsWith('/status') ||
        req.path.startsWith('/stats')) {
      return next();
    }
    res.sendFile(path.join(UI_DIST, 'index.html'));
  });
}

// Error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`\nShipping Integration service listening on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
  if (fs.existsSync(UI_DIST)) {
    console.log(`UI: http://localhost:${PORT} (embedded)`);
  }
  console.log(`\nEndpoints:`);
  console.log(`  Carriers:     GET/POST /api/carriers`);
  console.log(`  Shipments:    GET/POST /api/shipments`);
  console.log(`  Ship Status:  PATCH /api/shipments/:id/status`);
  console.log(`  Tracking:     GET /api/tracking/shipment/:id`);
  console.log(`  By Number:    GET /api/tracking/number/:tracking_number`);
  console.log(`  Add Event:    POST /api/tracking`);
  console.log(`  Rates:        POST /api/rates/calculate`);
  console.log(`  Health:       GET /healthz, GET /readyz`);
  console.log('');
});
