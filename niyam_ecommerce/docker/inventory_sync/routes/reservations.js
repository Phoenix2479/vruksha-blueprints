// Reservation routes

const express = require('express');
const { z } = require('zod');
const { getTenantId } = require('../middleware');
const { reservationService } = require('../services');

const router = express.Router();

// Validation schemas
const ReserveSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().optional(),
  order_id: z.string().uuid().optional(),
  location: z.string().optional(),
  quantity: z.number().int().min(1),
  expires_at: z.string().datetime().optional(),
  notes: z.string().optional()
});

// List active reservations
router.get('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { product_id } = req.query;
    const reservations = await reservationService.listActive(tenantId, product_id);
    res.json({ success: true, data: reservations });
  } catch (error) {
    next(error);
  }
});

// Reserve stock
router.post('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = ReserveSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }
    const result = await reservationService.reserve(tenantId, parsed.data);
    if (!result.success) {
      return res.status(400).json({ success: false, error: { code: 'RESERVATION_ERROR', message: result.error } });
    }
    res.status(201).json({ success: true, data: result.reservation });
  } catch (error) {
    next(error);
  }
});

// Release reservation
router.post('/:id/release', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const result = await reservationService.release(tenantId, req.params.id);
    if (!result.success) {
      return res.status(400).json({ success: false, error: { code: 'RELEASE_ERROR', message: result.error } });
    }
    res.json({ success: true, data: { message: result.message } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
