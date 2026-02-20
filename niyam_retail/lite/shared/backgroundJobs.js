/**
 * Background Job Service - Lite Version
 * Handles long-running tasks like bulk imports, label generation, AI extraction
 * Uses Node worker_threads for CPU-intensive work
 */

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { query, run, get } = require('./db');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// ============================================
// Job Types & Configuration
// ============================================

const JOB_TYPES = {
  LARGE_CSV_IMPORT: 'large_csv_import',
  BULK_LABEL_GENERATION: 'bulk_label_generation',
  AI_VISION_EXTRACTION: 'ai_vision_extraction',
  DATABASE_MAINTENANCE: 'database_maintenance',
  REPORT_GENERATION: 'report_generation',
};

const JOB_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  PAUSED: 'paused',
  CANCELLED: 'cancelled',
};

const JOB_PRIORITIES = {
  LOW: 1,
  NORMAL: 5,
  HIGH: 10,
};

// ============================================
// Database Schema
// ============================================

function ensureJobsTable() {
  run(`
    CREATE TABLE IF NOT EXISTS background_jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      payload TEXT,
      status TEXT DEFAULT 'pending',
      priority INTEGER DEFAULT 5,
      progress INTEGER DEFAULT 0,
      result TEXT,
      error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      started_at TEXT,
      completed_at TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Index for faster queries
  run(`CREATE INDEX IF NOT EXISTS idx_jobs_status ON background_jobs(status, priority DESC)`);
}

ensureJobsTable();

// ============================================
// Job Queue Management
// ============================================

let activeJobs = new Map(); // jobId -> Worker/Promise
let isProcessing = false;

/**
 * Enqueue a new background job
 * @param {string} type - Job type
 * @param {Object} payload - Job data
 * @param {number} priority - Priority (1-10, higher = more urgent)
 * @returns {string} - Job ID
 */
function enqueueJob(type, payload, priority = JOB_PRIORITIES.NORMAL) {
  const id = uuidv4();
  const now = new Date().toISOString();

  run(`
    INSERT INTO background_jobs (id, type, payload, status, priority, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [id, type, JSON.stringify(payload), JOB_STATUS.PENDING, priority, now, now]);

  console.log(`[BackgroundJobs] Enqueued job ${id} of type ${type}`);

  // Trigger processing
  processNextJob();

  return id;
}

/**
 * Get job status
 * @param {string} jobId - Job ID
 * @returns {Object} - Job status
 */
function getJobStatus(jobId) {
  const job = get('SELECT * FROM background_jobs WHERE id = ?', [jobId]);
  if (!job) return null;

  return {
    id: job.id,
    type: job.type,
    status: job.status,
    progress: job.progress,
    result: job.result ? JSON.parse(job.result) : null,
    error: job.error,
    createdAt: job.created_at,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    isActive: activeJobs.has(jobId),
  };
}

/**
 * Get all jobs (with optional filters)
 * @param {Object} filters - { status, type, limit }
 * @returns {Array} - Jobs
 */
function getJobs(filters = {}) {
  let sql = 'SELECT * FROM background_jobs WHERE 1=1';
  const params = [];

  if (filters.status) {
    sql += ' AND status = ?';
    params.push(filters.status);
  }
  if (filters.type) {
    sql += ' AND type = ?';
    params.push(filters.type);
  }

  sql += ' ORDER BY priority DESC, created_at ASC';

  if (filters.limit) {
    sql += ' LIMIT ?';
    params.push(filters.limit);
  }

  return query(sql, params).map(job => ({
    ...job,
    payload: job.payload ? JSON.parse(job.payload) : null,
    result: job.result ? JSON.parse(job.result) : null,
  }));
}

/**
 * Update job progress
 * @param {string} jobId - Job ID
 * @param {number} progress - Progress percentage (0-100)
 */
function updateJobProgress(jobId, progress) {
  const now = new Date().toISOString();
  run(
    'UPDATE background_jobs SET progress = ?, updated_at = ? WHERE id = ?',
    [Math.min(100, Math.max(0, progress)), now, jobId]
  );
}

/**
 * Cancel a job
 * @param {string} jobId - Job ID
 * @returns {boolean} - Success
 */
function cancelJob(jobId) {
  const job = get('SELECT status FROM background_jobs WHERE id = ?', [jobId]);
  if (!job) return false;

  if (job.status === JOB_STATUS.RUNNING) {
    // If worker is running, terminate it
    const worker = activeJobs.get(jobId);
    if (worker && typeof worker.terminate === 'function') {
      worker.terminate();
    }
    activeJobs.delete(jobId);
  }

  const now = new Date().toISOString();
  run(
    'UPDATE background_jobs SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?',
    [JOB_STATUS.CANCELLED, now, now, jobId]
  );

  console.log(`[BackgroundJobs] Cancelled job ${jobId}`);
  return true;
}

/**
 * Pause a job
 * @param {string} jobId - Job ID
 * @returns {boolean} - Success
 */
function pauseJob(jobId) {
  const job = get('SELECT status FROM background_jobs WHERE id = ?', [jobId]);
  if (!job || job.status !== JOB_STATUS.RUNNING) return false;

  const now = new Date().toISOString();
  run(
    'UPDATE background_jobs SET status = ?, updated_at = ? WHERE id = ?',
    [JOB_STATUS.PAUSED, now, jobId]
  );

  console.log(`[BackgroundJobs] Paused job ${jobId}`);
  return true;
}

/**
 * Resume a paused job
 * @param {string} jobId - Job ID
 * @returns {boolean} - Success
 */
function resumeJob(jobId) {
  const job = get('SELECT status FROM background_jobs WHERE id = ?', [jobId]);
  if (!job || job.status !== JOB_STATUS.PAUSED) return false;

  const now = new Date().toISOString();
  run(
    'UPDATE background_jobs SET status = ?, updated_at = ? WHERE id = ?',
    [JOB_STATUS.PENDING, now, jobId]
  );

  console.log(`[BackgroundJobs] Resumed job ${jobId}`);
  processNextJob();
  return true;
}

/**
 * Delete completed/failed jobs older than N days
 * @param {number} days - Days to keep
 * @returns {number} - Count deleted
 */
function cleanupOldJobs(days = 7) {
  const result = query(`
    SELECT COUNT(*) as count FROM background_jobs 
    WHERE status IN ('completed', 'failed', 'cancelled')
    AND datetime(completed_at) < datetime('now', '-${days} days')
  `);
  const count = result[0]?.count || 0;

  if (count > 0) {
    run(`
      DELETE FROM background_jobs 
      WHERE status IN ('completed', 'failed', 'cancelled')
      AND datetime(completed_at) < datetime('now', '-${days} days')
    `);
    console.log(`[BackgroundJobs] Cleaned up ${count} old jobs`);
  }

  return count;
}

// ============================================
// Job Processing
// ============================================

const jobHandlers = new Map();

/**
 * Register a handler for a job type
 * @param {string} type - Job type
 * @param {Function} handler - Async function(payload, progressCallback) => result
 */
function registerJobHandler(type, handler) {
  jobHandlers.set(type, handler);
  console.log(`[BackgroundJobs] Registered handler for ${type}`);
}

/**
 * Process the next pending job
 */
async function processNextJob() {
  if (isProcessing) return;

  const job = get(`
    SELECT * FROM background_jobs 
    WHERE status = 'pending' 
    ORDER BY priority DESC, created_at ASC 
    LIMIT 1
  `);

  if (!job) return;

  isProcessing = true;

  try {
    const handler = jobHandlers.get(job.type);
    if (!handler) {
      throw new Error(`No handler registered for job type: ${job.type}`);
    }

    // Mark as running
    const now = new Date().toISOString();
    run(
      'UPDATE background_jobs SET status = ?, started_at = ?, updated_at = ? WHERE id = ?',
      [JOB_STATUS.RUNNING, now, now, job.id]
    );

    const payload = job.payload ? JSON.parse(job.payload) : {};

    // Progress callback
    const onProgress = (progress) => {
      updateJobProgress(job.id, progress);
    };

    // Execute handler
    console.log(`[BackgroundJobs] Processing job ${job.id} (${job.type})`);
    activeJobs.set(job.id, { type: 'promise' }); // Track as active

    const result = await handler(payload, onProgress);

    // Mark as completed
    const completedAt = new Date().toISOString();
    run(
      'UPDATE background_jobs SET status = ?, progress = 100, result = ?, completed_at = ?, updated_at = ? WHERE id = ?',
      [JOB_STATUS.COMPLETED, JSON.stringify(result), completedAt, completedAt, job.id]
    );

    console.log(`[BackgroundJobs] Completed job ${job.id}`);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const now = new Date().toISOString();

    run(
      'UPDATE background_jobs SET status = ?, error = ?, completed_at = ?, updated_at = ? WHERE id = ?',
      [JOB_STATUS.FAILED, errorMsg, now, now, job.id]
    );

    console.error(`[BackgroundJobs] Job ${job.id} failed:`, errorMsg);
  } finally {
    activeJobs.delete(job.id);
    isProcessing = false;

    // Process next job
    setImmediate(processNextJob);
  }
}

// ============================================
// Default Job Handlers
// ============================================

// Large CSV Import Handler
registerJobHandler(JOB_TYPES.LARGE_CSV_IMPORT, async (payload, onProgress) => {
  const { rows, sessionId, options = {} } = payload;
  const total = rows.length;
  let processed = 0;
  let created = 0;
  let updated = 0;
  const errors = [];

  for (const row of rows) {
    try {
      // Simulate processing (replace with actual import logic)
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // TODO: Actual product import logic here
      created++;
      processed++;

      // Update progress every 100 rows
      if (processed % 100 === 0) {
        onProgress(Math.round((processed / total) * 100));
      }
    } catch (e) {
      errors.push({ row: processed, error: e.message });
    }
  }

  return { created, updated, total: processed, errors };
});

// Bulk Label Generation Handler
registerJobHandler(JOB_TYPES.BULK_LABEL_GENERATION, async (payload, onProgress) => {
  const { productIds, templateId, profileId } = payload;
  const total = productIds.length;
  let processed = 0;
  const zplCodes = [];

  for (const productId of productIds) {
    try {
      // TODO: Actual ZPL generation logic
      await new Promise(resolve => setTimeout(resolve, 5));
      zplCodes.push({ productId, zpl: `^XA^FO50,50^FD${productId}^FS^XZ` });
      processed++;

      if (processed % 50 === 0) {
        onProgress(Math.round((processed / total) * 100));
      }
    } catch (e) {
      console.error(`Error generating label for ${productId}:`, e.message);
    }
  }

  return { generated: zplCodes.length, total: processed, zplCodes };
});

// Database Maintenance Handler
registerJobHandler(JOB_TYPES.DATABASE_MAINTENANCE, async (payload, onProgress) => {
  const maintenance = require('./maintenance');
  
  onProgress(10);
  const sessionsDeleted = maintenance.cleanupOldSessions();
  
  onProgress(30);
  const failedDeleted = maintenance.cleanupFailedUploads();
  
  onProgress(50);
  const aiLogsDeleted = maintenance.cleanupAIUsageLogs();
  
  onProgress(70);
  maintenance.vacuumDatabase();
  
  onProgress(90);
  maintenance.analyzeDatabase();
  
  return { sessionsDeleted, failedDeleted, aiLogsDeleted };
});

// ============================================
// Worker Thread Support (for CPU-intensive tasks)
// ============================================

/**
 * Run a job in a worker thread
 * @param {string} workerScript - Path to worker script
 * @param {Object} data - Data to pass to worker
 * @returns {Promise} - Worker result
 */
function runInWorker(workerScript, data) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerScript, { workerData: data });

    worker.on('message', (message) => {
      if (message.type === 'progress') {
        // Emit progress event
      } else if (message.type === 'complete') {
        resolve(message.result);
      }
    });

    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}

// ============================================
// API Endpoints Helper
// ============================================

/**
 * Express router setup for background jobs
 */
function setupJobRoutes(app) {
  // List jobs
  app.get('/api/background-jobs', (req, res) => {
    try {
      const { status, type, limit } = req.query;
      const jobs = getJobs({ status, type, limit: parseInt(limit) || 50 });
      res.json({ success: true, jobs });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get job status
  app.get('/api/background-jobs/:id', (req, res) => {
    try {
      const status = getJobStatus(req.params.id);
      if (!status) {
        return res.status(404).json({ success: false, error: 'Job not found' });
      }
      res.json({ success: true, job: status });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Create job
  app.post('/api/background-jobs', (req, res) => {
    try {
      const { type, payload, priority } = req.body;
      if (!type) {
        return res.status(400).json({ success: false, error: 'Job type required' });
      }
      const jobId = enqueueJob(type, payload, priority);
      res.json({ success: true, jobId });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Cancel job
  app.post('/api/background-jobs/:id/cancel', (req, res) => {
    try {
      const success = cancelJob(req.params.id);
      res.json({ success });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Pause job
  app.post('/api/background-jobs/:id/pause', (req, res) => {
    try {
      const success = pauseJob(req.params.id);
      res.json({ success });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Resume job
  app.post('/api/background-jobs/:id/resume', (req, res) => {
    try {
      const success = resumeJob(req.params.id);
      res.json({ success });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
}

// ============================================
// Exports
// ============================================

module.exports = {
  // Job types
  JOB_TYPES,
  JOB_STATUS,
  JOB_PRIORITIES,
  // Queue management
  enqueueJob,
  getJobStatus,
  getJobs,
  updateJobProgress,
  cancelJob,
  pauseJob,
  resumeJob,
  cleanupOldJobs,
  // Processing
  registerJobHandler,
  processNextJob,
  // Worker
  runInWorker,
  // Routes
  setupJobRoutes,
};
