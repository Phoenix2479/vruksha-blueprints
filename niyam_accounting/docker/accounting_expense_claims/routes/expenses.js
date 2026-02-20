// Route handlers for Expense Claims domain

const express = require('express');
const router = express.Router();
const { getTenantId } = require('../middleware/auth');
const expenseClaimsService = require('../services/expenseClaimsService');

// --- Categories ---

router.get('/api/expense-categories', async (req, res, next) => {
  try {
    const result = await expenseClaimsService.listCategories(getTenantId(req));
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/api/expense-categories', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const result = await expenseClaimsService.createCategory(getTenantId(req), req.body);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.put('/api/expense-categories/:id', async (req, res, next) => {
  try {
    const result = await expenseClaimsService.updateCategory(getTenantId(req), req.params.id, req.body);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// --- Claims ---

router.get('/api/expense-claims', async (req, res, next) => {
  try {
    const result = await expenseClaimsService.listClaims(getTenantId(req), req.query);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/api/expense-claims/csv', async (req, res, next) => {
  try {
    const csvGen = require('../../shared/csv-generator');
    const rows = await expenseClaimsService.listClaimsCsv(getTenantId(req));
    csvGen.sendCSV(res, rows, null, 'expense-claims.csv');
  } catch (err) { next(err); }
});

router.get('/api/expense-claims/summary', async (req, res, next) => {
  try {
    const result = await expenseClaimsService.getClaimsSummary(getTenantId(req));
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/api/expense-claims', async (req, res, next) => {
  try {
    const { employee_name } = req.body;
    if (!employee_name) return res.status(400).json({ error: 'employee_name required' });
    const result = await expenseClaimsService.createClaim(getTenantId(req), req.body);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/api/expense-claims/:id', async (req, res, next) => {
  try {
    const result = await expenseClaimsService.getClaim(getTenantId(req), req.params.id);
    if (!result) return res.status(404).json({ error: 'Claim not found' });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.put('/api/expense-claims/:id', async (req, res, next) => {
  try {
    const result = await expenseClaimsService.updateClaim(getTenantId(req), req.params.id, req.body);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/api/expense-claims/:id/submit', async (req, res, next) => {
  try {
    const result = await expenseClaimsService.submitClaim(getTenantId(req), req.params.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/api/expense-claims/:id/approve', async (req, res, next) => {
  try {
    const result = await expenseClaimsService.approveClaim(getTenantId(req), req.params.id, req.body.approved_by);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/api/expense-claims/:id/reject', async (req, res, next) => {
  try {
    const result = await expenseClaimsService.rejectClaim(getTenantId(req), req.params.id, req.body.reason);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/api/expense-claims/:id/add-line', async (req, res, next) => {
  try {
    const result = await expenseClaimsService.addLine(getTenantId(req), req.params.id, req.body);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.delete('/api/expense-claims/:id/lines/:lineId', async (req, res, next) => {
  try {
    await expenseClaimsService.deleteLine(getTenantId(req), req.params.id, req.params.lineId);
    res.json({ success: true, message: 'Line deleted' });
  } catch (err) { next(err); }
});

router.post('/api/expense-claims/:id/pay', async (req, res, next) => {
  try {
    const result = await expenseClaimsService.payClaim(getTenantId(req), req.params.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

module.exports = router;
