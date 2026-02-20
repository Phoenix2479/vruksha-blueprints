// Language Support - Multi-Language
// Features: Language packs, translation API, RTL support, locale formatting

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const promClient = require('prom-client');
const { query } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');
const kvStore = require('@vruksha/platform/nats/kv_store');

const app = express();
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function getTenantId(req) {
  const t = req.headers['x-tenant-id'];
  return (typeof t === 'string' && t.trim()) ? t.trim() : DEFAULT_TENANT_ID;
}

// Security
app.use(helmet({ contentSecurityPolicy: false }));

// CORS
const DEFAULT_ALLOWED = ['http://localhost:3001', 'http://localhost:3003', 'http://localhost:5173'];
const ALLOW_ALL = (process.env.ALLOW_ALL_CORS || 'true').toLowerCase() === 'true';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const ORIGIN_ALLOWLIST = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : DEFAULT_ALLOWED;
app.use(cors({
  origin: (origin, cb) => {
    if (ALLOW_ALL || !origin || ORIGIN_ALLOWLIST.includes(origin)) return cb(null, true);
    return cb(new Error('CORS not allowed'), false);
  },
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
}));

app.use(express.json());

const started = Date.now();
let dbReady = false;

// Initialize KV store
(async () => {
  try {
    await kvStore.connect();
    console.log('✅ Language Support - Multi-Language: NATS KV Store connected');
    dbReady = true;
  } catch (error) {
    console.error('❌ Language Support - Multi-Language: Failed to connect:', error.message);
  }
})();

// Prometheus metrics
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
const httpHistogram = new promClient.Histogram({
  name: 'language_support_http_request_duration_seconds',
  help: 'HTTP duration',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});
registry.registerMetric(httpHistogram);

app.use((req, res, next) => {
  const s = process.hrtime.bigint();
  res.on('finish', () => {
    const d = Number(process.hrtime.bigint() - s) / 1e9;
    const route = req.route?.path || req.path;
    httpHistogram.labels(req.method, route, String(res.statusCode)).observe(d);
  });
  next();
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

// Authentication
const SKIP_AUTH = (process.env.SKIP_AUTH || 'true').toLowerCase() === 'true';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

function authenticate(req, _res, next) {
  if (SKIP_AUTH) return next();
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return next();
  try {
    req.user = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  } catch (_) {}
  next();
}
app.use(authenticate);

const PORT = process.env.PORT || 8954;

// ============================================
// API ENDPOINTS
// ============================================

// GET /api/languages - List supported languages
app.get('/api/languages', (req, res) => {
  try {
    const languages = [
      { code: 'en', name: 'English', direction: 'ltr', enabled: true },
      { code: 'es', name: 'Spanish', direction: 'ltr', enabled: true },
      { code: 'fr', name: 'French', direction: 'ltr', enabled: true },
      { code: 'de', name: 'German', direction: 'ltr', enabled: true },
      { code: 'hi', name: 'Hindi', direction: 'ltr', enabled: true },
      { code: 'zh', name: 'Chinese', direction: 'ltr', enabled: true },
      { code: 'ar', name: 'Arabic', direction: 'rtl', enabled: true },
      { code: 'ja', name: 'Japanese', direction: 'ltr', enabled: true }
    ];
    
    res.json({ success: true, languages });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/translations/:lang - Get translations for language
app.get('/api/translations/:lang', (req, res) => {
  try {
    const { lang } = req.params;
    
    // In production, load from database or file
    const translations = {
      en: { welcome: 'Welcome', products: 'Products', checkout: 'Checkout' },
      es: { welcome: 'Bienvenido', products: 'Productos', checkout: 'Pagar' },
      fr: { welcome: 'Bienvenue', products: 'Produits', checkout: 'Paiement' }
    };
    
    res.json({ success: true, language: lang, translations: translations[lang] || translations.en });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/translations/update - Update translation
app.post('/api/translations/update', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { language, key, value } = req.body;
    
    await query(`
      INSERT INTO translations (tenant_id, language, key, value, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (tenant_id, language, key) 
      DO UPDATE SET value = $4, updated_at = NOW()
    `, [tenant, language, key, value]);
    
    res.json({ success: true, message: 'Translation updated' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/translations/coverage - Translation coverage report
app.get('/api/translations/coverage', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    
    const result = await query(`
      SELECT language, COUNT(*) as translated_keys
      FROM translations
      WHERE tenant_id = $1
      GROUP BY language
    `, [tenant]);
    
    res.json({ success: true, coverage: result.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/translations/export - Export translations
app.post('/api/translations/export', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { language } = req.body;
    
    const result = await query(`
      SELECT key, value
      FROM translations
      WHERE tenant_id = $1 AND language = $2
    `, [tenant, language]);
    
    const exportData = {};
    result.rows.forEach(row => {
      exportData[row.key] = row.value;
    });
    
    res.json({ success: true, language, translations: exportData });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Health endpoints
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'language_support' }));
app.get('/readyz', (req, res) => {
  const ready = dbReady;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not ready' });
});
app.get('/stats', (req, res) => {
  res.json({
    uptime: Math.floor((Date.now() - started) / 1000),
    service: 'language_support',
    db_ready: dbReady
  });
});

// Serve embedded UI
const UI_DIST_PATH = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(UI_DIST_PATH)) {
  console.log('📦 Serving embedded UI from ui/dist');
  app.use(express.static(UI_DIST_PATH));
  
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || 
        req.path.startsWith('/health') ||
        req.path.startsWith('/metrics')) {
      return next();
    }
    res.sendFile(path.join(UI_DIST_PATH, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`\n✅ Language Support - Multi-Language listening on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`\nFeatures: Language packs, translation API, RTL support, locale formatting\n`);
});
