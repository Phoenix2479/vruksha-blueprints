// Tracking event routes

const express = require('express');
const { z } = require('zod');
const { getTenantId } = require('../middleware');
const { trackingService } = require('../services');

const router = express.Router();

// Validation schemas
const AddEventSchema = z.object({
  shipment_id: z.string().uuid(),
  status: z.string().min(1),
  location: z.string().optional(),
  description: z.string().optional(),
  occurred_at: z.string().datetime().optional()
});

// Get tracking timeline for a shipment
router.get('/shipment/:shipment_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const events = await trackingService.getTimeline(tenantId, req.params.shipment_id);
    res.json({ success: true, data: events });
  } catch (error) {
    next(error);
  }
});

// Get tracking info by tracking number
router.get('/number/:tracking_number', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const result = await trackingService.getByTracking(tenantId, req.params.tracking_number);
    if (!result) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tracking number not found' } });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Add tracking event
router.post('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = AddEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }
    const result = await trackingService.addEvent(tenantId, parsed.data);
    if (!result.success) {
      return res.status(400).json({ success: false, error: { code: 'TRACKING_ERROR', message: result.error } });
    }
    res.status(201).json({ success: true, data: result.event });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
