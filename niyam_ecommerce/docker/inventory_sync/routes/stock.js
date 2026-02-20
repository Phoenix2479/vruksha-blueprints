// Stock routes

const express = require('express');
const { z } = require('zod');
const { getTenantId } = require('../middleware');
const { stockService } = require('../services');

const router = express.Router();

// Validation schemas
const UpdateQuantitySchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().optional(),
  location: z.string().optional(),
  quantity: z.number().int().min(0),
  low_stock_threshold: z.number().int().min(0).optional()
});

const BulkUpdateSchema = z.object({
  items: z.array(z.object({
    product_id: z.string().uuid(),
    variant_id: z.string().uuid().optional(),
    location: z.string().optional(),
    quantity: z.number().int().min(0),
    low_stock_threshold: z.number().int().min(0).optional()
  })).min(1)
});

// Get stock levels by product
router.get('/:product_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { variant_id } = req.query;
    const stock = await stockService.getStockByProduct(tenantId, req.params.product_id, variant_id);
    res.json({ success: true, data: stock });
  } catch (error) {
    next(error);
  }
});

// Update stock quantity
router.put('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = UpdateQuantitySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }
    const record = await stockService.updateQuantity(tenantId, parsed.data);
    res.json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
});

// Bulk update stock quantities
router.put('/bulk', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = BulkUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }
    const results = await stockService.bulkUpdate(tenantId, parsed.data.items);
    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
