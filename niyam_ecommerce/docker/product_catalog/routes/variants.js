// Variant routes

const express = require('express');
const { z } = require('zod');
const { getTenantId, requireAnyRole } = require('../middleware');
const { variantService } = require('../services');

const router = express.Router();

// Validation schemas
const VariantCreateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  sku: z.string().optional().nullable(),
  price: z.number().finite().min(0),
  compare_at_price: z.number().finite().min(0).optional().nullable(),
  cost_price: z.number().finite().min(0).optional().nullable(),
  stock_quantity: z.number().int().min(0).default(0),
  low_stock_threshold: z.number().int().min(0).default(5),
  weight: z.number().finite().optional().nullable(),
  weight_unit: z.enum(['kg', 'g', 'lb', 'oz']).default('kg'),
  options: z.record(z.any()).default({}),
  image_url: z.string().url().optional().nullable(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().min(0).default(0)
});

const VariantUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  sku: z.string().optional().nullable(),
  price: z.number().finite().min(0).optional(),
  compare_at_price: z.number().finite().min(0).optional().nullable(),
  cost_price: z.number().finite().min(0).optional().nullable(),
  stock_quantity: z.number().int().min(0).optional(),
  low_stock_threshold: z.number().int().min(0).optional(),
  weight: z.number().finite().optional().nullable(),
  weight_unit: z.enum(['kg', 'g', 'lb', 'oz']).optional(),
  options: z.record(z.any()).optional(),
  image_url: z.string().url().optional().nullable(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional()
});

// List variants for a product
router.get('/:product_id/variants', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const variants = await variantService.listVariants(req.params.product_id, tenantId);
    res.json({ success: true, data: variants });
  } catch (error) {
    next(error);
  }
});

// Get single variant
router.get('/:product_id/variants/:variant_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const variant = await variantService.getVariant(req.params.variant_id, tenantId);
    if (!variant) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Variant not found' } });
    }
    res.json({ success: true, data: variant });
  } catch (error) {
    next(error);
  }
});

// Create variant for a product
router.post('/:product_id/variants', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = VariantCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }

    const variant = await variantService.createVariant(req.params.product_id, tenantId, parsed.data);
    if (!variant) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } });
    }
    res.status(201).json({ success: true, data: variant });
  } catch (error) {
    if (error && error.code === '23505') {
      return res.status(409).json({ success: false, error: { code: 'DUPLICATE', message: 'Variant with this SKU already exists' } });
    }
    next(error);
  }
});

// Update variant
router.patch('/:product_id/variants/:variant_id', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = VariantUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }

    const variant = await variantService.updateVariant(req.params.variant_id, tenantId, parsed.data);
    if (!variant) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Variant not found' } });
    }
    res.json({ success: true, data: variant });
  } catch (error) {
    next(error);
  }
});

// Delete variant
router.delete('/:product_id/variants/:variant_id', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const deleted = await variantService.deleteVariant(req.params.variant_id, tenantId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Variant not found' } });
    }
    res.json({ success: true, data: { message: 'Variant deleted' } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
