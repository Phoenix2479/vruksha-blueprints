/**
 * Tax report routes
 * GST summary by rate and tax liability reports
 */

const { Router } = require('express');
const { getTenantId } = require('../middleware/auth');
const gstService = require('../services/gstService');

const router = Router();

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// GST summary by rate
router.get('/reports/gst-by-rate', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const data = await gstService.getGstByRate(tenantId, req.query);
  res.json({ success: true, data });
}));

// Tax liability summary
router.get('/reports/tax-liability', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const data = await gstService.getTaxLiability(tenantId, req.query);
  res.json({ success: true, data });
}));

module.exports = router;
