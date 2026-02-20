/**
 * Tax Code routes
 * CRUD for tax codes + GST calculation endpoints + CSV export
 */

const { Router } = require('express');
const { getTenantId } = require('../middleware/auth');
const taxCodeService = require('../services/taxCodeService');

const router = Router();

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// List all tax codes
router.get('/tax-codes', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const data = await taxCodeService.listTaxCodes(tenantId, req.query);
  res.json({ success: true, data });
}));

// Get single tax code
router.get('/tax-codes/:id', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const data = await taxCodeService.getTaxCode(tenantId, req.params.id);

  if (!data) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tax code not found' } });
  }

  res.json({ success: true, data });
}));

// Create tax code
router.post('/tax-codes', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await taxCodeService.createTaxCode(tenantId, req.body);

  if (result.error) {
    return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
  }

  res.status(201).json({ success: true, data: result.data });
}));

// Update tax code
router.put('/tax-codes/:id', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await taxCodeService.updateTaxCode(tenantId, req.params.id, req.body);

  if (result.error) {
    return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
  }

  res.json({ success: true, data: result.data });
}));

// Export tax codes as CSV
router.get('/tax-codes/export/csv', asyncHandler(async (req, res) => {
  const csvGen = require('../../shared/csv-generator');
  const tenantId = getTenantId(req);
  const rows = await taxCodeService.exportTaxCodesCsv(tenantId);
  csvGen.sendCSV(res, rows, null, 'tax-codes.csv');
}));

// Calculate GST for an amount
router.post('/calculate-gst', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await taxCodeService.calculateGst(tenantId, req.body);

  if (result.error) {
    return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
  }

  res.json({ success: true, data: result.data });
}));

// Calculate GST for invoice lines
router.post('/calculate-invoice-gst', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await taxCodeService.calculateInvoiceGst(tenantId, req.body);

  if (result.error) {
    return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
  }

  res.json({ success: true, data: result.data });
}));

module.exports = router;
