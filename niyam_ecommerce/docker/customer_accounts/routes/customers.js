// Customer routes

const express = require('express');
const { z } = require('zod');
const { getTenantId, requireAnyRole } = require('../middleware');
const { customerService } = require('../services');

const router = express.Router();

// Validation schemas
const CustomerCreateSchema = z.object({
  email: z.string().email(),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  phone: z.string().optional().nullable(),
  loyalty_points: z.number().int().min(0).default(0),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional().nullable()
});

const CustomerUpdateSchema = z.object({
  email: z.string().email().optional(),
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  phone: z.string().optional().nullable(),
  loyalty_points: z.number().int().min(0).optional(),
  total_orders: z.number().int().min(0).optional(),
  total_spent: z.number().min(0).optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
  last_login_at: z.string().optional().nullable()
});

// List customers with search/filter/pagination
router.get('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { search, loyalty_tier, is_active, page, limit } = req.query;
    const result = await customerService.listCustomers(tenantId, { search, loyalty_tier, is_active, page, limit });
    res.json({ success: true, data: result.data, pagination: result.pagination });
  } catch (error) {
    next(error);
  }
});

// Get customer by ID
router.get('/:customer_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { customer_id } = req.params;
    const customer = await customerService.getCustomer(customer_id, tenantId);

    if (!customer) {
      return res.status(404).json({ success: false, error: { code: 'ERR_CUSTOMER_NOT_FOUND', message: 'Customer not found' } });
    }

    res.json({ success: true, data: customer });
  } catch (error) {
    next(error);
  }
});

// Create customer
router.post('/', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = CustomerCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'ERR_INVALID_PAYLOAD', message: 'Invalid payload', details: parsed.error.errors } });
    }

    const result = await customerService.createCustomer(tenantId, parsed.data);
    res.status(201).json(result);
  } catch (error) {
    if (error && error.code === '23505') {
      return res.status(400).json({ success: false, error: { code: 'ERR_DUPLICATE_EMAIL', message: 'Customer with this email already exists' } });
    }
    next(error);
  }
});

// Update customer
router.patch('/:customer_id', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { customer_id } = req.params;
    const parsed = CustomerUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'ERR_INVALID_PAYLOAD', message: 'Invalid payload', details: parsed.error.errors } });
    }

    const result = await customerService.updateCustomer(customer_id, tenantId, parsed.data);
    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    if (error && error.code === '23505') {
      return res.status(400).json({ success: false, error: { code: 'ERR_DUPLICATE_EMAIL', message: 'Customer with this email already exists' } });
    }
    next(error);
  }
});

// Delete/deactivate customer
router.delete('/:customer_id', requireAnyRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { customer_id } = req.params;
    const result = await customerService.deactivateCustomer(customer_id, tenantId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
