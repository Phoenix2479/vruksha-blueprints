/**
 * TDS routes
 * TDS sections, transactions, deposit tracking, calculation, summary + CSV export
 */

const { Router } = require('express');
const { getTenantId } = require('../middleware/auth');
const tdsService = require('../services/tdsService');

const router = Router();

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// List TDS sections
router.get('/tds/sections', (_req, res) => {
  res.json({ success: true, data: tdsService.getSections() });
});

// List TDS transactions
router.get('/tds/transactions', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await tdsService.listTransactions(tenantId, req.query);

  res.json({
    success: true,
    data: result.rows,
    summary: result.summary,
    pagination: result.pagination
  });
}));

// Create TDS transaction
router.post('/tds/transactions', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await tdsService.createTransaction(tenantId, req.body);

  if (result.error) {
    return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
  }

  res.status(201).json({ success: true, data: result.data });
}));

// Update TDS deposit details
router.put('/tds/transactions/:id/deposit', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await tdsService.updateDeposit(tenantId, req.params.id, req.body);

  if (result.error) {
    return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
  }

  res.json({ success: true, data: result.data });
}));

// Calculate TDS
router.post('/tds/calculate', asyncHandler(async (req, res) => {
  const result = tdsService.calculateTds(req.body);

  if (result.error) {
    return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
  }

  res.json({ success: true, data: result.data });
}));

// TDS summary by section
router.get('/tds/summary', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const data = await tdsService.getSummary(tenantId, req.query);
  res.json({ success: true, data });
}));

// Export TDS transactions as CSV
router.get('/tds/transactions/csv', asyncHandler(async (req, res) => {
  const csvGen = require('../../shared/csv-generator');
  const tenantId = getTenantId(req);
  const rows = await tdsService.exportTransactionsCsv(tenantId);
  csvGen.sendCSV(res, rows, null, 'tds-transactions.csv');
}));

module.exports = router;
