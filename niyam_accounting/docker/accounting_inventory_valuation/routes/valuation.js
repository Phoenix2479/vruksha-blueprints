// Route handlers for Inventory Valuation domain

const express = require('express');
const router = express.Router();
const { getTenantId } = require('../middleware/auth');
const valuationService = require('../services/valuationService');

// --- Valuation Items ---

router.get('/api/valuation', async (req, res, next) => {
  try {
    const result = await valuationService.listValuationItems(getTenantId(req), req.query);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/api/valuation/csv', async (req, res, next) => {
  try {
    const csvGen = require('../../shared/csv-generator');
    const rows = await valuationService.listValuationItemsCsv(getTenantId(req));
    csvGen.sendCSV(res, rows, null, 'inventory-valuation.csv');
  } catch (err) { next(err); }
});

router.post('/api/valuation', async (req, res, next) => {
  try {
    const { item_name } = req.body;
    if (!item_name) return res.status(400).json({ error: 'item_name required' });
    const result = await valuationService.createValuationItem(getTenantId(req), req.body);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/api/valuation/:id', async (req, res, next) => {
  try {
    const result = await valuationService.getValuationItem(getTenantId(req), req.params.id);
    if (!result) return res.status(404).json({ error: 'Item not found' });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.put('/api/valuation/:id', async (req, res, next) => {
  try {
    const result = await valuationService.updateValuationItem(getTenantId(req), req.params.id, req.body);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// --- Transactions ---

router.get('/api/valuation/:id/transactions', async (req, res, next) => {
  try {
    const result = await valuationService.listTransactions(getTenantId(req), req.params.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/api/valuation/:id/transactions', async (req, res, next) => {
  try {
    const { type, quantity } = req.body;
    if (!type || !quantity) return res.status(400).json({ error: 'type and quantity required' });
    const result = await valuationService.createTransaction(getTenantId(req), req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'Item not found' });
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

// --- History ---

router.get('/api/valuation/:id/history', async (req, res, next) => {
  try {
    const result = await valuationService.getItemHistory(getTenantId(req), req.params.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// --- Methods ---

router.get('/api/methods', (req, res) => {
  res.json({ success: true, data: valuationService.getCostingMethods() });
});

// --- Settings ---

router.get('/api/settings', async (req, res, next) => {
  try {
    const result = await valuationService.getSettings(getTenantId(req));
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.put('/api/settings', async (req, res, next) => {
  try {
    await valuationService.updateSettings(getTenantId(req), req.body);
    res.json({ success: true, message: 'Settings updated' });
  } catch (err) { next(err); }
});

// --- Calculate ---

router.post('/api/valuation/:id/calculate', async (req, res, next) => {
  try {
    const result = await valuationService.calculateValuation(getTenantId(req), req.params.id);
    if (!result) return res.status(404).json({ error: 'Item not found' });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

module.exports = router;
