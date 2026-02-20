// Gateway configuration routes

const express = require('express');
const { z } = require('zod');
const { getTenantId } = require('../middleware');
const { gatewayService } = require('../services');

const router = express.Router();

// Validation schemas
const GatewayCreateSchema = z.object({
  provider: z.string().min(1),
  display_name: z.string().min(1),
  credentials: z.record(z.unknown()).optional().default({}),
  is_active: z.boolean().optional().default(true),
  is_default: z.boolean().optional().default(false),
  supported_methods: z.array(z.string()).optional().default(['card'])
});

const GatewayUpdateSchema = z.object({
  provider: z.string().min(1).optional(),
  display_name: z.string().min(1).optional(),
  credentials: z.record(z.unknown()).optional(),
  is_active: z.boolean().optional(),
  is_default: z.boolean().optional(),
  supported_methods: z.array(z.string()).optional()
});

// List gateway configs
router.get('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { active_only } = req.query;
    const gateways = await gatewayService.listGateways(tenantId, { active_only });
    res.json({ success: true, data: gateways });
  } catch (error) {
    next(error);
  }
});

// Get single gateway
router.get('/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const gateway = await gatewayService.getGateway(req.params.id, tenantId);
    if (!gateway) {
      return res.status(404).json({ success: false, error: { code: 'GATEWAY_NOT_FOUND', message: 'Gateway configuration not found' } });
    }
    res.json({ success: true, data: gateway });
  } catch (error) {
    next(error);
  }
});

// Create gateway
router.post('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = GatewayCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parsed.error.issues } });
    }
    const gateway = await gatewayService.createGateway(tenantId, parsed.data);
    res.status(201).json({ success: true, data: gateway });
  } catch (error) {
    next(error);
  }
});

// Update gateway
router.put('/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = GatewayUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parsed.error.issues } });
    }
    const gateway = await gatewayService.updateGateway(req.params.id, tenantId, parsed.data);
    if (!gateway) {
      return res.status(404).json({ success: false, error: { code: 'GATEWAY_NOT_FOUND', message: 'Gateway configuration not found' } });
    }
    res.json({ success: true, data: gateway });
  } catch (error) {
    next(error);
  }
});

// Delete gateway
router.delete('/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const deleted = await gatewayService.deleteGateway(req.params.id, tenantId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: { code: 'GATEWAY_NOT_FOUND', message: 'Gateway configuration not found' } });
    }
    res.json({ success: true, data: { message: 'Gateway deleted' } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
