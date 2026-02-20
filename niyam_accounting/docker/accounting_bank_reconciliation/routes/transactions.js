/**
 * Transaction routes
 * Bank transaction listing, creation, import, deletion, and CSV export
 */

const { Router } = require('express');
const { getTenantId } = require('../middleware/auth');
const transactionService = require('../services/transactionService');

const router = Router();

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// List transactions for a bank account
router.get('/bank-accounts/:id/transactions', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await transactionService.listTransactions(tenantId, req.params.id, req.query);

  res.json({
    success: true,
    data: result.rows,
    pagination: result.pagination
  });
}));

// Add single transaction
router.post('/bank-accounts/:bankAccountId/transactions', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await transactionService.addTransaction(tenantId, req.params.bankAccountId, req.body);

  if (result.error) {
    return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
  }

  res.status(201).json({ success: true, data: result.data });
}));

// Import transactions in bulk
router.post('/bank-accounts/:bankAccountId/transactions/import', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await transactionService.importTransactions(tenantId, req.params.bankAccountId, req.body);

  if (result.error) {
    return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
  }

  res.json({ success: true, data: result.data });
}));

// Delete transaction
router.delete('/bank-accounts/:bankAccountId/transactions/:id', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await transactionService.deleteTransaction(tenantId, req.params.bankAccountId, req.params.id);

  if (result.error) {
    return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
  }

  res.json({ success: true, data: result.data });
}));

// Export transactions as CSV
router.get('/bank-accounts/:id/transactions/csv', asyncHandler(async (req, res) => {
  const csvGen = require('../../shared/csv-generator');
  const tenantId = getTenantId(req);
  const rows = await transactionService.exportTransactionsCsv(tenantId, req.params.id);
  csvGen.sendCSV(res, rows, null, 'bank-transactions.csv');
}));

module.exports = router;
