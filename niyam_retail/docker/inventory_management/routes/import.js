// Import routes - Smart Inventory Import with Templates, Sessions & AI

const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { z } = require('zod');
const { getTenantId, getUserId, requireAnyRole } = require('../middleware');
const { importService } = require('../services');
const templateService = require('../services/templateService');
const sessionService = require('../services/sessionService');
const aiExtractor = require('../services/aiExtractor');

const router = express.Router();
const upload = multer({ dest: path.join(importService.UPLOAD_DIR, 'tmp') });

// Validation schemas
const ImportCommitSchema = z.object({
  strategy: z.enum(['create', 'upsert']).optional(),
  default_tax: z.number().optional(),
  default_category: z.string().optional().nullable(),
  import_notes: z.string().optional(),
  rows: z.array(z.any()).optional(),
});

const TemplateSchema = z.object({
  supplier_name: z.string().min(1),
  supplier_fingerprint: z.string().optional().nullable(),
  filename_pattern: z.string().optional().nullable(),
  header_pattern: z.array(z.string()).optional().nullable(),
  column_mapping: z.record(z.string()),
  default_values: z.record(z.any()).optional(),
  ai_prompt_template: z.string().optional().nullable(),
});

const AIExtractSchema = z.object({
  image_base64: z.string(),
  mime_type: z.string(),
  mode: z.enum(['local', 'cloud']),
  service: z.enum(['openai', 'anthropic']).optional(),
  api_key: z.string().optional(),
  model: z.string().optional(),
  session_id: z.string().uuid().optional().nullable(),
});

// Start an import session (handles both basic and persistent sessions)
// - If body is empty/minimal: basic import session (NATS KV only)
// - If body has data (source_type, mapped_data, etc.): persistent session (PostgreSQL)
router.post('/sessions', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const body = req.body || {};
    
    // Check if this is a persistent session request (has meaningful data)
    const isPersistent = body.source_type || body.mapped_data || body.raw_data || 
                         body.supplier_template_id || body.original_filename;
    
    if (isPersistent) {
      // Create persistent session in PostgreSQL
      const session = await sessionService.createSession(tenantId, body);
      res.status(201).json({ success: true, session_id: session.id, session });
    } else {
      // Create basic session in NATS KV (existing behavior)
      const session_id = await importService.createSession(tenantId);
      res.json({ success: true, session_id });
    }
  } catch (error) {
    next(error);
  }
});

// Upload file(s) for session
router.post('/:session_id/files', requireAnyRole(['admin', 'manager']), upload.array('files', 5), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { session_id } = req.params;
    const result = await importService.uploadFiles(tenantId, session_id, req.files);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

// Preview parsed/normalized rows
router.get('/:session_id/preview', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { session_id } = req.params;
    const data = await importService.getPreview(tenantId, session_id);

    if (!data) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
});

// Commit import: create products and stock
router.post('/:session_id/commit', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { session_id } = req.params;
    const parsed = ImportCommitSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors });
    }

    const result = await importService.commitImport(tenantId, session_id, parsed.data);
    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Download sample CSV template
router.get('/template', (req, res) => {
  const templatePath = path.join(__dirname, '..', 'storage', 'templates', 'sample_import.csv');
  if (fs.existsSync(templatePath)) {
    res.download(templatePath, 'product_import_template.csv');
  } else {
    // Generate inline template if file doesn't exist
    const csvContent = `name,sku,barcode,quantity,unit_price,category,description
"Wireless Earbuds Pro",,,,1499,Electronics,"Bluetooth 5.0 earbuds with noise cancellation"
"Cotton Polo Shirt",,,,899,Clothing,"Premium cotton polo in multiple colors"
"Stainless Steel Tumbler",,,,599,Home & Kitchen,"Double-wall insulated 500ml tumbler"
"Organic Green Tea 100g",TEA-GRN-001,8901234567890,50,249,Groceries,"Premium organic green tea leaves"`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="product_import_template.csv"');
    res.send(csvContent);
  }
});

// ============================================
// SUPPLIER TEMPLATES
// ============================================

// List all templates
router.get('/templates', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const templates = await templateService.getTemplates(tenantId);
    res.json({ success: true, templates });
  } catch (error) {
    next(error);
  }
});

// Match template by fingerprint/headers/filename
// IMPORTANT: This route MUST come BEFORE /templates/:id to avoid "match" being treated as an ID
router.get('/templates/match', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { fingerprint, filename } = req.query;
    let headers = req.query.headers;
    
    if (headers && typeof headers === 'string') {
      headers = headers.split(',').map(h => h.trim());
    }
    
    const match = await templateService.matchTemplate(tenantId, { fingerprint, headers, filename });
    
    if (!match) {
      return res.json({ success: true, matched: false, template: null });
    }
    
    res.json({ 
      success: true, 
      matched: true, 
      template: match.template,
      match_type: match.match_type,
      confidence: match.confidence
    });
  } catch (error) {
    next(error);
  }
});

// Get single template
router.get('/templates/:id', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const template = await templateService.getTemplate(tenantId, req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    res.json({ success: true, template });
  } catch (error) {
    next(error);
  }
});

// Create template
router.post('/templates', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = TemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid payload', details: parsed.error.errors });
    }
    
    const template = await templateService.createTemplate(tenantId, parsed.data);
    res.status(201).json({ success: true, template });
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ success: false, error: 'Template with this supplier name already exists' });
    }
    next(error);
  }
});

// Update template
router.put('/templates/:id', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const template = await templateService.updateTemplate(tenantId, req.params.id, req.body);
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    res.json({ success: true, template });
  } catch (error) {
    next(error);
  }
});

// Delete template
router.delete('/templates/:id', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const deleted = await templateService.deleteTemplate(tenantId, req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Record template use
router.post('/templates/:id/use', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const result = await templateService.recordTemplateUse(tenantId, req.params.id);
    if (!result) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    res.json({ success: true, use_count: result.use_count, last_used: result.last_used });
  } catch (error) {
    next(error);
  }
});

// ============================================
// PERSISTENT SESSIONS (PostgreSQL-backed)
// ============================================

// List sessions with expiry warnings
router.get('/sessions', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { status, limit, offset } = req.query;
    const result = await sessionService.getSessions(tenantId, { 
      status, 
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0
    });
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

// Get session stats
router.get('/sessions/stats', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const stats = await sessionService.getSessionStats(tenantId);
    res.json({ success: true, stats });
  } catch (error) {
    next(error);
  }
});

// Get expiring sessions warning
router.get('/sessions/expiring', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const days = req.query.days ? parseInt(req.query.days) : 7;
    const warnings = await sessionService.getExpiringSessionsWarning(tenantId, days);
    res.json({ success: true, expiring_soon: warnings, count: warnings.length });
  } catch (error) {
    next(error);
  }
});

// Get single session with full data
router.get('/sessions/:id', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const session = await sessionService.getSession(tenantId, req.params.id);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    res.json({ success: true, session });
  } catch (error) {
    next(error);
  }
});

// Note: POST /sessions now handles both basic and persistent sessions
// This /sessions/create is kept as an alias for backwards compatibility
router.post('/sessions/create', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const session = await sessionService.createSession(tenantId, req.body);
    res.status(201).json({ success: true, session_id: session.id, session });
  } catch (error) {
    next(error);
  }
});

// Update session
router.put('/sessions/:id', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const session = await sessionService.updateSession(tenantId, req.params.id, req.body);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    res.json({ success: true, session });
  } catch (error) {
    next(error);
  }
});

// Delete session
router.delete('/sessions/:id', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const deleted = await sessionService.deleteSession(tenantId, req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Commit persistent session (alias for existing endpoint pattern)
router.post('/sessions/:id/commit', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { session_id } = req.params;
    
    // Get session data
    const session = await sessionService.getSession(tenantId, req.params.id);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    // Commit using existing import service
    const parsed = ImportCommitSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors });
    }
    
    // Use session's mapped_data if rows not provided
    const commitData = {
      ...parsed.data,
      rows: parsed.data.rows || session.mapped_data
    };
    
    const result = await importService.commitImport(tenantId, req.params.id, commitData);
    
    if (result.success) {
      // Mark session as committed
      await sessionService.commitSession(tenantId, req.params.id, userId);
    }
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Cancel session
router.post('/sessions/:id/cancel', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const session = await sessionService.cancelSession(tenantId, req.params.id);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found or already committed' });
    }
    res.json({ success: true, session });
  } catch (error) {
    next(error);
  }
});

// Extend session expiry
router.post('/sessions/:id/extend', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const days = req.body.days || 30;
    const result = await sessionService.extendSessionExpiry(tenantId, req.params.id, days);
    if (!result) {
      return res.status(404).json({ success: false, error: 'Session not found or not pending' });
    }
    res.json({ success: true, id: result.id, new_expires_at: result.expires_at });
  } catch (error) {
    next(error);
  }
});

// ============================================
// AI EXTRACTION
// ============================================

// Extract inventory data from image using AI
router.post('/extract', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = AIExtractSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid payload', details: parsed.error.errors });
    }
    
    const { image_base64, mime_type, mode, service, api_key, model, session_id } = parsed.data;
    
    const result = await aiExtractor.extractInventoryData(
      image_base64,
      mime_type,
      mode,
      { service, apiKey: api_key, model },
      tenantId,
      session_id
    );
    
    res.json({ success: result.success, ...result });
  } catch (error) {
    next(error);
  }
});

// Get AI usage stats (both paths for compatibility)
router.get('/ai/usage', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const stats = await aiExtractor.getAIUsageStats(tenantId);
    res.json({ success: true, stats });
  } catch (error) {
    next(error);
  }
});

// Alias: /ai-usage for Lite compatibility (frontend may use this path)
router.get('/ai-usage', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const stats = await aiExtractor.getAIUsageStats(tenantId);
    res.json({ success: true, stats });
  } catch (error) {
    next(error);
  }
});

// ============================================
// ADMIN: Cleanup expired sessions
// ============================================

router.post('/admin/cleanup-expired', requireAnyRole(['admin']), async (req, res, next) => {
  try {
    const count = await sessionService.cleanupExpiredSessions();
    res.json({ success: true, expired_count: count });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
