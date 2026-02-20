// Import routes

const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { z } = require('zod');
const { getTenantId, requireAnyRole } = require('../middleware');
const { importService } = require('../services');

const router = express.Router();
const upload = multer({ dest: path.join(importService.UPLOAD_DIR, 'tmp') });

// Validation schema
const ImportCommitSchema = z.object({
  strategy: z.enum(['create', 'upsert']).optional(),
  default_tax: z.number().optional(),
  default_category: z.string().optional().nullable(),
  import_notes: z.string().optional(),
  rows: z.array(z.any()).optional(),
});

// Start an import session
router.post('/sessions', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const session_id = await importService.createSession(tenantId);
    res.json({ success: true, session_id });
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

module.exports = router;
