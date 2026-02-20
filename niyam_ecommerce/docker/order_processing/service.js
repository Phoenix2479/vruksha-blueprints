// Order Processing Service
// Order lifecycle management with fulfillments and refunds

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
  ordersRouter,
  fulfillmentsRouter,
  refundsRouter,
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
    console.log('Order Processing: Database migrations complete');

    await kvStore.connect();
    console.log('Order Processing: NATS KV Store connected');
    setDbReady(true);

    // Start NATS event consumer
    await eventConsumer.start();
  } catch (error) {
    console.error('Order Processing: Failed to initialize:', error.message);
  }
})();

// Request logging and metrics
app.use(requestLogger);

// Metrics endpoint
app.get('/metrics', metricsHandler);

// Authentication middleware
app.use(authenticate);

// Mount API routes
app.use('/api/orders', ordersRouter);
app.use('/api/fulfillments', fulfillmentsRouter);
app.use('/api/refunds', refundsRouter);

// Legacy routes (backward compatibility)
app.use('/orders', ordersRouter);
app.use('/fulfillments', fulfillmentsRouter);
app.use('/refunds', refundsRouter);

// Health routes - mount at both root and /api for compatibility
app.use('/', healthRouter);
app.use('/api', healthRouter);

// Serve embedded UI from ui/dist if it exists
const UI_DIST = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(UI_DIST)) {
  console.log('Serving embedded UI from ui/dist');
  app.use(express.static(UI_DIST));

  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') ||
        req.path.startsWith('/orders') ||
        req.path.startsWith('/fulfillments') ||
        req.path.startsWith('/refunds') ||
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
  console.log(`\nOrder Processing service listening on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
  if (fs.existsSync(UI_DIST)) {
    console.log(`UI: http://localhost:${PORT} (embedded)`);
  }
  console.log(`\nEndpoints:`);
  console.log(`  Orders:       GET/POST /api/orders`);
  console.log(`  Order Detail: GET /api/orders/:id`);
  console.log(`  Status:       PATCH /api/orders/:id/status`);
  console.log(`  Fulfillments: GET /api/fulfillments/order/:order_id`);
  console.log(`  Create Fulfill: POST /api/fulfillments`);
  console.log(`  Refunds:      GET /api/refunds/order/:order_id`);
  console.log(`  Create Refund:  POST /api/refunds`);
  console.log(`  Health:       GET /healthz, GET /readyz`);
  console.log('');
});
