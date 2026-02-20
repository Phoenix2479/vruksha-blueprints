// Recovery routes

const express = require('express');
const { z } = require('zod');
const { getTenantId } = require('../middleware');
const { recoveryService } = require('../services');

const router = express.Router();

// Validation schemas
const TriggerRecoverySchema = z.object({
  abandoned_cart_id: z.string().uuid(),
  template_id: z.string().uuid().optional()
});

const TrackAttemptSchema = z.object({
  action: z.enum(['opened', 'clicked', 'converted'])
});

// Trigger recovery for an abandoned cart
router.post('/trigger', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = TriggerRecoverySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parsed.error.issues } });
    }
    const result = await recoveryService.triggerRecovery(tenantId, parsed.data);
    if (result.error) {
      return res.status(result.status).json({ success: false, error: { code: 'RECOVERY_FAILED', message: result.error } });
    }
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Track recovery attempt status (opened, clicked, converted)
router.post('/attempts/:id/track', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = TrackAttemptSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parsed.error.issues } });
    }
    const result = await recoveryService.trackAttempt(req.params.id, tenantId, parsed.data.action);
    if (result.error) {
      return res.status(result.status).json({ success: false, error: { code: 'TRACK_FAILED', message: result.error } });
    }
    res.json({ success: true, data: result.attempt });
  } catch (error) {
    next(error);
  }
});

// List recovery attempts for an abandoned cart
router.get('/attempts/:abandoned_cart_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const attempts = await recoveryService.listAttempts(req.params.abandoned_cart_id, tenantId);
    res.json({ success: true, data: attempts });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
