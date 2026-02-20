// Abandoned Cart Recovery Service
// Detect abandoned carts, trigger recovery via templates, track conversions

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
  abandonedRouter,
  recoveryRouter,
  templatesRouter,
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
    console.log('Abandoned Cart Recovery: Database migrations complete');

    await kvStore.connect();
    console.log('Abandoned Cart Recovery: NATS KV Store connected');
    setDbReady(true);

    // Start NATS event consumer
    await eventConsumer.start();
  } catch (error) {
    console.error('Abandoned Cart Recovery: Failed to initialize:', error.message);
  }
})();

// Request logging and metrics
app.use(requestLogger);

// Metrics endpoint
app.get('/metrics', metricsHandler);

// Authentication middleware
app.use(authenticate);

// Mount API routes
app.use('/api/abandoned', abandonedRouter);
app.use('/api/recovery', recoveryRouter);
app.use('/api/templates', templatesRouter);

// Legacy routes (backward compatibility)
app.use('/abandoned', abandonedRouter);
app.use('/recovery', recoveryRouter);
app.use('/templates', templatesRouter);

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
        req.path.startsWith('/abandoned') ||
        req.path.startsWith('/recovery') ||
        req.path.startsWith('/templates') ||
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
  console.log(`\nAbandoned Cart Recovery service listening on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  Abandoned Carts:  GET/POST   /api/abandoned`);
  console.log(`  Cart Detail:      GET        /api/abandoned/:id`);
  console.log(`  Cart Stats:       GET        /api/abandoned/stats`);
  console.log(`  Mark Recovered:   POST       /api/abandoned/:id/recovered`);
  console.log(`  Trigger Recovery: POST       /api/recovery/trigger`);
  console.log(`  Track Attempt:    POST       /api/recovery/attempts/:id/track`);
  console.log(`  List Attempts:    GET        /api/recovery/attempts/:cart_id`);
  console.log(`  Templates:        GET/POST   /api/templates`);
  console.log(`  Template:         GET/PUT/DEL /api/templates/:id`);
  console.log(`  Health:           GET        /healthz`);
  console.log(``);
});
