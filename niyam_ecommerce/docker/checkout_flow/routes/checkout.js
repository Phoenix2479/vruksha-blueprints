// Checkout routes

const express = require('express');
const { z } = require('zod');
const { getTenantId } = require('../middleware');
const { checkoutService } = require('../services');

const router = express.Router();

// Validation schemas
const InitCheckoutSchema = z.object({
  cart_id: z.string().uuid(),
  customer_id: z.string().uuid().optional().nullable(),
  customer_email: z.string().email().optional().nullable(),
  subtotal: z.number().finite().min(0).default(0),
  tax_amount: z.number().finite().min(0).default(0),
  discount_amount: z.number().finite().min(0).default(0),
  total: z.number().finite().min(0).default(0),
  currency: z.string().length(3).default('USD'),
  cart_items: z.array(z.object({
    product_id: z.string(),
    product_name: z.string(),
    variant_id: z.string().optional().nullable(),
    quantity: z.number().int().min(1),
    unit_price: z.number().finite().min(0),
    line_total: z.number().finite().min(0)
  })).default([]),
  notes: z.string().optional().nullable(),
  metadata: z.record(z.any()).default({})
});

const SetAddressSchema = z.object({
  shipping_name: z.string().min(1, 'Shipping name is required'),
  shipping_address_line1: z.string().min(1, 'Address line 1 is required'),
  shipping_address_line2: z.string().optional().nullable(),
  shipping_city: z.string().min(1, 'City is required'),
  shipping_state: z.string().min(1, 'State is required'),
  shipping_postal_code: z.string().min(1, 'Postal code is required'),
  shipping_country: z.string().length(2, 'Country must be 2-letter ISO code'),
  shipping_phone: z.string().optional().nullable(),
  billing_same_as_shipping: z.boolean().default(true),
  billing_address_line1: z.string().optional().nullable(),
  billing_address_line2: z.string().optional().nullable(),
  billing_city: z.string().optional().nullable(),
  billing_state: z.string().optional().nullable(),
  billing_postal_code: z.string().optional().nullable(),
  billing_country: z.string().length(2).optional().nullable()
});

const SetShippingSchema = z.object({
  shipping_method: z.string().min(1, 'Shipping method is required'),
  shipping_carrier: z.string().optional().nullable(),
  shipping_cost: z.number().finite().min(0),
  estimated_delivery_date: z.string().optional().nullable()
});

const SetPaymentSchema = z.object({
  payment_method: z.string().min(1, 'Payment method is required'),
  payment_reference: z.string().optional().nullable()
});

// Initialize checkout from cart
router.post('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = InitCheckoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }

    const session = await checkoutService.initCheckout(tenantId, parsed.data);
    res.status(201).json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
});

// List checkout sessions
router.get('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { customer_id, status, limit, offset } = req.query;
    const result = await checkoutService.listCheckouts(tenantId, { customer_id, status, limit, offset });
    res.json({ success: true, data: result.sessions, pagination: result.pagination });
  } catch (error) {
    next(error);
  }
});

// Get checkout session
router.get('/:session_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const session = await checkoutService.getCheckout(req.params.session_id, tenantId);
    if (!session) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Checkout session not found' } });
    }
    res.json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
});

// Step 1: Set address
router.post('/:session_id/address', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = SetAddressSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }

    // If billing is not same as shipping, validate billing fields
    if (parsed.data.billing_same_as_shipping === false) {
      if (!parsed.data.billing_address_line1 || !parsed.data.billing_city ||
          !parsed.data.billing_state || !parsed.data.billing_postal_code || !parsed.data.billing_country) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Billing address fields are required when billing is different from shipping' } });
      }
    }

    const result = await checkoutService.setAddress(req.params.session_id, tenantId, parsed.data);
    if (!result) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Checkout session not found' } });
    }
    if (result.error) {
      return res.status(400).json({ success: false, error: { code: 'STEP_ERROR', message: result.error } });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Step 2: Select shipping method
router.post('/:session_id/shipping', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = SetShippingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }

    const result = await checkoutService.setShipping(req.params.session_id, tenantId, parsed.data);
    if (!result) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Checkout session not found' } });
    }
    if (result.error) {
      return res.status(400).json({ success: false, error: { code: 'STEP_ERROR', message: result.error } });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Step 3: Confirm payment method
router.post('/:session_id/payment', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = SetPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.errors } });
    }

    const result = await checkoutService.setPayment(req.params.session_id, tenantId, parsed.data);
    if (!result) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Checkout session not found' } });
    }
    if (result.error) {
      return res.status(400).json({ success: false, error: { code: 'STEP_ERROR', message: result.error } });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Step 4: Place order (confirm)
router.post('/:session_id/confirm', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const result = await checkoutService.placeOrder(req.params.session_id, tenantId);
    if (!result) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Checkout session not found' } });
    }
    if (result.error) {
      return res.status(400).json({ success: false, error: { code: 'STEP_ERROR', message: result.error } });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Cancel checkout
router.post('/:session_id/cancel', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const result = await checkoutService.cancelCheckout(req.params.session_id, tenantId);
    if (!result) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Checkout session not found or already completed' } });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
