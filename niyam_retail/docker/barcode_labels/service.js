// Barcode & Label Designer Service
// Template management, product integration, and print job logging

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const promClient = require('prom-client');
const { z } = require('zod');
const { query } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');
const kvStore = require('@vruksha/platform/nats/kv_store');

const app = express();

const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

app.use(helmet({ contentSecurityPolicy: false }));
const DEFAULT_ALLOWED = ['http://localhost:10052', 'http://localhost:3001', 'http://localhost:5173', 'http://localhost:8880'];
const ALLOW_ALL = (process.env.ALLOW_ALL_CORS || 'true').toLowerCase() === 'true';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const ORIGIN_ALLOWLIST = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : DEFAULT_ALLOWED;
app.use(cors({
  origin: (origin, cb) => {
    if (ALLOW_ALL || !origin || ORIGIN_ALLOWLIST.includes(origin)) return cb(null, true);
    return cb(new Error('CORS not allowed'), false);
  },
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID']
}));

app.use(express.json({ limit: '10mb' }));

const started = Date.now();
let kvReady = false;
(async () => {
  try {
    await kvStore.connect();
    kvReady = true;
    console.log('✅ Barcode Labels: KV connected');
  } catch (e) {
    console.error('❌ Barcode Labels: KV connect failed', e.message);
  }
})();

// Observability
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });

const httpHistogram = new promClient.Histogram({
  name: 'barcode_labels_http_request_duration_seconds',
  help: 'HTTP duration',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});
registry.registerMetric(httpHistogram);

// Custom metrics
const templatesGauge = new promClient.Gauge({
  name: 'barcode_labels_templates_total',
  help: 'Total templates',
  labelNames: ['tenant_id']
});
registry.registerMetric(templatesGauge);

const printJobsCounter = new promClient.Counter({
  name: 'barcode_labels_print_jobs_total',
  help: 'Total print jobs',
  labelNames: ['tenant_id', 'status']
});
registry.registerMetric(printJobsCounter);

const labelsPrintedCounter = new promClient.Counter({
  name: 'barcode_labels_labels_printed_total',
  help: 'Total labels printed',
  labelNames: ['tenant_id']
});
registry.registerMetric(labelsPrintedCounter);

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

function getTenantId(req) {
  const t = req.headers['x-tenant-id'];
  return (typeof t === 'string' && t.trim()) ? t.trim() : DEFAULT_TENANT_ID;
}

const SKIP_AUTH = (process.env.SKIP_AUTH || 'true').toLowerCase() === 'true';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

function authenticate(req, _res, next) {
  if (SKIP_AUTH) return next();
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return next();
  try {
    req.user = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  } catch (_) { }
  next();
}
app.use(authenticate);

// Template Categories
const TEMPLATE_CATEGORIES = ['general', 'product', 'shelf', 'shipping', 'jewelry', 'clothing'];

// Validation Schemas
const LabelSizeSchema = z.object({
  id: z.string(),
  name: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  isCustom: z.boolean().optional()
});

const FontConfigSchema = z.object({
  family: z.string(),
  size: z.number().positive(),
  bold: z.boolean(),
  italic: z.boolean()
});

const LabelElementSchema = z.object({
  id: z.string(),
  type: z.enum(['barcode', 'productName', 'price', 'mrp', 'sku', 'batchNo', 'expiryDate', 'weight', 'customText']),
  enabled: z.boolean(),
  order: z.number().int().min(0),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  value: z.string().optional(),
  font: FontConfigSchema.optional(),
  barcodeType: z.enum(['code128', 'ean13', 'ean8', 'upca', 'qrcode']).optional(),
  currencySymbol: z.string().optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional()
});

const LabelTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  category: z.enum(['general', 'product', 'shelf', 'shipping', 'jewelry', 'clothing']).optional(),
  size: LabelSizeSchema,
  elements: z.array(LabelElementSchema),
  backgroundSvg: z.string().optional()
});

const PrintJobSchema = z.object({
  template_id: z.string().uuid(),
  product_ids: z.array(z.string()),
  copies_per_product: z.number().int().min(1).max(100)
});

const PrintJobStatusSchema = z.object({
  status: z.enum(['pending', 'printing', 'completed', 'failed']),
  error_message: z.string().optional()
});

// Database initialization
async function initDatabase() {
  try {
    // Create label_templates table with new columns
    await query(`
      CREATE TABLE IF NOT EXISTS label_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        category VARCHAR(50) DEFAULT 'general',
        size JSONB NOT NULL,
        elements JSONB NOT NULL,
        background_svg TEXT,
        is_favorite BOOLEAN DEFAULT false,
        usage_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_by UUID,
        UNIQUE(tenant_id, name)
      )
    `, []);

    // Add new columns if they don't exist (for existing installations)
    await query(`
      DO $$ BEGIN
        ALTER TABLE label_templates ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'general';
        ALTER TABLE label_templates ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false;
        ALTER TABLE label_templates ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `, []);

    // Create print_jobs table with status
    await query(`
      CREATE TABLE IF NOT EXISTS print_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        template_id UUID REFERENCES label_templates(id) ON DELETE SET NULL,
        product_ids JSONB NOT NULL,
        copies_per_product INTEGER NOT NULL,
        total_labels_printed INTEGER NOT NULL,
        status VARCHAR(20) DEFAULT 'completed',
        error_message TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        created_by UUID
      )
    `, []);

    // Add status column if it doesn't exist
    await query(`
      DO $$ BEGIN
        ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'completed';
        ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS error_message TEXT;
        ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `, []);

    // Create indexes for performance
    await query(`
      CREATE INDEX IF NOT EXISTS idx_templates_tenant ON label_templates(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_templates_category ON label_templates(tenant_id, category);
      CREATE INDEX IF NOT EXISTS idx_templates_favorite ON label_templates(tenant_id, is_favorite) WHERE is_favorite = true;
      CREATE INDEX IF NOT EXISTS idx_print_jobs_tenant_date ON print_jobs(tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_print_jobs_template ON print_jobs(template_id);
      CREATE INDEX IF NOT EXISTS idx_print_jobs_status ON print_jobs(tenant_id, status);
    `, []);

    console.log('✅ Barcode Labels: Database tables initialized');
  } catch (e) {
    console.error('❌ Barcode Labels: Database init failed', e.message);
  }
}

initDatabase();

// Health endpoints
app.get('/healthz', (req, res) => res.json({ success: true }));
app.get('/readyz', (req, res) => res.json({ success: true, ready: kvReady }));
app.get('/status', (req, res) => res.json({
  success: true,
  service: 'barcode_labels',
  port: PORT,
  ready: kvReady,
  uptime: Math.floor((Date.now() - started) / 1000)
}));

// Get template categories
app.get('/api/categories', (req, res) => {
  res.json({ success: true, categories: TEMPLATE_CATEGORIES });
});

// Get products for labeling
app.get('/api/products', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { search, category, limit = 100 } = req.query;

    let sql = `
      SELECT
        id, sku, name, category, price,
        COALESCE(mrp, 0) as mrp,
        batch_number as "batchNo",
        expiry_date as "expiryDate",
        weight,
        barcode
      FROM products
      WHERE tenant_id = $1
    `;
    const params = [tenantId];

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      sql += ` AND (LOWER(name) LIKE $${params.length} OR LOWER(sku) LIKE $${params.length} OR barcode LIKE $${params.length})`;
    }

    if (category) {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }

    sql += ` ORDER BY created_at DESC LIMIT ${Math.min(parseInt(limit) || 100, 500)}`;

    const r = await query(sql, params);
    res.json({ success: true, products: r.rows });
  } catch (e) {
    next(e);
  }
});

// Get all label templates
app.get('/api/templates', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { category, favorites_only, sort = 'updated_at' } = req.query;

    let sql = `
      SELECT id, name, description, category, size, elements, background_svg as "backgroundSvg",
             is_favorite as "isFavorite", usage_count as "usageCount",
             created_at as "createdAt", updated_at as "updatedAt"
      FROM label_templates
      WHERE tenant_id = $1
    `;
    const params = [tenantId];

    if (category && TEMPLATE_CATEGORIES.includes(category)) {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }

    if (favorites_only === 'true') {
      sql += ` AND is_favorite = true`;
    }

    // Sorting
    const sortOptions = {
      'updated_at': 'updated_at DESC',
      'created_at': 'created_at DESC',
      'name': 'name ASC',
      'usage': 'usage_count DESC'
    };
    sql += ` ORDER BY ${sortOptions[sort] || sortOptions.updated_at}`;

    const r = await query(sql, params);
    res.json({ success: true, templates: r.rows });
  } catch (e) {
    next(e);
  }
});

// Get single template
app.get('/api/templates/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    const r = await query(`
      SELECT id, name, description, category, size, elements, background_svg as "backgroundSvg",
             is_favorite as "isFavorite", usage_count as "usageCount",
             created_at as "createdAt", updated_at as "updatedAt"
      FROM label_templates
      WHERE tenant_id = $1 AND id = $2
    `, [tenantId, id]);

    if (r.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Template not found' } });
    }

    res.json({ success: true, template: r.rows[0] });
  } catch (e) {
    next(e);
  }
});

// Export template as JSON
app.get('/api/templates/:id/export', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    const r = await query(`
      SELECT name, description, category, size, elements, background_svg as "backgroundSvg"
      FROM label_templates
      WHERE tenant_id = $1 AND id = $2
    `, [tenantId, id]);

    if (r.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Template not found' } });
    }

    const template = r.rows[0];
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      template: {
        name: template.name,
        description: template.description,
        category: template.category,
        size: template.size,
        elements: template.elements,
        backgroundSvg: template.backgroundSvg
      }
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${template.name.replace(/[^a-z0-9]/gi, '_')}_template.json"`);
    res.json(exportData);
  } catch (e) {
    next(e);
  }
});

// Import template from JSON
app.post('/api/templates/import', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { template, overwrite_name } = req.body;

    if (!template || !template.name || !template.size || !template.elements) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_IMPORT', message: 'Invalid template format' }
      });
    }

    // Use provided name or append (Imported)
    const name = overwrite_name || `${template.name} (Imported)`;

    const data = LabelTemplateSchema.parse({
      ...template,
      name
    });

    const r = await query(`
      INSERT INTO label_templates (tenant_id, name, description, category, size, elements, background_svg, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, name, description, category, size, elements, background_svg as "backgroundSvg",
                is_favorite as "isFavorite", usage_count as "usageCount",
                created_at as "createdAt", updated_at as "updatedAt"
    `, [
      tenantId,
      data.name,
      data.description || null,
      data.category || 'general',
      JSON.stringify(data.size),
      JSON.stringify(data.elements),
      data.backgroundSvg || null,
      req.user?.sub || null
    ]);

    res.status(201).json({ success: true, template: r.rows[0] });
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE_NAME', message: 'Template name already exists' }
      });
    }
    next(e);
  }
});

// Create new template
app.post('/api/templates', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const data = LabelTemplateSchema.parse(req.body);

    const r = await query(`
      INSERT INTO label_templates (tenant_id, name, description, category, size, elements, background_svg, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, name, description, category, size, elements, background_svg as "backgroundSvg",
                is_favorite as "isFavorite", usage_count as "usageCount",
                created_at as "createdAt", updated_at as "updatedAt"
    `, [
      tenantId,
      data.name,
      data.description || null,
      data.category || 'general',
      JSON.stringify(data.size),
      JSON.stringify(data.elements),
      data.backgroundSvg || null,
      req.user?.sub || null
    ]);

    const template = r.rows[0];

    // Update metrics
    templatesGauge.labels(tenantId).inc();

    // Publish event
    await publishEnvelope('labels.template.created.v1', {
      template_id: template.id,
      tenant_id: tenantId,
      name: template.name,
      category: template.category
    });

    res.status(201).json({ success: true, template });
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE_NAME', message: 'Template name already exists' }
      });
    }
    next(e);
  }
});

// Update template
app.put('/api/templates/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const data = LabelTemplateSchema.parse(req.body);

    const r = await query(`
      UPDATE label_templates
      SET name = $1, description = $2, category = $3, size = $4, elements = $5,
          background_svg = $6, updated_at = NOW()
      WHERE tenant_id = $7 AND id = $8
      RETURNING id, name, description, category, size, elements, background_svg as "backgroundSvg",
                is_favorite as "isFavorite", usage_count as "usageCount",
                created_at as "createdAt", updated_at as "updatedAt"
    `, [
      data.name,
      data.description || null,
      data.category || 'general',
      JSON.stringify(data.size),
      JSON.stringify(data.elements),
      data.backgroundSvg || null,
      tenantId,
      id
    ]);

    if (r.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Template not found' } });
    }

    const template = r.rows[0];

    // Publish event
    await publishEnvelope('labels.template.updated.v1', {
      template_id: template.id,
      tenant_id: tenantId,
      name: template.name,
      category: template.category
    });

    res.json({ success: true, template });
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE_NAME', message: 'Template name already exists' }
      });
    }
    next(e);
  }
});

// Toggle template favorite
app.patch('/api/templates/:id/favorite', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    const r = await query(`
      UPDATE label_templates
      SET is_favorite = NOT is_favorite, updated_at = NOW()
      WHERE tenant_id = $1 AND id = $2
      RETURNING id, is_favorite as "isFavorite"
    `, [tenantId, id]);

    if (r.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Template not found' } });
    }

    res.json({ success: true, isFavorite: r.rows[0].isFavorite });
  } catch (e) {
    next(e);
  }
});

// Delete template
app.delete('/api/templates/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    const r = await query(`
      DELETE FROM label_templates
      WHERE tenant_id = $1 AND id = $2
      RETURNING id
    `, [tenantId, id]);

    if (r.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Template not found' } });
    }

    // Update metrics
    templatesGauge.labels(tenantId).dec();

    res.json({ success: true, message: 'Template deleted' });
  } catch (e) {
    next(e);
  }
});

// Log print job
app.post('/api/print-jobs', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const data = PrintJobSchema.parse(req.body);

    const totalLabels = data.product_ids.length * data.copies_per_product;

    const r = await query(`
      INSERT INTO print_jobs (tenant_id, template_id, product_ids, copies_per_product, total_labels_printed, status, created_by)
      VALUES ($1, $2, $3, $4, $5, 'completed', $6)
      RETURNING id, status, created_at as "createdAt"
    `, [
      tenantId,
      data.template_id,
      JSON.stringify(data.product_ids),
      data.copies_per_product,
      totalLabels,
      req.user?.sub || null
    ]);

    const printJob = r.rows[0];

    // Increment template usage count
    await query(`
      UPDATE label_templates SET usage_count = usage_count + 1 WHERE id = $1
    `, [data.template_id]);

    // Update metrics
    printJobsCounter.labels(tenantId, 'completed').inc();
    labelsPrintedCounter.labels(tenantId).inc(totalLabels);

    // Publish event
    await publishEnvelope('labels.print_job.logged.v1', {
      print_job_id: printJob.id,
      tenant_id: tenantId,
      template_id: data.template_id,
      total_labels: totalLabels,
      status: 'completed'
    });

    res.status(201).json({ success: true, printJob: { ...printJob, totalLabels } });
  } catch (e) {
    next(e);
  }
});

// Update print job status
app.patch('/api/print-jobs/:id/status', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const data = PrintJobStatusSchema.parse(req.body);

    const r = await query(`
      UPDATE print_jobs
      SET status = $1, error_message = $2, completed_at = CASE WHEN $1 IN ('completed', 'failed') THEN NOW() ELSE completed_at END
      WHERE tenant_id = $3 AND id = $4
      RETURNING id, status, error_message as "errorMessage"
    `, [data.status, data.error_message || null, tenantId, id]);

    if (r.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Print job not found' } });
    }

    res.json({ success: true, printJob: r.rows[0] });
  } catch (e) {
    next(e);
  }
});

// Get print history
app.get('/api/print-jobs', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { limit = 50, status } = req.query;

    let sql = `
      SELECT
        pj.id, pj.template_id as "templateId", pj.product_ids as "productIds",
        pj.copies_per_product as "copiesPerProduct", pj.total_labels_printed as "totalLabels",
        pj.status, pj.error_message as "errorMessage",
        pj.created_at as "createdAt", pj.completed_at as "completedAt",
        t.name as "templateName"
      FROM print_jobs pj
      LEFT JOIN label_templates t ON t.id = pj.template_id AND t.tenant_id = pj.tenant_id
      WHERE pj.tenant_id = $1
    `;
    const params = [tenantId];

    if (status) {
      params.push(status);
      sql += ` AND pj.status = $${params.length}`;
    }

    sql += ` ORDER BY pj.created_at DESC LIMIT ${Math.min(parseInt(limit) || 50, 200)}`;

    const r = await query(sql, params);
    res.json({ success: true, printJobs: r.rows });
  } catch (e) {
    next(e);
  }
});

// Export print history as CSV
app.get('/api/print-jobs/export-csv', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { from, to } = req.query;

    let sql = `
      SELECT
        pj.id, pj.created_at, pj.status, pj.copies_per_product, pj.total_labels_printed,
        t.name as template_name,
        array_length(pj.product_ids::text[]::text[], 1) as product_count
      FROM print_jobs pj
      LEFT JOIN label_templates t ON t.id = pj.template_id
      WHERE pj.tenant_id = $1
    `;
    const params = [tenantId];

    if (from) {
      params.push(from);
      sql += ` AND pj.created_at >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      sql += ` AND pj.created_at <= $${params.length}`;
    }

    sql += ` ORDER BY pj.created_at DESC`;

    const r = await query(sql, params);

    // Generate CSV
    const headers = ['ID', 'Date', 'Template', 'Products', 'Copies/Product', 'Total Labels', 'Status'];
    const rows = r.rows.map(row => [
      row.id,
      new Date(row.created_at).toISOString(),
      row.template_name || 'Deleted',
      row.product_count || 0,
      row.copies_per_product,
      row.total_labels_printed,
      row.status
    ]);

    const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="print_history_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (e) {
    next(e);
  }
});

// Get print statistics
app.get('/api/stats', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);

    const [templates, printJobs, topTemplates] = await Promise.all([
      query(`SELECT COUNT(*) as count FROM label_templates WHERE tenant_id = $1`, [tenantId]),
      query(`
        SELECT 
          COUNT(*) as total_jobs,
          SUM(total_labels_printed) as total_labels,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as today_jobs,
          SUM(total_labels_printed) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as today_labels,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as week_jobs,
          COUNT(*) FILTER (WHERE status = 'completed') as completed_jobs,
          COUNT(*) FILTER (WHERE status = 'failed') as failed_jobs
        FROM print_jobs WHERE tenant_id = $1
      `, [tenantId]),
      query(`
        SELECT id, name, usage_count as "usageCount"
        FROM label_templates
        WHERE tenant_id = $1
        ORDER BY usage_count DESC
        LIMIT 5
      `, [tenantId])
    ]);

    res.json({
      success: true,
      stats: {
        templates: parseInt(templates.rows[0]?.count) || 0,
        totalJobs: parseInt(printJobs.rows[0]?.total_jobs) || 0,
        totalLabels: parseInt(printJobs.rows[0]?.total_labels) || 0,
        todayJobs: parseInt(printJobs.rows[0]?.today_jobs) || 0,
        todayLabels: parseInt(printJobs.rows[0]?.today_labels) || 0,
        weekJobs: parseInt(printJobs.rows[0]?.week_jobs) || 0,
        completedJobs: parseInt(printJobs.rows[0]?.completed_jobs) || 0,
        failedJobs: parseInt(printJobs.rows[0]?.failed_jobs) || 0,
        topTemplates: topTemplates.rows
      }
    });
  } catch (e) {
    next(e);
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);

  if (err.name === 'ZodError') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.errors
      }
    });
  }

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message
    }
  });
});

const PORT = process.env.PORT || 8880;
const path = require('path');
const fs = require('fs');

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
  console.log(`✅ Barcode Labels service running on port ${PORT}`);
});

module.exports = app;
