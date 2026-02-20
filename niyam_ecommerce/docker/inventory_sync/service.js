// Inventory Sync Service
// Stock levels, reservations, sync sources, and low-stock alerts

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
  stockRouter,
  reservationsRouter,
  sourcesRouter,
  alertsRouter,
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
    console.log('Inventory Sync: Database migrations complete');

    await kvStore.connect();
    console.log('Inventory Sync: NATS KV Store connected');
    setDbReady(true);

    // Start NATS event consumer
    await eventConsumer.start();
  } catch (error) {
    console.error('Inventory Sync: Failed to initialize:', error.message);
  }
})();

// Request logging and metrics
app.use(requestLogger);

// Metrics endpoint
app.get('/metrics', metricsHandler);

// Authentication middleware
app.use(authenticate);

// Mount API routes
app.use('/api/stock', stockRouter);
app.use('/api/reservations', reservationsRouter);
app.use('/api/sources', sourcesRouter);
app.use('/api/alerts', alertsRouter);

// Legacy routes (backward compatibility)
app.use('/stock', stockRouter);
app.use('/reservations', reservationsRouter);
app.use('/sources', sourcesRouter);
app.use('/alerts', alertsRouter);

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
        req.path.startsWith('/stock') ||
        req.path.startsWith('/reservations') ||
        req.path.startsWith('/sources') ||
        req.path.startsWith('/alerts') ||
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
  console.log(`\nInventory Sync service listening on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
  if (fs.existsSync(UI_DIST)) {
    console.log(`UI: http://localhost:${PORT} (embedded)`);
  }
  console.log(`\nEndpoints:`);
  console.log(`  Stock Levels:   GET /api/stock/:product_id`);
  console.log(`  Update Stock:   PUT /api/stock`);
  console.log(`  Bulk Update:    PUT /api/stock/bulk`);
  console.log(`  Reservations:   GET/POST /api/reservations`);
  console.log(`  Release:        POST /api/reservations/:id/release`);
  console.log(`  Sync Sources:   GET/POST /api/sources`);
  console.log(`  Alerts:         GET /api/alerts`);
  console.log(`  Health:         GET /healthz, GET /readyz`);
  console.log('');
});
