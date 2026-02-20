// Fulfillment routes

const express = require('express');
const { z } = require('zod');
const { getTenantId } = require('../middleware');
const { fulfillmentService } = require('../services');

const router = express.Router();

// Validation schemas
const CreateFulfillmentSchema = z.object({
  order_id: z.string().uuid(),
  tracking_number: z.string().optional(),
  carrier: z.string().optional(),
  items: z.array(z.object({
    product_id: z.string().uuid().optional(),
    sku: z.string().optional(),
    name: z.string().optional(),
    quantity: z.number().int().min(1).default(1)
  })).optional(),
  notes: z.string().optional()
});

const UpdateFulfillmentStatusSchema = z.object({
  status: z.enum(['pending', 'shipped', 'in_transit', 'delivered', 'cancelled'])
});

// List fulfillments for an order
router.get('/order/:order_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const fulfillments = await fulfillmentService.listFulfillments(tenantId, req.params.order_id);
    res.json({ success: true, data: fulfillments });
  } catch (error) {
    next(error);
  }
});

// Create fulfillment
router.post('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = CreateFulfillmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }
    const result = await fulfillmentService.createFulfillment(tenantId, parsed.data);
    if (!result.success) {
      return res.status(400).json({ success: false, error: { code: 'FULFILLMENT_ERROR', message: result.error } });
    }
    res.status(201).json({ success: true, data: result.fulfillment });
  } catch (error) {
    next(error);
  }
});

// Update fulfillment status
router.patch('/:id/status', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = UpdateFulfillmentStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }
    const result = await fulfillmentService.updateFulfillmentStatus(tenantId, req.params.id, parsed.data.status);
    if (!result.success) {
      return res.status(400).json({ success: false, error: { code: 'STATUS_ERROR', message: result.error } });
    }
    res.json({ success: true, data: result.fulfillment });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
