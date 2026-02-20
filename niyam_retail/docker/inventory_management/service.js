// Inventory Management Service
// Stock tracking, multi-location, transfers, low stock alerts

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
  productsRouter,
  stockRouter,
  importRouter,
  healthRouter,
  catalogRouter,
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

// Storage for uploads (local dev uses __dirname, Docker uses /app)
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'storage', 'uploads');
try {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
} catch (e) {
  console.warn(`Could not create upload dir ${UPLOAD_DIR}: ${e.message}`);
}
app.use('/files', express.static(UPLOAD_DIR));

// Set startup time
setStarted(Date.now());

// Initialize database and KV store
(async () => {
  try {
    // Run database migrations
    await runMigrations();
    console.log('✅ Inventory Management: Database migrations complete');

    // Connect to KV store
    await kvStore.connect();
    console.log('✅ Inventory Management: NATS KV Store connected');
    setDbReady(true);
  } catch (error) {
    console.error('❌ Inventory Management: Failed to initialize:', error.message);
  }
})();

// Request logging and metrics
app.use(requestLogger);

// Metrics endpoint
app.get('/metrics', metricsHandler);

// Authentication middleware
app.use(authenticate);

// Mount API routes (prefixed with /api for clarity)
app.use('/api/products', productsRouter);
app.use('/api/stock', stockRouter);
app.use('/api/inventory/import', importRouter);

// Smart Import routes mounted at /api/inventory/* for frontend compatibility
// (Frontend calls /api/inventory/templates, /api/inventory/sessions, /api/inventory/extract)
app.use('/api/inventory', importRouter);

// Legacy routes (keep for backward compatibility)
app.use('/products', productsRouter);
app.use('/stock', stockRouter);
app.use('/inventory/import', importRouter);
app.use('/inventory', importRouter);

// Catalog routes (categories, brands, tags)
app.use('/api', catalogRouter);
app.use(catalogRouter);

// ============================================
// EXTENDED INVENTORY FEATURES (Real Implementation)
// ============================================
const warehouseRouter = require('./routes/warehouse');
const alertsRouter = require('./routes/alerts');

// Real implementations - all routes are now fully implemented
app.use('/api', warehouseRouter);
app.use('/api', alertsRouter);
app.use(warehouseRouter);
app.use(alertsRouter);

// Health routes - mount at both root and /api for compatibility
app.use('/', healthRouter);
app.use('/api', healthRouter);

// Serve embedded UI from ui/dist if it exists
const UI_DIST = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(UI_DIST)) {
  console.log('📦 Serving embedded UI from ui/dist');
  app.use(express.static(UI_DIST));
  
  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res, next) => {
    // Skip API and health routes
    if (req.path.startsWith('/api') || 
        req.path.startsWith('/products') || 
        req.path.startsWith('/stock') || 
        req.path.startsWith('/inventory') ||
        req.path.startsWith('/health') ||
        req.path.startsWith('/metrics') ||
        req.path.startsWith('/files') ||
        // Extended inventory routes
        req.path.startsWith('/alerts') ||
        req.path.startsWith('/bundles') ||
        req.path.startsWith('/serials') ||
        req.path.startsWith('/batches') ||
        req.path.startsWith('/stock-counts') ||
        req.path.startsWith('/receiving') ||
        req.path.startsWith('/transfers') ||
        req.path.startsWith('/locations') ||
        req.path.startsWith('/valuation') ||
        req.path.startsWith('/analysis') ||
        req.path.startsWith('/forecast') ||
        req.path.startsWith('/reorder') ||
        req.path.startsWith('/reservations') ||
        req.path.startsWith('/write-offs') ||
        req.path.startsWith('/reports') ||
        req.path.startsWith('/cart') ||
        req.path.startsWith('/modifier-groups')) {
      return next();
    }
    res.sendFile(path.join(UI_DIST, 'index.html'));
  });
}

// Error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`\n✅ Inventory Management service listening on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
  if (fs.existsSync(UI_DIST)) {
    console.log(`🖥️  UI: http://localhost:${PORT} (embedded)`);
  } else {
    console.log(`⚠️  UI: Not found at ${UI_DIST} - run 'cd ui && bun run build'`);
  }
  console.log(`\n📦 Core Features: Products, Stock, Import`);
  console.log(`\n🔧 Extended Features (Active):`);
  console.log(`   • Low Stock Alerts:     GET  /alerts/low-stock`);
  console.log(`   • Product Variants:     GET  /products/:id/variants`);
  console.log(`   • Bundle Products:      GET  /bundles, POST /bundles`);
  console.log(`   • Serial Tracking:      GET  /products/:id/serials, POST /serials/capture`);
  console.log(`   • Batch/Lot Tracking:   GET  /products/:id/batches, POST /batches/select`);
  console.log(`   • Item Modifiers:       GET  /products/:id/modifiers`);
  console.log(`   • Stock Reservations:   POST /stock/reserve, POST /stock/release`);
  console.log(`\n🏭 Warehouse Features (Active):`);
  console.log(`   • Stock Counts:         POST /stock-counts, GET /stock-counts/:id`);
  console.log(`   • Goods Receiving:      POST /receiving, GET /receiving/:id`);
  console.log(`   • Stock Transfers:      POST /transfers, GET /transfers/:id`);
  console.log(`   • Location/Bin Mgmt:    GET  /locations, POST /locations/move`);
  console.log(`   • Inventory Valuation:  GET  /valuation`);
  console.log(`   • ABC Analysis:         GET  /analysis/abc`);
  console.log(`   • Dead Stock:           GET  /analysis/dead-stock`);
  console.log(`   • Stock Aging:          GET  /analysis/aging`);
  console.log(`   • Turnover Analysis:    GET  /analysis/turnover`);
  console.log(`   • Demand Forecast:      GET  /forecast`);
  console.log(`   • Reorder Suggestions:  GET  /reorder/suggestions`);
  console.log(`   • Auto Reorder:         POST /reorder/auto-generate`);
  console.log(`   • Stock Write-offs:     POST /write-offs`);
  console.log(`   • Reports:              GET  /reports/stock-summary, /reports/movement`);
  console.log(`\n🧠 Smart Import Features (Active):`);
  console.log(`   • Supplier Templates:   GET  /api/inventory/import/templates`);
  console.log(`   • Template Matching:    GET  /api/inventory/import/templates/match`);
  console.log(`   • Persistent Sessions:  GET  /api/inventory/import/sessions`);
  console.log(`   • Session Expiry Warn:  GET  /api/inventory/import/sessions/expiring`);
  console.log(`   • AI Vision Extract:    POST /api/inventory/import/extract`);
  console.log(`   • AI Usage Stats:       GET  /api/inventory/import/ai/usage`);
  console.log(`\n`);
});
