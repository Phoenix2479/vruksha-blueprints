// Rate calculation routes

const express = require('express');
const { z } = require('zod');
const { getTenantId } = require('../middleware');
const { rateService } = require('../services');

const router = express.Router();

// Validation schema
const CalculateRateSchema = z.object({
  weight: z.number().min(0),
  carrier_id: z.string().uuid().optional(),
  destination: z.string().optional(),
  dimensions: z.object({
    length: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    unit: z.string().optional()
  }).optional()
});

// Calculate shipping rate
router.post('/calculate', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = CalculateRateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }
    const rates = await rateService.calculateRate(tenantId, parsed.data);
    res.json({ success: true, data: rates });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
