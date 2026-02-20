// Discount Coupons Service
// Create, validate, redeem discount coupons with analytics

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
  couponsRouter,
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
    console.log('Discount Coupons: Database migrations complete');

    await kvStore.connect();
    console.log('Discount Coupons: NATS KV Store connected');
    setDbReady(true);
  } catch (error) {
    console.error('Discount Coupons: Failed to initialize:', error.message);
  }
})();

// Request logging and metrics
app.use(requestLogger);

// Metrics endpoint
app.get('/metrics', metricsHandler);

// Authentication middleware
app.use(authenticate);

// Mount API routes
app.use('/api/coupons', couponsRouter);

// Legacy routes (backward compatibility)
app.use('/coupons', couponsRouter);

// Health routes
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
        req.path.startsWith('/coupons') ||
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
  console.log(`\nDiscount Coupons service listening on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  Coupons:     GET/POST     /api/coupons`);
  console.log(`  Coupon:      GET/PUT/DEL  /api/coupons/:id`);
  console.log(`  Usage:       GET          /api/coupons/:id/usage`);
  console.log(`  Validate:    POST         /api/coupons/validate`);
  console.log(`  Apply:       POST         /api/coupons/apply`);
  console.log(`  Analytics:   GET          /api/coupons/analytics`);
  console.log(`  Health:      GET          /healthz`);
  console.log(``);
});
