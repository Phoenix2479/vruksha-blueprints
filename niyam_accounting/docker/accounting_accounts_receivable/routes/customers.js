// Customer routes

const express = require('express');
const { z } = require('zod');
const router = express.Router();
const { getTenantId } = require('../middleware/auth');
const { customerService } = require('../services');

// ============================================
// VALIDATION SCHEMAS
// ============================================

const customerSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(255),
  display_name: z.string().max(255).optional().nullable(),
  customer_type: z.enum(['individual', 'business', 'government', 'other']).default('business'),
  gstin: z.string().max(15).optional().nullable(),
  pan: z.string().length(10).optional().nullable(),
  contact_person: z.string().max(255).optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  mobile: z.string().max(20).optional().nullable(),
  address_line1: z.string().max(255).optional().nullable(),
  address_line2: z.string().max(255).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  state_code: z.string().max(2).optional().nullable(),
  pincode: z.string().max(10).optional().nullable(),
  country: z.string().max(100).default('India'),
  payment_terms_days: z.number().int().min(0).default(30),
  credit_limit: z.number().min(0).optional().default(0),
  default_revenue_account_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().default(true),
  notes: z.string().optional().nullable()
});

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ============================================
// ROUTES
// ============================================

// List customers
router.get('/', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await customerService.listCustomers(tenantId, req.query);
  res.json({ success: true, ...result });
}));

// Export CSV (must be before /:id to avoid matching)
router.get('/export/csv', asyncHandler(async (req, res) => {
  const csvGen = require('../../shared/csv-generator');
  const tenantId = getTenantId(req);
  const rows = await customerService.getCustomersForCSV(tenantId);
  csvGen.sendCSV(res, rows, null, 'customers.csv');
}));

// Get single customer
router.get('/:id', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const customer = await customerService.getCustomerById(tenantId, req.params.id);

  if (!customer) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } });
  }

  res.json({ success: true, data: customer });
}));

// Create customer
router.post('/', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const validation = customerSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: validation.error.message } });
  }

  const result = await customerService.createCustomer(tenantId, validation.data);

  if (result.error) {
    return res.status(result.status).json({ success: false, error: result.error });
  }

  res.status(201).json({ success: true, data: result.data });
}));

// Update customer
router.put('/:id', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const validation = customerSchema.partial().safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: validation.error.message } });
  }

  const result = await customerService.updateCustomer(tenantId, req.params.id, validation.data, customerSchema.shape);

  if (result.error) {
    return res.status(result.status).json({ success: false, error: result.error });
  }

  res.json({ success: true, data: result.data });
}));

// Customer statement
router.get('/:id/statement', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await customerService.getCustomerStatement(tenantId, req.params.id, req.query);

  if (!result) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } });
  }

  res.json({ success: true, data: result });
}));

module.exports = router;
