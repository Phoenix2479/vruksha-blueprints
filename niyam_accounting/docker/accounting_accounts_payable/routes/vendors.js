// Vendor routes

const express = require('express');
const { z } = require('zod');
const router = express.Router();
const { getTenantId } = require('../middleware/auth');
const { vendorService } = require('../services');

// ============================================
// VALIDATION SCHEMAS
// ============================================

const vendorSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(255),
  display_name: z.string().max(255).optional().nullable(),
  vendor_type: z.enum(['supplier', 'contractor', 'service_provider', 'other']).default('supplier'),
  gstin: z.string().max(15).optional().nullable(),
  pan: z.string().length(10).optional().nullable(),
  tan: z.string().length(10).optional().nullable(),
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
  tds_applicable: z.boolean().default(false),
  tds_section: z.string().max(10).optional().nullable(),
  default_expense_account_id: z.string().uuid().optional().nullable(),
  bank_name: z.string().max(255).optional().nullable(),
  bank_account_number: z.string().max(50).optional().nullable(),
  bank_ifsc: z.string().max(11).optional().nullable(),
  is_active: z.boolean().default(true),
  notes: z.string().optional().nullable()
});

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ============================================
// ROUTES
// ============================================

// List vendors
router.get('/', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await vendorService.listVendors(tenantId, req.query);
  res.json({ success: true, ...result });
}));

// Export CSV (must be before /:id to avoid matching)
router.get('/export/csv', asyncHandler(async (req, res) => {
  const csvGen = require('../../shared/csv-generator');
  const tenantId = getTenantId(req);
  const rows = await vendorService.getVendorsForCSV(tenantId);
  csvGen.sendCSV(res, rows, null, 'vendors.csv');
}));

// Get single vendor
router.get('/:id', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const vendor = await vendorService.getVendorById(tenantId, req.params.id);

  if (!vendor) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Vendor not found' } });
  }

  res.json({ success: true, data: vendor });
}));

// Create vendor
router.post('/', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const validation = vendorSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: validation.error.message } });
  }

  const result = await vendorService.createVendor(tenantId, validation.data);

  if (result.error) {
    return res.status(result.status).json({ success: false, error: result.error });
  }

  res.status(201).json({ success: true, data: result.data });
}));

// Update vendor
router.put('/:id', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const validation = vendorSchema.partial().safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: validation.error.message } });
  }

  const result = await vendorService.updateVendor(tenantId, req.params.id, validation.data, vendorSchema.shape);

  if (result.error) {
    return res.status(result.status).json({ success: false, error: result.error });
  }

  res.json({ success: true, data: result.data });
}));

// Vendor statement
router.get('/:id/statement', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await vendorService.getVendorStatement(tenantId, req.params.id, req.query);

  if (!result) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Vendor not found' } });
  }

  res.json({ success: true, data: result });
}));

module.exports = router;
