// Stock routes

const express = require('express');
const { z } = require('zod');
const { getTenantId, requireAnyRole } = require('../middleware');
const { stockService } = require('../services');

const router = express.Router();

// Validation schema
const StockAdjustSchema = z.object({
  product_id: z.string().uuid(),
  quantity_change: z.number().int(),
  reason: z.string().min(1),
  notes: z.string().optional(),
});

// Get stock for a product
router.get('/:product_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { product_id } = req.params;
    const stock = await stockService.getStock(product_id, tenantId);
    res.json({ success: true, stock });
  } catch (error) {
    next(error);
  }
});

// Adjust stock (manual adjustment)
router.post('/adjust', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = StockAdjustSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors });
    }

    const { product_id, quantity_change, reason } = parsed.data;
    if (!product_id || quantity_change == null || !reason) {
      return res.status(400).json({ error: 'product_id, quantity_change, and reason are required' });
    }

    const result = await stockService.adjustStock(tenantId, parsed.data);
    if (!result.success) {
      const status = result.error === 'Product not found' ? 404 : 400;
      return res.status(status).json({ error: result.error });
    }

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

// Stock history for a product
router.get('/:product_id/history', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { product_id } = req.params;
    const history = await stockService.getStockHistory(product_id, tenantId);
    res.json({ success: true, history });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
