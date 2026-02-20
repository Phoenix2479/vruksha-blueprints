// QR Code Generator Service - Docker Version
// PostgreSQL + NATS architecture

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
  healthRouter,
  settingsRouter,
  qrRouter,
  redirectRouter,
  bulkRouter,
  exportRouter,
  analyticsRouter,
  productsRouter,
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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Storage for uploads
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'storage', 'uploads');
try {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
} catch (e) {
  console.warn(`[QR] Could not create upload dir ${UPLOAD_DIR}: ${e.message}`);
}
app.use('/logos', express.static(UPLOAD_DIR));

// Set startup time
setStarted(Date.now());

// Initialize database
(async () => {
  try {
    await runMigrations();
    console.log('[QR Generator] Database migrations complete');
    setDbReady(true);
  } catch (error) {
    console.error('[QR Generator] Failed to initialize:', error.message);
  }
})();

// Request logging
app.use(requestLogger);

// Routes - Health (no auth)
app.use('/health', healthRouter);

// Routes - Public redirect (no auth)
app.use('/qr/r', redirectRouter);

// Routes - Protected
app.use('/api/settings', authenticate, settingsRouter);
app.use('/api/qr', authenticate, qrRouter);
app.use('/api/qr/bulk', authenticate, bulkRouter);
app.use('/api/export', authenticate, exportRouter);
app.use('/api/analytics', authenticate, analyticsRouter);
app.use('/api/products', authenticate, productsRouter);

// Metrics endpoint
app.get('/metrics', metricsHandler);

// Logo upload endpoint
app.post('/api/logo/upload', authenticate, express.raw({ type: 'image/*', limit: '5mb' }), async (req, res) => {
  try {
    const { v4: uuidv4 } = require('uuid');
    const sharp = require('sharp');
    
    const filename = `${uuidv4()}.png`;
    const filepath = path.join(UPLOAD_DIR, filename);
    
    await sharp(req.body).png().toFile(filepath);
    
    res.json({ success: true, data: { path: filepath, url: `/logos/${filename}` } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Static UI files (if built)
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) {
  app.use(express.static(uiPath));
  
  // SPA fallback
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/qr') && !req.path.startsWith('/health')) {
      res.sendFile(path.join(uiPath, 'index.html'));
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });
}

// Error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`[QR Code Generator] Running on http://localhost:${PORT}`);
  console.log(`[QR Code Generator] Mode: Docker (PostgreSQL)`);
});

module.exports = app;
