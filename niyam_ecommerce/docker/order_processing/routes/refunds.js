// Refund routes

const express = require('express');
const { z } = require('zod');
const { getTenantId } = require('../middleware');
const { refundService } = require('../services');

const router = express.Router();

// Validation schemas
const CreateRefundSchema = z.object({
  order_id: z.string().uuid(),
  amount: z.number().positive(),
  reason: z.string().optional(),
  items: z.array(z.object({
    product_id: z.string().uuid().optional(),
    sku: z.string().optional(),
    name: z.string().optional(),
    quantity: z.number().int().min(1).default(1),
    unit_price: z.number().min(0).optional()
  })).optional(),
  notes: z.string().optional()
});

const UpdateRefundStatusSchema = z.object({
  status: z.enum(['pending', 'approved', 'processed', 'rejected'])
});

// List refunds for an order
router.get('/order/:order_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const refunds = await refundService.listRefunds(tenantId, req.params.order_id);
    res.json({ success: true, data: refunds });
  } catch (error) {
    next(error);
  }
});

// Create refund
router.post('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = CreateRefundSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }
    const result = await refundService.createRefund(tenantId, parsed.data);
    if (!result.success) {
      return res.status(400).json({ success: false, error: { code: 'REFUND_ERROR', message: result.error } });
    }
    res.status(201).json({ success: true, data: result.refund });
  } catch (error) {
    next(error);
  }
});

// Update refund status
router.patch('/:id/status', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = UpdateRefundStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }
    const result = await refundService.updateRefundStatus(tenantId, req.params.id, parsed.data.status);
    if (!result.success) {
      return res.status(400).json({ success: false, error: { code: 'STATUS_ERROR', message: result.error } });
    }
    res.json({ success: true, data: result.refund });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
