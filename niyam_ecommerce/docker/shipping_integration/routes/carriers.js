// Carrier routes

const express = require('express');
const { z } = require('zod');
const { getTenantId } = require('../middleware');
const { carrierService } = require('../services');

const router = express.Router();

// Validation schemas
const CreateCarrierSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1).max(50),
  is_active: z.boolean().optional(),
  config: z.record(z.any()).optional(),
  base_rate: z.number().min(0).optional(),
  per_kg_rate: z.number().min(0).optional()
});

const UpdateCarrierSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).max(50).optional(),
  is_active: z.boolean().optional(),
  config: z.record(z.any()).optional(),
  base_rate: z.number().min(0).optional(),
  per_kg_rate: z.number().min(0).optional()
});

// List carriers
router.get('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const activeOnly = req.query.active === 'true';
    const carriers = await carrierService.listCarriers(tenantId, activeOnly);
    res.json({ success: true, data: carriers });
  } catch (error) {
    next(error);
  }
});

// Get carrier by ID
router.get('/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const carrier = await carrierService.getCarrier(tenantId, req.params.id);
    if (!carrier) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Carrier not found' } });
    }
    res.json({ success: true, data: carrier });
  } catch (error) {
    next(error);
  }
});

// Create carrier
router.post('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = CreateCarrierSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }
    const carrier = await carrierService.createCarrier(tenantId, parsed.data);
    res.status(201).json({ success: true, data: carrier });
  } catch (error) {
    next(error);
  }
});

// Update carrier
router.put('/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = UpdateCarrierSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }
    const result = await carrierService.updateCarrier(tenantId, req.params.id, parsed.data);
    if (!result.success) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: result.error } });
    }
    res.json({ success: true, data: result.carrier });
  } catch (error) {
    next(error);
  }
});

// Delete carrier
router.delete('/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const result = await carrierService.deleteCarrier(tenantId, req.params.id);
    if (!result.success) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: result.error } });
    }
    res.json({ success: true, data: { message: result.message } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
