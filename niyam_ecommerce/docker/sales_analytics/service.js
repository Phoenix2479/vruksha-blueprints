// Sales Analytics Service
// KPI dashboard, product performance, trend analysis (READ-ONLY)

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
  dashboardRouter,
  productsRouter,
  trendsRouter,
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
  methods: ['GET', 'OPTIONS'],
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
    console.log('Sales Analytics: Database migrations complete');
    setDbReady(true);

    // Start NATS event consumer
    await eventConsumer.start();
  } catch (error) {
    console.error('Sales Analytics: Failed to initialize:', error.message);
  }
})();

// Request logging and metrics
app.use(requestLogger);

// Metrics endpoint
app.get('/metrics', metricsHandler);

// Authentication middleware
app.use(authenticate);

// Mount API routes (READ-ONLY module)
app.use('/api/dashboard', dashboardRouter);
app.use('/api/analytics/products', productsRouter);
app.use('/api/analytics/trends', trendsRouter);

// Legacy routes (backward compatibility)
app.use('/dashboard', dashboardRouter);
app.use('/analytics/products', productsRouter);
app.use('/analytics/trends', trendsRouter);

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
        req.path.startsWith('/dashboard') ||
        req.path.startsWith('/analytics') ||
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
  console.log(`\nSales Analytics service listening on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
  console.log(`\nEndpoints (READ-ONLY):`);
  console.log(`  Dashboard:  GET  /api/dashboard/kpis?start_date=&end_date=`);
  console.log(`  Products:   GET  /api/analytics/products/top?sort_by=revenue&limit=10`);
  console.log(`  Trends:     GET  /api/analytics/trends?group_by=day&start_date=&end_date=`);
  console.log(`\n`);
});
