/**
 * Validation routes
 * GSTIN, HSN, and SAC code validators
 */

const { Router } = require('express');
const { getTenantId } = require('../middleware/auth');
const gstService = require('../services/gstService');

const router = Router();

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Validate HSN code
router.get('/validate/hsn/:code', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const data = await gstService.validateHsn(tenantId, req.params.code);
  res.json({ success: true, data });
}));

// Validate SAC code
router.get('/validate/sac/:code', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const data = await gstService.validateSac(tenantId, req.params.code);
  res.json({ success: true, data });
}));

// Validate GSTIN
router.get('/validate/gstin/:gstin', (req, res) => {
  const data = gstService.validateGstin(req.params.gstin);
  res.json({ success: true, data });
});

module.exports = router;
