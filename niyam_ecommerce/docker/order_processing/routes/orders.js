// Order routes

const express = require('express');
const { z } = require('zod');
const { getTenantId } = require('../middleware');
const { orderService } = require('../services');

const router = express.Router();

// Validation schemas
const CreateOrderSchema = z.object({
  customer_id: z.string().uuid().optional(),
  items: z.array(z.object({
    product_id: z.string().uuid().optional(),
    variant_id: z.string().uuid().optional(),
    sku: z.string().optional(),
    name: z.string().min(1),
    quantity: z.number().int().min(1).default(1),
    unit_price: z.number().min(0),
    metadata: z.record(z.any()).optional()
  })).min(1),
  discount: z.number().min(0).optional(),
  shipping_cost: z.number().min(0).optional(),
  tax: z.number().min(0).optional(),
  shipping_address: z.record(z.any()).optional(),
  billing_address: z.record(z.any()).optional(),
  notes: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

const UpdateStatusSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'])
});

// List orders with optional filters
router.get('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { status, customer_id, payment_status, fulfillment_status, limit, offset } = req.query;
    const orders = await orderService.listOrders(tenantId, {
      status, customer_id, payment_status, fulfillment_status, limit, offset
    });
    res.json({ success: true, data: orders });
  } catch (error) {
    next(error);
  }
});

// Get order by ID
router.get('/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const order = await orderService.getOrder(tenantId, req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
    }
    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
});

// Create order
router.post('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = CreateOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }
    const order = await orderService.createOrder(tenantId, parsed.data);
    res.status(201).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
});

// Update order status
router.patch('/:id/status', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = UpdateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }
    const result = await orderService.updateOrderStatus(tenantId, req.params.id, parsed.data.status);
    if (!result.success) {
      return res.status(400).json({ success: false, error: { code: 'STATUS_ERROR', message: result.error } });
    }
    res.json({ success: true, data: result.order });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
