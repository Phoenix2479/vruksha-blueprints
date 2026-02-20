// Abandoned cart routes

const express = require('express');
const { z } = require('zod');
const { getTenantId } = require('../middleware');
const { abandonedCartService } = require('../services');

const router = express.Router();

// Validation schemas
const CreateAbandonedCartSchema = z.object({
  cart_id: z.string().uuid(),
  customer_id: z.string().uuid().optional(),
  customer_email: z.string().email().optional(),
  cart_total: z.number().nonnegative().optional().default(0),
  items_count: z.number().int().nonnegative().optional().default(0),
  cart_items: z.array(z.record(z.unknown())).optional().default([]),
  abandoned_at: z.string().optional()
});

const MarkRecoveredSchema = z.object({
  order_id: z.string().uuid()
});

// List abandoned carts
router.get('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { status, customer_id, from_date, to_date, min_total, limit, offset } = req.query;
    const carts = await abandonedCartService.listAbandonedCarts(tenantId, {
      status, customer_id, from_date, to_date, min_total, limit, offset
    });
    res.json({ success: true, data: carts });
  } catch (error) {
    next(error);
  }
});

// Get abandoned cart stats
router.get('/stats', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { from_date, to_date } = req.query;
    const stats = await abandonedCartService.getStats(tenantId, { from_date, to_date });
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

// Get single abandoned cart
router.get('/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const cart = await abandonedCartService.getAbandonedCart(req.params.id, tenantId);
    if (!cart) {
      return res.status(404).json({ success: false, error: { code: 'CART_NOT_FOUND', message: 'Abandoned cart not found' } });
    }
    res.json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
});

// Create abandoned cart record
router.post('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = CreateAbandonedCartSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parsed.error.issues } });
    }
    const cart = await abandonedCartService.createAbandonedCart(tenantId, parsed.data);
    res.status(201).json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
});

// Mark abandoned cart as recovered
router.post('/:id/recovered', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = MarkRecoveredSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parsed.error.issues } });
    }
    const cart = await abandonedCartService.markRecovered(req.params.id, tenantId, parsed.data.order_id);
    if (!cart) {
      return res.status(404).json({ success: false, error: { code: 'CART_NOT_FOUND', message: 'Abandoned cart not found' } });
    }
    res.json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
