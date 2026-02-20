/**
 * Reconciliation routes
 * Reconciliation workflow: create, view, match/unmatch, complete, cancel
 */

const { Router } = require('express');
const { getTenantId } = require('../middleware/auth');
const reconciliationService = require('../services/reconciliationService');

const router = Router();

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// List reconciliations for a bank account
router.get('/bank-accounts/:bankAccountId/reconciliations', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const data = await reconciliationService.listReconciliations(tenantId, req.params.bankAccountId, req.query);
  res.json({ success: true, data });
}));

// Start a new reconciliation
router.post('/reconciliations', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await reconciliationService.startReconciliation(tenantId, req.body);

  if (result.error) {
    return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
  }

  res.status(201).json({ success: true, data: result.data });
}));

// Get reconciliation details
router.get('/reconciliations/:id', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await reconciliationService.getReconciliation(tenantId, req.params.id);

  if (result.error) {
    return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
  }

  res.json({ success: true, data: result.data });
}));

// Match transactions to reconciliation
router.post('/reconciliations/:id/match', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await reconciliationService.matchTransactions(tenantId, req.params.id, req.body.transaction_ids);

  if (result.error) {
    return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
  }

  res.json({ success: true, data: result.data });
}));

// Unmatch transactions from reconciliation
router.post('/reconciliations/:id/unmatch', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await reconciliationService.unmatchTransactions(tenantId, req.params.id, req.body.transaction_ids);

  if (result.error) {
    return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
  }

  res.json({ success: true, data: result.data });
}));

// Complete reconciliation
router.post('/reconciliations/:id/complete', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await reconciliationService.completeReconciliation(tenantId, req.params.id, req.body);

  if (result.error) {
    return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
  }

  res.json({ success: true, data: result.data });
}));

// Cancel reconciliation
router.post('/reconciliations/:id/cancel', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await reconciliationService.cancelReconciliation(tenantId, req.params.id);

  if (result.error) {
    return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
  }

  res.json({ success: true, data: result.data });
}));

module.exports = router;
