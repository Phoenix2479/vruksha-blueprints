// Recovery template routes

const express = require('express');
const { z } = require('zod');
const { getTenantId } = require('../middleware');
const { recoveryService } = require('../services');

const router = express.Router();

// Validation schemas
const TemplateCreateSchema = z.object({
  name: z.string().min(1),
  channel: z.enum(['email', 'sms', 'push']).optional().default('email'),
  subject: z.string().optional().default(''),
  body: z.string().optional().default(''),
  delay_hours: z.number().int().nonnegative().optional().default(1),
  is_active: z.boolean().optional().default(true)
});

const TemplateUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  channel: z.enum(['email', 'sms', 'push']).optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
  delay_hours: z.number().int().nonnegative().optional(),
  is_active: z.boolean().optional()
});

// List templates
router.get('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { active_only } = req.query;
    const templates = await recoveryService.listTemplates(tenantId, { active_only });
    res.json({ success: true, data: templates });
  } catch (error) {
    next(error);
  }
});

// Get single template
router.get('/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const template = await recoveryService.getTemplate(req.params.id, tenantId);
    if (!template) {
      return res.status(404).json({ success: false, error: { code: 'TEMPLATE_NOT_FOUND', message: 'Recovery template not found' } });
    }
    res.json({ success: true, data: template });
  } catch (error) {
    next(error);
  }
});

// Create template
router.post('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = TemplateCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parsed.error.issues } });
    }
    const template = await recoveryService.createTemplate(tenantId, parsed.data);
    res.status(201).json({ success: true, data: template });
  } catch (error) {
    next(error);
  }
});

// Update template
router.put('/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = TemplateUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parsed.error.issues } });
    }
    const template = await recoveryService.updateTemplate(req.params.id, tenantId, parsed.data);
    if (!template) {
      return res.status(404).json({ success: false, error: { code: 'TEMPLATE_NOT_FOUND', message: 'Recovery template not found' } });
    }
    res.json({ success: true, data: template });
  } catch (error) {
    next(error);
  }
});

// Delete template
router.delete('/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const deleted = await recoveryService.deleteTemplate(req.params.id, tenantId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: { code: 'TEMPLATE_NOT_FOUND', message: 'Recovery template not found' } });
    }
    res.json({ success: true, data: { message: 'Template deleted' } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
