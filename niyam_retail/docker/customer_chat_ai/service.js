// Customer Chat AI - Intelligent Chatbot
// Features: NLU, intent classification, sentiment analysis, conversation history, auto-responses

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
    console.log('✅ Customer Chat AI - Intelligent Chatbot: NATS KV Store connected');
    dbReady = true;
  } catch (error) {
    console.error('❌ Customer Chat AI - Intelligent Chatbot: Failed to connect:', error.message);
  }
})();

// Prometheus metrics
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
const httpHistogram = new promClient.Histogram({
  name: 'customer_chat_ai_http_request_duration_seconds',
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

const PORT = process.env.PORT || 8949;

// ============================================
// API ENDPOINTS
// ============================================

// POST /api/chat/message - Send chat message
app.post('/api/chat/message', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { session_id, message, customer_id } = req.body;
    
    // Store message
    await query(`
      INSERT INTO chat_messages (tenant_id, session_id, customer_id, message, sender, created_at)
      VALUES ($1, $2, $3, $4, 'customer', NOW())
    `, [tenant, session_id, customer_id, message]);
    
    // Simple intent classification (in production, use AI gateway)
    let intent = 'general_inquiry';
    let response = 'Thank you for your message. How can I assist you today?';
    
    if (message.toLowerCase().includes('order')) {
      intent = 'order_status';
      response = 'I can help you check your order status. Please provide your order number.';
    } else if (message.toLowerCase().includes('return')) {
      intent = 'return_request';
      response = 'I can assist with returns. Please provide your order number and reason for return.';
    }
    
    // Store bot response
    await query(`
      INSERT INTO chat_messages (tenant_id, session_id, customer_id, message, sender, intent, created_at)
      VALUES ($1, $2, $3, $4, 'bot', $5, NOW())
    `, [tenant, session_id, customer_id, response, intent]);
    
    res.json({ success: true, response, intent });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/chat/history - Get chat history
app.get('/api/chat/history', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { session_id, customer_id } = req.query;
    
    let sql = 'SELECT * FROM chat_messages WHERE tenant_id = $1';
    const params = [tenant];
    
    if (session_id) {
      params.push(session_id);
      sql += ` AND session_id = $${params.length}`;
    }
    
    if (customer_id) {
      params.push(customer_id);
      sql += ` AND customer_id = $${params.length}`;
    }
    
    sql += ' ORDER BY created_at ASC LIMIT 100';
    
    const result = await query(sql, params);
    res.json({ success: true, messages: result.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/chat/analytics - Chat analytics
app.get('/api/chat/analytics', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { period = '30' } = req.query;
    
    const result = await query(`
      SELECT 
        COUNT(DISTINCT session_id) as total_conversations,
        COUNT(*) FILTER (WHERE sender = 'customer') as customer_messages,
        COUNT(*) FILTER (WHERE sender = 'bot') as bot_responses,
        COUNT(DISTINCT intent) as unique_intents
      FROM chat_messages
      WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '${period} days'
    `, [tenant]);
    
    res.json({ success: true, analytics: result.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/chat/escalate - Escalate to human agent
app.post('/api/chat/escalate', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { session_id, reason } = req.body;
    
    await query(`
      UPDATE chat_sessions
      SET escalated = true, escalation_reason = $1, escalated_at = NOW()
      WHERE tenant_id = $2 AND id = $3
    `, [reason, tenant, session_id]);
    
    res.json({ success: true, message: 'Chat escalated to human agent' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/chat/intents - Get intent statistics
app.get('/api/chat/intents', async (req, res) => {
  try {
    const tenant = getTenantId(req);
    const { period = '30' } = req.query;
    
    const result = await query(`
      SELECT intent, COUNT(*) as count
      FROM chat_messages
      WHERE tenant_id = $1 
        AND sender = 'bot' 
        AND intent IS NOT NULL
        AND created_at >= NOW() - INTERVAL '${period} days'
      GROUP BY intent
      ORDER BY count DESC
    `, [tenant]);
    
    res.json({ success: true, intents: result.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Health endpoints
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'customer_chat_ai' }));
app.get('/readyz', (req, res) => {
  const ready = dbReady;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not ready' });
});
app.get('/stats', (req, res) => {
  res.json({
    uptime: Math.floor((Date.now() - started) / 1000),
    service: 'customer_chat_ai',
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
  console.log(`\n✅ Customer Chat AI - Intelligent Chatbot listening on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`\nFeatures: NLU, intent classification, sentiment analysis, conversation history, auto-responses\n`);
});
