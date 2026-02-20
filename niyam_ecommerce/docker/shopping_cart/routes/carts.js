// Cart routes

const express = require('express');
const { z } = require('zod');
const { getTenantId } = require('../middleware');
const { cartService } = require('../services');

const router = express.Router();

// Validation schemas
const CartCreateSchema = z.object({
  customer_id: z.string().uuid().optional().nullable(),
  session_id: z.string().max(255).optional().nullable(),
  currency: z.string().length(3).default('USD'),
  notes: z.string().optional().nullable(),
  metadata: z.record(z.any()).default({})
});

const AddItemSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().optional().nullable(),
  product_name: z.string().min(1),
  product_sku: z.string().optional().nullable(),
  product_image: z.string().optional().nullable(),
  quantity: z.number().int().min(1).default(1),
  unit_price: z.number().finite().min(0),
  tax_rate: z.number().finite().min(0).max(100).default(0),
  discount_amount: z.number().finite().min(0).default(0),
  options: z.record(z.any()).default({}),
  metadata: z.record(z.any()).default({})
});

const UpdateItemSchema = z.object({
  quantity: z.number().int().min(1)
});

const ApplyCouponSchema = z.object({
  coupon_code: z.string().min(1),
  discount_amount: z.number().finite().min(0)
});

// Create a new cart
router.post('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = CartCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }

    const cart = await cartService.createCart(tenantId, parsed.data);
    res.status(201).json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
});

// Get cart by ID
router.get('/:cart_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const cart = await cartService.getCart(req.params.cart_id, tenantId);
    if (!cart) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Cart not found' } });
    }
    res.json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
});

// Get cart by customer ID
router.get('/customer/:customer_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const cart = await cartService.getCartByCustomer(req.params.customer_id, tenantId);
    if (!cart) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'No active cart found for this customer' } });
    }
    res.json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
});

// Add item to cart
router.post('/:cart_id/items', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = AddItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }

    // Verify cart exists
    const existingCart = await cartService.getCart(req.params.cart_id, tenantId);
    if (!existingCart) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Cart not found' } });
    }
    if (existingCart.status !== 'active') {
      return res.status(400).json({ success: false, error: { code: 'CART_INACTIVE', message: 'Cart is not active' } });
    }

    const cart = await cartService.addItem(req.params.cart_id, tenantId, parsed.data);
    res.json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
});

// Update item quantity
router.patch('/:cart_id/items/:item_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = UpdateItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }

    const cart = await cartService.updateItemQuantity(req.params.cart_id, req.params.item_id, tenantId, parsed.data.quantity);
    if (!cart) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Cart or item not found' } });
    }
    res.json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
});

// Remove item from cart
router.delete('/:cart_id/items/:item_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const cart = await cartService.removeItem(req.params.cart_id, req.params.item_id, tenantId);
    if (!cart) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Cart or item not found' } });
    }
    res.json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
});

// Apply coupon to cart
router.post('/:cart_id/coupon', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = ApplyCouponSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }

    const existingCart = await cartService.getCart(req.params.cart_id, tenantId);
    if (!existingCart) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Cart not found' } });
    }

    const cart = await cartService.applyCoupon(req.params.cart_id, tenantId, parsed.data.coupon_code, parsed.data.discount_amount);
    res.json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
});

// Remove coupon from cart
router.delete('/:cart_id/coupon', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const cart = await cartService.removeCoupon(req.params.cart_id, tenantId);
    if (!cart) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Cart not found' } });
    }
    res.json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
});

// Get cart totals
router.get('/:cart_id/totals', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const totals = await cartService.getCartTotals(req.params.cart_id, tenantId);
    if (!totals) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Cart not found' } });
    }
    res.json({ success: true, data: totals });
  } catch (error) {
    next(error);
  }
});

// Clear all items from cart
router.delete('/:cart_id/items', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const cart = await cartService.clearCart(req.params.cart_id, tenantId);
    if (!cart) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Cart not found' } });
    }
    res.json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
});

// Delete cart
router.delete('/:cart_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const deleted = await cartService.deleteCart(req.params.cart_id, tenantId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Cart not found' } });
    }
    res.json({ success: true, data: { message: 'Cart deleted' } });
  } catch (error) {
    next(error);
  }
});

// Mark abandoned carts (admin/cron endpoint)
router.post('/abandoned/scan', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const abandoned = await cartService.markAbandoned(tenantId);
    res.json({ success: true, data: { abandoned_count: abandoned.length, carts: abandoned } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
