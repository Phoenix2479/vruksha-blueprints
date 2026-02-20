// Address routes

const express = require('express');
const { z } = require('zod');
const { getTenantId } = require('../middleware');
const { addressService } = require('../services');

const router = express.Router({ mergeParams: true });

// Validation schemas
const AddressCreateSchema = z.object({
  type: z.enum(['shipping', 'billing']).default('shipping'),
  is_default: z.boolean().default(false),
  first_name: z.string().optional().nullable(),
  last_name: z.string().optional().nullable(),
  line1: z.string().min(1),
  line2: z.string().optional().nullable(),
  city: z.string().min(1),
  state: z.string().optional().nullable(),
  postal_code: z.string().min(1),
  country: z.string().length(2).default('US'),
  phone: z.string().optional().nullable()
});

const AddressUpdateSchema = z.object({
  type: z.enum(['shipping', 'billing']).optional(),
  is_default: z.boolean().optional(),
  first_name: z.string().optional().nullable(),
  last_name: z.string().optional().nullable(),
  line1: z.string().min(1).optional(),
  line2: z.string().optional().nullable(),
  city: z.string().min(1).optional(),
  state: z.string().optional().nullable(),
  postal_code: z.string().min(1).optional(),
  country: z.string().length(2).optional(),
  phone: z.string().optional().nullable()
});

// List addresses for a customer
router.get('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { customer_id } = req.params;
    const addresses = await addressService.listAddresses(customer_id, tenantId);
    res.json({ success: true, data: addresses });
  } catch (error) {
    next(error);
  }
});

// Add address
router.post('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { customer_id } = req.params;
    const parsed = AddressCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'ERR_INVALID_PAYLOAD', message: 'Invalid payload', details: parsed.error.errors } });
    }

    const result = await addressService.addAddress(customer_id, tenantId, parsed.data);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

// Update address
router.patch('/:address_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { customer_id, address_id } = req.params;
    const parsed = AddressUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'ERR_INVALID_PAYLOAD', message: 'Invalid payload', details: parsed.error.errors } });
    }

    const result = await addressService.updateAddress(address_id, customer_id, tenantId, parsed.data);
    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Delete address
router.delete('/:address_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { customer_id, address_id } = req.params;
    const result = await addressService.deleteAddress(address_id, customer_id, tenantId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Set default address
router.patch('/:address_id/default', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { customer_id, address_id } = req.params;
    const result = await addressService.setDefault(address_id, customer_id, tenantId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
