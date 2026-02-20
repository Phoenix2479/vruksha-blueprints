// Coupon routes

const express = require('express');
const { z } = require('zod');
const { getTenantId } = require('../middleware');
const { couponService } = require('../services');

const router = express.Router();

// Validation schemas
const CouponCreateSchema = z.object({
  code: z.string().min(1).max(100),
  description: z.string().optional(),
  discount_type: z.enum(['percentage', 'fixed', 'free_shipping']).default('percentage'),
  discount_value: z.number().nonnegative(),
  min_order_amount: z.number().nonnegative().optional().default(0),
  max_discount_amount: z.number().positive().optional().nullable(),
  max_uses: z.number().int().positive().optional().nullable(),
  max_uses_per_customer: z.number().int().positive().optional().default(1),
  applicable_products: z.array(z.string()).optional().default([]),
  applicable_categories: z.array(z.string()).optional().default([]),
  is_active: z.boolean().optional().default(true),
  starts_at: z.string().optional().nullable(),
  expires_at: z.string().optional().nullable()
});

const CouponUpdateSchema = z.object({
  code: z.string().min(1).max(100).optional(),
  description: z.string().optional().nullable(),
  discount_type: z.enum(['percentage', 'fixed', 'free_shipping']).optional(),
  discount_value: z.number().nonnegative().optional(),
  min_order_amount: z.number().nonnegative().optional(),
  max_discount_amount: z.number().positive().optional().nullable(),
  max_uses: z.number().int().positive().optional().nullable(),
  max_uses_per_customer: z.number().int().positive().optional(),
  applicable_products: z.array(z.string()).optional(),
  applicable_categories: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
  starts_at: z.string().optional().nullable(),
  expires_at: z.string().optional().nullable()
});

const ValidateSchema = z.object({
  code: z.string().min(1),
  customer_id: z.string().uuid().optional(),
  order_amount: z.number().nonnegative().optional(),
  product_ids: z.array(z.string()).optional(),
  category_ids: z.array(z.string()).optional()
});

const ApplySchema = z.object({
  code: z.string().min(1),
  customer_id: z.string().uuid().optional(),
  order_id: z.string().uuid().optional(),
  order_amount: z.number().nonnegative(),
  product_ids: z.array(z.string()).optional(),
  category_ids: z.array(z.string()).optional()
});

// List coupons
router.get('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { active_only, search, limit, offset } = req.query;
    const coupons = await couponService.listCoupons(tenantId, { active_only, search, limit, offset });
    res.json({ success: true, data: coupons });
  } catch (error) {
    next(error);
  }
});

// Analytics endpoint
router.get('/analytics', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const analytics = await couponService.getAnalytics(tenantId);
    res.json({ success: true, data: analytics });
  } catch (error) {
    next(error);
  }
});

// Validate coupon code
router.post('/validate', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = ValidateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parsed.error.issues } });
    }
    const result = await couponService.validateCoupon(parsed.data.code, tenantId, parsed.data);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Apply coupon to order
router.post('/apply', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = ApplySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parsed.error.issues } });
    }
    const result = await couponService.applyCoupon(tenantId, parsed.data);
    if (!result.success) {
      return res.status(400).json({ success: false, error: { code: 'COUPON_INVALID', message: result.error } });
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get single coupon
router.get('/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const coupon = await couponService.getCoupon(req.params.id, tenantId);
    if (!coupon) {
      return res.status(404).json({ success: false, error: { code: 'COUPON_NOT_FOUND', message: 'Coupon not found' } });
    }
    res.json({ success: true, data: coupon });
  } catch (error) {
    next(error);
  }
});

// Get coupon usage history
router.get('/:id/usage', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { limit, offset } = req.query;
    const usage = await couponService.getCouponUsage(req.params.id, tenantId, { limit, offset });
    res.json({ success: true, data: usage });
  } catch (error) {
    next(error);
  }
});

// Create coupon
router.post('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = CouponCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parsed.error.issues } });
    }
    const coupon = await couponService.createCoupon(tenantId, parsed.data);
    res.status(201).json({ success: true, data: coupon });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, error: { code: 'DUPLICATE_CODE', message: 'A coupon with this code already exists' } });
    }
    next(error);
  }
});

// Update coupon
router.put('/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = CouponUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parsed.error.issues } });
    }
    const coupon = await couponService.updateCoupon(req.params.id, tenantId, parsed.data);
    if (!coupon) {
      return res.status(404).json({ success: false, error: { code: 'COUPON_NOT_FOUND', message: 'Coupon not found' } });
    }
    res.json({ success: true, data: coupon });
  } catch (error) {
    next(error);
  }
});

// Delete coupon
router.delete('/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const deleted = await couponService.deleteCoupon(req.params.id, tenantId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: { code: 'COUPON_NOT_FOUND', message: 'Coupon not found' } });
    }
    res.json({ success: true, data: { message: 'Coupon deleted' } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
