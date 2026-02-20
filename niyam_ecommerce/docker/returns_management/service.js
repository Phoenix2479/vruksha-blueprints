// Returns Management Service
// Return requests, refund processing, and exchange management

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
  returnsRouter,
  exchangesRouter,
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
    console.log('Returns Management: Database migrations complete');
    setDbReady(true);

    // Start NATS event consumer
    await eventConsumer.start();
  } catch (error) {
    console.error('Returns Management: Failed to initialize:', error.message);
  }
})();

// Request logging and metrics
app.use(requestLogger);

// Metrics endpoint
app.get('/metrics', metricsHandler);

// Authentication middleware
app.use(authenticate);

// Mount API routes
app.use('/api/returns', returnsRouter);
app.use('/api/returns', exchangesRouter);

// Legacy routes (backward compatibility)
app.use('/returns', returnsRouter);
app.use('/returns', exchangesRouter);

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
        req.path.startsWith('/returns') ||
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
  console.log(`\nReturns Management service listening on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  Returns:     GET/POST    /api/returns`);
  console.log(`  Return:      GET/PATCH   /api/returns/:id`);
  console.log(`  Exchange:    POST        /api/returns/:id/exchange`);
  console.log(`  Exchanges:   GET         /api/returns/:id/exchanges`);
  console.log(`  Health:      GET         /healthz, GET /readyz`);
  console.log('');
});
