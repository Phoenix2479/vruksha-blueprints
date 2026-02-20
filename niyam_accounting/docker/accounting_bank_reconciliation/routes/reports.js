/**
 * Report routes
 * Reconciliation summary and unreconciled items reports + CSV export
 */

const { Router } = require('express');
const { getTenantId } = require('../middleware/auth');
const reconciliationService = require('../services/reconciliationService');

const router = Router();

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Bank reconciliation summary report
router.get('/reports/reconciliation-summary', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const data = await reconciliationService.getReconciliationSummary(tenantId, req.query);
  res.json({ success: true, data });
}));

// Unreconciled items report
router.get('/reports/unreconciled-items', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const data = await reconciliationService.getUnreconciledItems(tenantId, req.query);
  res.json({ success: true, data });
}));

// Export reconciliation summary as CSV
router.get('/reports/reconciliation-summary/csv', asyncHandler(async (req, res) => {
  const csvGen = require('../../shared/csv-generator');
  const tenantId = getTenantId(req);
  const rows = await reconciliationService.exportReconciliationSummaryCsv(tenantId);
  csvGen.sendCSV(res, rows, null, 'reconciliation-summary.csv');
}));

module.exports = router;
