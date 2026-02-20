/**
 * Bank Account routes
 * CRUD for bank accounts + balance inquiry
 */

const { Router } = require('express');
const { getTenantId } = require('../middleware/auth');
const bankAccountService = require('../services/bankAccountService');

const router = Router();

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// List all bank accounts
router.get('/bank-accounts', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const data = await bankAccountService.listAccounts(tenantId, req.query);
  res.json({ success: true, data });
}));

// Get single bank account with details
router.get('/bank-accounts/:id', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const data = await bankAccountService.getAccount(tenantId, req.params.id);

  if (!data) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Bank account not found' } });
  }

  res.json({ success: true, data });
}));

// Create bank account
router.post('/bank-accounts', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await bankAccountService.createAccount(tenantId, req.body);

  if (result.error) {
    return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
  }

  res.status(201).json({ success: true, data: result.data });
}));

// Update bank account
router.put('/bank-accounts/:id', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await bankAccountService.updateAccount(tenantId, req.params.id, req.body);

  if (result.error) {
    return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
  }

  res.json({ success: true, data: result.data });
}));

// Get bank account balance
router.get('/bank-accounts/:id/balance', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await bankAccountService.getBalance(tenantId, req.params.id, req.query);

  if (result.error) {
    return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
  }

  res.json({ success: true, data: result.data });
}));

module.exports = router;
