// Customer Accounts Service
// Customer management, addresses, wishlists, loyalty tiers

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
  customersRouter,
  addressesRouter,
  wishlistsRouter,
  healthRouter,
  setDbReady,
  setStarted
} = require('./routes');

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

// Initialize database
(async () => {
  try {
    await runMigrations();
    console.log('Customer Accounts: Database migrations complete');
    setDbReady(true);

    // Start NATS event consumer
    await eventConsumer.start();
  } catch (error) {
    console.error('Customer Accounts: Failed to initialize:', error.message);
  }
})();

// Request logging and metrics
app.use(requestLogger);

// Metrics endpoint
app.get('/metrics', metricsHandler);

// Authentication middleware
app.use(authenticate);

// Mount API routes
app.use('/api/customers', customersRouter);
app.use('/api/customers/:customer_id/addresses', addressesRouter);
app.use('/api/customers/:customer_id/wishlists', wishlistsRouter);

// Legacy routes (backward compatibility)
app.use('/customers', customersRouter);
app.use('/customers/:customer_id/addresses', addressesRouter);
app.use('/customers/:customer_id/wishlists', wishlistsRouter);

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
        req.path.startsWith('/customers') ||
        req.path.startsWith('/health') ||
        req.path.startsWith('/metrics') ||
        req.path.startsWith('/status') ||
        req.path.startsWith('/stats') ||
        req.path.startsWith('/readyz') ||
        req.path.startsWith('/healthz')) {
      return next();
    }
    res.sendFile(path.join(UI_DIST, 'index.html'));
  });
}

// Error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`\nCustomer Accounts service listening on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  Customers:  GET/POST   /api/customers`);
  console.log(`              GET/PATCH/DELETE /api/customers/:id`);
  console.log(`  Addresses:  GET/POST   /api/customers/:id/addresses`);
  console.log(`              PATCH/DELETE /api/customers/:id/addresses/:addr_id`);
  console.log(`              PATCH      /api/customers/:id/addresses/:addr_id/default`);
  console.log(`  Wishlists:  GET/POST   /api/customers/:id/wishlists`);
  console.log(`              DELETE     /api/customers/:id/wishlists/:product_id`);
  console.log(`\n`);
});
