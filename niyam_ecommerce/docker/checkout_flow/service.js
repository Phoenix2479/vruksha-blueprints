// Checkout Flow Service
// Multi-step checkout: address, shipping, payment, order placement

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
  checkoutRouter,
  healthRouter,
  setDbReady,
  setStarted
} = require('./routes');

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

// Initialize database
(async () => {
  try {
    await runMigrations();
    console.log('Checkout Flow: Database migrations complete');
    setDbReady(true);
  } catch (error) {
    console.error('Checkout Flow: Failed to initialize:', error.message);
  }
})();

// Request logging and metrics
app.use(requestLogger);

// Metrics endpoint
app.get('/metrics', metricsHandler);

// Authentication middleware
app.use(authenticate);

// Mount API routes
app.use('/api/checkout', checkoutRouter);

// Legacy routes (backward compatibility)
app.use('/checkout', checkoutRouter);

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
        req.path.startsWith('/checkout') ||
        req.path.startsWith('/health') ||
        req.path.startsWith('/metrics')) {
      return next();
    }
    res.sendFile(path.join(UI_DIST, 'index.html'));
  });
}

// Error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`\nCheckout Flow service listening on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
  if (fs.existsSync(UI_DIST)) {
    console.log(`UI: http://localhost:${PORT} (embedded)`);
  }
  console.log(`\nEndpoints:`);
  console.log(`  Init:        POST /api/checkout`);
  console.log(`  Get Session: GET  /api/checkout/:id`);
  console.log(`  Address:     POST /api/checkout/:id/address`);
  console.log(`  Shipping:    POST /api/checkout/:id/shipping`);
  console.log(`  Payment:     POST /api/checkout/:id/payment`);
  console.log(`  Confirm:     POST /api/checkout/:id/confirm`);
  console.log(`  Cancel:      POST /api/checkout/:id/cancel`);
  console.log(`  Health:      GET  /healthz`);
  console.log(`  Metrics:     GET  /metrics`);
  console.log(``);
});
