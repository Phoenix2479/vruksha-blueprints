// Wishlist routes

const express = require('express');
const { z } = require('zod');
const { getTenantId } = require('../middleware');
const { wishlistService } = require('../services');

const router = express.Router({ mergeParams: true });

// Validation schemas
const WishlistAddSchema = z.object({
  product_id: z.string().uuid()
});

// List wishlist for a customer
router.get('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { customer_id } = req.params;
    const items = await wishlistService.listWishlist(customer_id, tenantId);
    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
});

// Add product to wishlist
router.post('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { customer_id } = req.params;
    const parsed = WishlistAddSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'ERR_INVALID_PAYLOAD', message: 'Invalid payload', details: parsed.error.errors } });
    }

    const result = await wishlistService.addToWishlist(customer_id, tenantId, parsed.data.product_id);
    if (!result.success) {
      return res.status(409).json(result);
    }

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

// Remove product from wishlist
router.delete('/:product_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { customer_id, product_id } = req.params;
    const result = await wishlistService.removeFromWishlist(customer_id, tenantId, product_id);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
