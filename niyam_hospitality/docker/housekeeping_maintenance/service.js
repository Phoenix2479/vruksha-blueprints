// Housekeeping & Maintenance Service
// Manages cleaning tasks, asset repairs, and staff assignments

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const promClient = require('prom-client');
const { z } = require('zod');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

// Import shared modules (support both monorepo and Docker image layouts)
let db = null;
let sdk = null;
let kvStore = null;

try {
  db = require('../../../../db/postgres');
  sdk = require('../../../../platform/sdk/node');
  kvStore = require('../../../../platform/nats/kv_store');
} catch (_) {
  db = require('@vruksha/platform/db/postgres');
  sdk = require('@vruksha/platform/sdk/node');
  kvStore = require('@vruksha/platform/nats/kv_store');
}

const { query, getClient } = db;
const { publishEnvelope } = sdk;

const app = express();
const SERVICE_NAME = 'housekeeping_maintenance';
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// Security
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Storage for proof images (damage/cleaning)
const STORAGE_ROOT = path.resolve(__dirname, '../../../../storage/uploads');
const UPLOAD_DIR = path.join(STORAGE_ROOT, 'housekeeping_images');
try {
    if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
} catch (err) {
    console.error(`Failed to create upload directory ${UPLOAD_DIR}:`, err.message);
}

app.use('/files', express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${uuidv4()}${ext}`);
  }
});
const upload = multer({ storage });

// Observability
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

// Auth
const SKIP_AUTH = (process.env.SKIP_AUTH || 'true').toLowerCase() === 'true';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

app.use((req, res, next) => {
  if (SKIP_AUTH) return next();
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try { req.user = jwt.verify(token, JWT_SECRET); } catch (e) {}
  }
  next();
});

function getTenantId(req) {
  return req.headers['x-tenant-id'] || req.user?.tenant_id || DEFAULT_TENANT_ID;
}

// NATS KV
let dbReady = false;
(async () => {
  try {
    await kvStore.connect();
    console.log(`✅ ${SERVICE_NAME}: NATS KV Connected`);
    dbReady = true;
  } catch (e) {
    console.error(`❌ ${SERVICE_NAME}: NATS KV Failed`, e);
  }
})();

// ============================================
// API ENDPOINTS
// ============================================

// Get all tasks
app.get('/tasks', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { status, task_type } = req.query;
    
    let sql = `
      SELECT t.*, r.room_number 
      FROM hotel_housekeeping_tasks t
      LEFT JOIN hotel_rooms r ON t.room_id = r.id
      WHERE t.tenant_id = $1
    `;
    const params = [tenantId];
    
    if (status) {
      sql += ` AND t.status = $2`;
      params.push(status);
    }
    if (task_type) {
      sql += ` AND t.task_type = $${params.length + 1}`;
      params.push(task_type);
    }
    
    sql += ` ORDER BY t.priority DESC, t.created_at DESC`;
    
    const result = await query(sql, params);
    res.json({ success: true, tasks: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create Task (with optional image)
app.post('/tasks', upload.array('images', 3), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { room_id, task_type, priority, assigned_to, notes } = req.body;
    const files = req.files || [];
    const images = files.map(f => ({ url: `/files/${f.filename}`, alt: task_type }));

    const result = await query(
      `INSERT INTO hotel_housekeeping_tasks 
       (tenant_id, room_id, task_type, priority, assigned_to, notes, images, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING *`,
      [
        tenantId, 
        room_id || null, 
        task_type, 
        priority || 'medium', 
        assigned_to || null, 
        notes, 
        JSON.stringify(images)
      ]
    );

    // If room_id is present, mark room as 'maintenance' or 'dirty' depending on task
    if (room_id) {
      let roomStatus = 'dirty';
      if (task_type === 'repair') roomStatus = 'maintenance';
      await query(`UPDATE hotel_rooms SET status = $1 WHERE id = $2`, [roomStatus, room_id]);
    }

    await publishEnvelope('hotel.housekeeping.task_created.v1', 1, { task_id: result.rows[0].id });
    res.json({ success: true, task: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update Task Status
app.patch('/tasks/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { status, notes } = req.body; // 'in_progress', 'completed'
    
    const result = await query(
      `UPDATE hotel_housekeeping_tasks 
       SET status = $1, notes = COALESCE($2, notes), updated_at = NOW() 
       WHERE id = $3 AND tenant_id = $4 RETURNING *`,
      [status, notes, id, tenantId]
    );
    
    if (result.rowCount === 0) return res.status(404).json({ error: 'Task not found' });
    const task = result.rows[0];

    // If completed, check if room should be available
    if (status === 'completed' && task.room_id) {
      await query(`UPDATE hotel_rooms SET status = 'available' WHERE id = $1`, [task.room_id]);
    }

    await publishEnvelope('hotel.housekeeping.task_updated.v1', 1, { task_id: id, status });
    res.json({ success: true, task });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health
app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
app.get('/readyz', (req, res) => res.json({ status: dbReady ? 'ready' : 'not_ready' }));


// ============================================
// SERVE EMBEDDED UI (Auto-generated)
// ============================================

const UI_DIST = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(UI_DIST)) {
  console.log('📦 Serving embedded UI from ui/dist');
  app.use(express.static(UI_DIST));
  
  // SPA fallback - serve index.html for non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || 
        req.path.startsWith('/health') ||
        req.path.startsWith('/metrics') ||
        req.path.startsWith('/readyz')) {
      return next();
    }
    res.sendFile(path.join(UI_DIST, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('<html><body style="font-family:system-ui;text-align:center;padding:2rem;"><h1>Service Running</h1><p><a href="/healthz">Health Check</a></p></body></html>');
  });
}

const PORT = process.env.PORT || 8922;
app.listen(PORT, () => {
  console.log(`✅ Housekeeping Service listening on ${PORT}`);
});
