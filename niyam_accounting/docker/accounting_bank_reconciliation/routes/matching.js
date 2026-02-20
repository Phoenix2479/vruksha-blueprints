/**
 * Auto-matching routes
 * Automatic transaction matching and bulk match application
 */

const { Router } = require('express');
const { getTenantId } = require('../middleware/auth');
const transactionService = require('../services/transactionService');

const router = Router();

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Auto-match transactions with ledger entries
router.post('/bank-accounts/:bankAccountId/auto-match', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await transactionService.autoMatch(tenantId, req.params.bankAccountId, req.body);

  if (result.error) {
    return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
  }

  res.json({ success: true, data: result.data });
}));

// Apply suggested matches
router.post('/bank-accounts/:bankAccountId/apply-matches', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await transactionService.applyMatches(tenantId, req.params.bankAccountId, req.body.matches);

  if (result.error) {
    return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
  }

  res.json({ success: true, data: result.data });
}));

module.exports = router;
