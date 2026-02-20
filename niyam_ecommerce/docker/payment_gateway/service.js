// Payment Gateway Service
// Authorize, capture, refund transactions via configurable gateways

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
  gatewaysRouter,
  transactionsRouter,
  healthRouter,
  setDbReady,
  setStarted
} = require('./routes');

// Platform
const kvStore = require('@vruksha/platform/nats/kv_store');

// Database initialization
const { runMigrations } = require('./db/init');

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
    console.log('Payment Gateway: Database migrations complete');

    await kvStore.connect();
    console.log('Payment Gateway: NATS KV Store connected');
    setDbReady(true);
  } catch (error) {
    console.error('Payment Gateway: Failed to initialize:', error.message);
  }
})();

// Request logging and metrics
app.use(requestLogger);

// Metrics endpoint
app.get('/metrics', metricsHandler);

// Authentication middleware
app.use(authenticate);

// Mount API routes
app.use('/api/gateways', gatewaysRouter);
app.use('/api/transactions', transactionsRouter);

// Legacy routes (backward compatibility)
app.use('/gateways', gatewaysRouter);
app.use('/transactions', transactionsRouter);

// Health routes
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
        req.path.startsWith('/gateways') ||
        req.path.startsWith('/transactions') ||
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
  console.log(`\nPayment Gateway service listening on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  Gateways:     GET/POST   /api/gateways`);
  console.log(`  Gateway:      GET/PUT/DEL /api/gateways/:id`);
  console.log(`  Authorize:    POST       /api/transactions/authorize`);
  console.log(`  Capture:      POST       /api/transactions/:id/capture`);
  console.log(`  Refund:       POST       /api/transactions/:id/refund`);
  console.log(`  Void:         POST       /api/transactions/:id/void`);
  console.log(`  Transactions: GET        /api/transactions`);
  console.log(`  Health:       GET        /healthz`);
  console.log(``);
});
