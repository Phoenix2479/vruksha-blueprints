/**
 * GST Returns routes
 * GST return management and filing data generation (GSTR-1, GSTR-3B)
 */

const { Router } = require('express');
const { getTenantId } = require('../middleware/auth');
const gstService = require('../services/gstService');

const router = Router();

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// List GST returns
router.get('/gst-returns', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const data = await gstService.listReturns(tenantId, req.query);
  res.json({ success: true, data });
}));

// Create/Initialize GST return
router.post('/gst-returns', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await gstService.createReturn(tenantId, req.body);

  if (result.error) {
    return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
  }

  res.status(201).json({ success: true, data: result.data });
}));

// Generate GSTR-1 data
router.get('/gst-returns/gstr1-data', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await gstService.getGstr1Data(tenantId, req.query.return_period);

  if (result.error) {
    return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
  }

  res.json({ success: true, data: result.data });
}));

// Generate GSTR-3B data
router.get('/gst-returns/gstr3b-data', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await gstService.getGstr3bData(tenantId, req.query.return_period);

  if (result.error) {
    return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
  }

  res.json({ success: true, data: result.data });
}));

// Update GST return status
router.put('/gst-returns/:id/status', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await gstService.updateReturnStatus(tenantId, req.params.id, req.body);

  if (result.error) {
    return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
  }

  res.json({ success: true, data: result.data });
}));

module.exports = router;
