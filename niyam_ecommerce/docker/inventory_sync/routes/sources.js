// Sync source routes

const express = require('express');
const { z } = require('zod');
const { getTenantId } = require('../middleware');
const { syncSourceService } = require('../services');

const router = express.Router();

// Validation schemas
const CreateSourceSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  config: z.record(z.any()).optional(),
  is_active: z.boolean().optional()
});

const UpdateSourceSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  config: z.record(z.any()).optional(),
  is_active: z.boolean().optional(),
  last_synced_at: z.string().datetime().optional()
});

// List sync sources
router.get('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const sources = await syncSourceService.listSources(tenantId);
    res.json({ success: true, data: sources });
  } catch (error) {
    next(error);
  }
});

// Get sync source by ID
router.get('/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const source = await syncSourceService.getSource(tenantId, req.params.id);
    if (!source) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Sync source not found' } });
    }
    res.json({ success: true, data: source });
  } catch (error) {
    next(error);
  }
});

// Create sync source
router.post('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = CreateSourceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }
    const source = await syncSourceService.createSource(tenantId, parsed.data);
    res.status(201).json({ success: true, data: source });
  } catch (error) {
    next(error);
  }
});

// Update sync source
router.put('/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = UpdateSourceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }
    const result = await syncSourceService.updateSource(tenantId, req.params.id, parsed.data);
    if (!result.success) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: result.error } });
    }
    res.json({ success: true, data: result.source });
  } catch (error) {
    next(error);
  }
});

// Delete sync source
router.delete('/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const result = await syncSourceService.deleteSource(tenantId, req.params.id);
    if (!result.success) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: result.error } });
    }
    res.json({ success: true, data: { message: result.message } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
