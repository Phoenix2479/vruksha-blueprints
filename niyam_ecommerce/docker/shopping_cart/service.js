// Shopping Cart Service
// Cart management, item tracking, coupons, abandonment detection

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
  cartsRouter,
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
    console.log('Shopping Cart: Database migrations complete');
    setDbReady(true);
  } catch (error) {
    console.error('Shopping Cart: Failed to initialize:', error.message);
  }
})();

// Request logging and metrics
app.use(requestLogger);

// Metrics endpoint
app.get('/metrics', metricsHandler);

// Authentication middleware
app.use(authenticate);

// Mount API routes
app.use('/api/carts', cartsRouter);

// Legacy routes (backward compatibility)
app.use('/carts', cartsRouter);

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
        req.path.startsWith('/carts') ||
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
  console.log(`\nShopping Cart service listening on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
  if (fs.existsSync(UI_DIST)) {
    console.log(`UI: http://localhost:${PORT} (embedded)`);
  }
  console.log(`\nEndpoints:`);
  console.log(`  Carts:       POST /api/carts`);
  console.log(`  Get Cart:    GET  /api/carts/:id`);
  console.log(`  Add Item:    POST /api/carts/:id/items`);
  console.log(`  Update Qty:  PATCH /api/carts/:id/items/:item_id`);
  console.log(`  Remove Item: DELETE /api/carts/:id/items/:item_id`);
  console.log(`  Apply Coupon: POST /api/carts/:id/coupon`);
  console.log(`  Totals:      GET  /api/carts/:id/totals`);
  console.log(`  Abandoned:   POST /api/carts/abandoned/scan`);
  console.log(`  Health:      GET  /healthz`);
  console.log(`  Metrics:     GET  /metrics`);
  console.log(``);
});
