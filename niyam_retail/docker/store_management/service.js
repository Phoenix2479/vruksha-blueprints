// Store Management Service
// Store configuration, hours, staff assignments, shifts, cash management

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const { query, getClient } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');
const kvStore = require('@vruksha/platform/nats/kv_store');
const { runMigrations } = require('./db/init');

// Route modules
const schedulingRouter = require('./routes/scheduling');
const storeConfigRouter = require('./routes/store-config');

const app = express();

const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// Security
app.use(helmet({ contentSecurityPolicy: false }));
const ALLOW_ALL = (process.env.ALLOW_ALL_CORS || 'true').toLowerCase() === 'true';
app.use(cors({
  origin: (origin, cb) => {
    if (ALLOW_ALL || !origin) return cb(null, true);
    return cb(null, true);
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID']
}));

app.use(express.json());

const started = Date.now();
let dbReady = false;

// Initialize on startup
(async () => {
  try {
    await runMigrations();
    console.log('✅ Store Management: Database migrations completed');
    
    await kvStore.connect();
    console.log('✅ Store Management: NATS KV Store connected');
    dbReady = true;
  } catch (error) {
    console.error('❌ Store Management: Initialization error:', error.message);
  }
})();

// Helpers
function getTenantId(req) {
  const t = req.headers['x-tenant-id'];
  if (typeof t === 'string' && t.trim()) return t.trim();
  return DEFAULT_TENANT_ID;
}

const SKIP_AUTH = (process.env.SKIP_AUTH || 'true').toLowerCase() === 'true';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

function authenticate(req, _res, next) {
  if (SKIP_AUTH) return next();
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return next();
  try { req.user = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }); } catch (_) {}
  next();
}
app.use(authenticate);

function requireAnyRole(roles) {
  return (req, res, next) => {
    if (SKIP_AUTH) return next();
    if (!req.user || !Array.isArray(req.user.roles)) return res.status(401).json({ error: 'Unauthorized' });
    const has = req.user.roles.some(r => roles.includes(r));
    if (!has) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(JSON.stringify({
      svc: 'store_management',
      ts: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      tenant_id: getTenantId(req),
      duration_ms: Date.now() - start
    }));
  });
  next();
});

// ============================================
// STORE MANAGEMENT ENDPOINTS
// ============================================

app.get('/status', async (req, res) => {
  res.json({ 
    success: true, 
    service: 'store_management',
    description: 'Store configuration, hours, staff assignments',
    ready: dbReady
  });
});

// Get all stores (stores table doesn't have tenant_id in this schema)
app.get('/stores', requireAnyRole(['manager', 'admin', 'staff']), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT s.*, 
              (SELECT COUNT(*) FROM users u WHERE u.store_id = s.id AND u.status = 'active') as employee_count,
              (SELECT COALESCE(SUM(total), 0) FROM pos_transactions pt 
               WHERE pt.store_id = s.id AND pt.created_at::date = CURRENT_DATE) as daily_revenue
       FROM stores s ORDER BY s.name`
    );
    res.json({ success: true, stores: result.rows });
  } catch (e) { next(e); }
});

// Get single store
app.get('/stores/:id', requireAnyRole(['manager', 'admin', 'staff']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT s.*, 
              (SELECT COUNT(*) FROM users u WHERE u.store_id = s.id AND u.status = 'active') as employee_count
       FROM stores s WHERE s.id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Store not found' });
    }
    res.json({ success: true, store: result.rows[0] });
  } catch (e) { next(e); }
});

// Create store
app.post('/stores', requireAnyRole(['admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { name, code, address, city, state, phone, email, manager_id, timezone } = req.body;
    
    if (!name || !code) {
      return res.status(400).json({ error: 'Name and code are required' });
    }
    
    const result = await query(
      `INSERT INTO stores (name, code, address, city, state, phone, email, manager_id, timezone, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
       RETURNING *`,
      [name, code, address, city, state, phone, email, manager_id, timezone || 'UTC']
    );
    
    try {
      await publishEnvelope('retail.store.created.v1', 1, {
        tenant_id: tenantId,
        store_id: result.rows[0].id,
        name,
        timestamp: new Date().toISOString()
      });
    } catch (_) {}
    
    res.json({ success: true, store: result.rows[0] });
  } catch (e) { next(e); }
});

// Update store
app.patch('/stores/:id', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, address, city, state, phone, email, manager_id, timezone, status } = req.body;
    
    const updates = [];
    const params = [id];
    let idx = 2;
    
    if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name); }
    if (address !== undefined) { updates.push(`address = $${idx++}`); params.push(address); }
    if (city !== undefined) { updates.push(`city = $${idx++}`); params.push(city); }
    if (state !== undefined) { updates.push(`state = $${idx++}`); params.push(state); }
    if (phone !== undefined) { updates.push(`phone = $${idx++}`); params.push(phone); }
    if (email !== undefined) { updates.push(`email = $${idx++}`); params.push(email); }
    if (manager_id !== undefined) { updates.push(`manager_id = $${idx++}`); params.push(manager_id); }
    if (timezone !== undefined) { updates.push(`timezone = $${idx++}`); params.push(timezone); }
    if (status !== undefined) { updates.push(`status = $${idx++}`); params.push(status); }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push('updated_at = NOW()');
    
    const result = await query(
      `UPDATE stores SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Store not found' });
    }
    
    res.json({ success: true, store: result.rows[0] });
  } catch (e) { next(e); }
});

// Get store stats
app.get('/stores/stats/summary', requireAnyRole(['manager', 'admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const result = await query(
      `SELECT 
        (SELECT COUNT(*) FROM stores) as total_stores,
        (SELECT COUNT(*) FROM stores WHERE status = 'active') as open_stores,
        (SELECT COUNT(*) FROM employees WHERE tenant_id = $1 AND status = 'active') as total_employees,
        (SELECT COALESCE(SUM(total), 0) FROM pos_transactions WHERE created_at::date = CURRENT_DATE) as daily_revenue`,
      [tenantId]
    );
    const stats = result.rows[0];
    res.json({
      success: true,
      total_stores: parseInt(stats.total_stores) || 0,
      open_stores: parseInt(stats.open_stores) || 0,
      total_employees: parseInt(stats.total_employees) || 0,
      daily_revenue: parseFloat(stats.daily_revenue) || 0
    });
  } catch (e) { next(e); }
});

// ============================================
// EMPLOYEE/USER MANAGEMENT (using users table)
// ============================================

// Get employees (users with store assignments)
app.get('/employees', requireAnyRole(['manager', 'admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { store_id } = req.query;
    let sql = `SELECT u.id, u.name, u.email, u.phone, u.role, u.store_id, u.status, u.created_at,
               s.name as store_name
               FROM users u 
               LEFT JOIN stores s ON u.store_id = s.id 
               WHERE u.tenant_id = $1`;
    const params = [tenantId];
    
    if (store_id) {
      sql += ' AND u.store_id = $2';
      params.push(store_id);
    }
    
    sql += ' ORDER BY u.name';
    const result = await query(sql, params);
    res.json({ success: true, employees: result.rows });
  } catch (e) { next(e); }
});

// Create employee (user)
app.post('/employees', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { name, email, phone, role, store_id } = req.body;
    
    if (!name || !role || !email) {
      return res.status(400).json({ error: 'Name, email, and role are required' });
    }
    
    const result = await query(
      `INSERT INTO users (tenant_id, name, full_name, email, phone, role, store_id, status)
       VALUES ($1, $2, $2, $3, $4, $5, $6, 'active')
       RETURNING id, name, email, phone, role, store_id, status, created_at`,
      [tenantId, name, email, phone, role, store_id]
    );
    
    res.json({ success: true, employee: result.rows[0] });
  } catch (e) { next(e); }
});

// ============================================
// POS SESSIONS AS SHIFTS (using pos_sessions table)
// ============================================

// Get active sessions (shifts)
app.get('/shifts/active', requireAnyRole(['manager', 'admin']), async (req, res, next) => {
  try {
    const { store_id } = req.query;
    
    let sql = `SELECT ps.id, ps.store_id, ps.cashier_id as employee_id, ps.opened_at as started_at,
               ps.opening_balance as opening_cash, ps.status,
               u.name as employee_name, s.name as store_name
               FROM pos_sessions ps
               JOIN users u ON ps.cashier_id = u.id
               LEFT JOIN stores s ON ps.store_id = s.id
               WHERE ps.status = 'open'`;
    const params = [];
    
    if (store_id) {
      sql += ' AND ps.store_id = $1';
      params.push(store_id);
    }
    
    const result = await query(sql, params);
    res.json({ success: true, shifts: result.rows });
  } catch (e) { next(e); }
});

// Start shift (open POS session) - placeholder for future implementation
app.post('/shifts/start', requireAnyRole(['cashier', 'manager', 'admin']), async (req, res, next) => {
  res.status(501).json({ error: 'Use POS app to open sessions', message: 'Session management is handled by the POS application' });
});

// End shift - placeholder
app.post('/shifts/:shift_id/end', requireAnyRole(['cashier', 'manager', 'admin']), async (req, res, next) => {
  res.status(501).json({ error: 'Use POS app to close sessions', message: 'Session management is handled by the POS application' });
});

// ============================================
// END OF DAY REPORTS
// ============================================

app.post('/reports/end-of-day', requireAnyRole(['manager', 'admin']), async (req, res, next) => {
  try {
    const { store_id, date } = req.body;
    const reportDate = date || new Date().toISOString().split('T')[0];
    
    // Get sales summary
    let sql = `SELECT 
        COALESCE(SUM(total), 0) as gross_sales,
        COALESCE(SUM(CASE WHEN status = 'refunded' THEN total ELSE 0 END), 0) as returns,
        COUNT(*) as transaction_count,
        COALESCE(AVG(total), 0) as average_transaction
       FROM pos_transactions
       WHERE created_at::date = $1::date`;
    const params = [reportDate];
    
    if (store_id) {
      sql += ' AND store_id = $2';
      params.push(store_id);
    }
    
    const salesResult = await query(sql, params);
    const sales = salesResult.rows[0];
    
    res.json({
      success: true,
      report: {
        date: reportDate,
        store_id,
        generated_at: new Date().toISOString(),
        summary: {
          gross_sales: parseFloat(sales.gross_sales) || 0,
          returns: parseFloat(sales.returns) || 0,
          net_sales: (parseFloat(sales.gross_sales) || 0) - (parseFloat(sales.returns) || 0),
          transaction_count: parseInt(sales.transaction_count) || 0,
          average_transaction: parseFloat(sales.average_transaction) || 0
        }
      }
    });
  } catch (e) { next(e); }
});

// ============================================
// EXTENDED ROUTES (Scheduling, Store Config)
// ============================================

app.use('/scheduling', schedulingRouter);
app.use('/config', storeConfigRouter);

// ============================================
// HEALTH & STATUS
// ============================================

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', service: 'store_management' });
});

app.get('/readyz', (req, res) => {
  res.json({ 
    status: dbReady ? 'ready' : 'not_ready',
    service: 'store_management',
    nats_kv: dbReady
  });
});

app.get('/stats', (req, res) => {
  res.json({ 
    uptime: Math.round((Date.now() - started) / 1000),
    service: 'store_management',
    version: '1.0.0'
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 8801;

// Serve embedded UI from ui/dist if it exists
const UI_DIST_PATH = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(UI_DIST_PATH)) {
  console.log('📦 Serving embedded UI from ui/dist');
  app.use(express.static(UI_DIST_PATH));
  
  // SPA fallback - serve index.html for all non-API routes
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
  console.log(`\n✅ Store Management service listening on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`\nService: Store configuration, hours, staff assignments\n`);
});
