// Fixed Assets route handlers
// Delegates all business logic to assetsService

const express = require('express');
const router = express.Router();
const { getTenantId } = require('../middleware/auth');
const { assetsService } = require('../services');

// ─── Asset Categories ───────────────────────────────────────────────

router.get('/api/asset-categories', async (req, res, next) => {
  try {
    const data = await assetsService.listCategories(getTenantId(req));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.post('/api/asset-categories', async (req, res, next) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'name required' });
    const data = await assetsService.createCategory(getTenantId(req), req.body);
    res.status(201).json({ success: true, data });
  } catch (e) { next(e); }
});

router.put('/api/asset-categories/:id', async (req, res, next) => {
  try {
    const data = await assetsService.updateCategory(getTenantId(req), req.params.id, req.body);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// ─── Assets ─────────────────────────────────────────────────────────

router.get('/api/assets', async (req, res, next) => {
  try {
    const data = await assetsService.listAssets(getTenantId(req), req.query);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/api/assets/csv', async (req, res, next) => {
  try {
    const csvGen = require('../../shared/csv-generator');
    const rows = await assetsService.listAssetsForCsv(getTenantId(req));
    csvGen.sendCSV(res, rows, null, 'fixed-assets.csv');
  } catch (e) { next(e); }
});

router.get('/api/assets/forecast', async (req, res, next) => {
  try {
    const months = parseInt(req.query.months) || 12;
    const data = await assetsService.getForecast(getTenantId(req), months);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.post('/api/assets', async (req, res, next) => {
  try {
    if (!req.body.name || !req.body.purchase_cost) return res.status(400).json({ error: 'name and purchase_cost required' });
    const data = await assetsService.createAsset(getTenantId(req), req.body);
    res.status(201).json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/api/assets/:id', async (req, res, next) => {
  try {
    const data = await assetsService.getAsset(getTenantId(req), req.params.id);
    if (!data) return res.status(404).json({ error: 'Asset not found' });
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.put('/api/assets/:id', async (req, res, next) => {
  try {
    const data = await assetsService.updateAsset(getTenantId(req), req.params.id, req.body);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// ─── Run Depreciation ───────────────────────────────────────────────

router.post('/api/assets/run-depreciation', async (req, res, next) => {
  try {
    const data = await assetsService.runDepreciation(getTenantId(req), req.body.period_date);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// ─── Schedule ───────────────────────────────────────────────────────

router.get('/api/assets/:id/schedule', async (req, res, next) => {
  try {
    const data = await assetsService.getSchedule(getTenantId(req), req.params.id);
    if (!data) return res.status(404).json({ error: 'Asset not found' });
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// ─── Dispose ────────────────────────────────────────────────────────

router.post('/api/assets/:id/dispose', async (req, res, next) => {
  try {
    const data = await assetsService.disposeAsset(getTenantId(req), req.params.id, req.body);
    if (!data) return res.status(404).json({ error: 'Asset not found' });
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

module.exports = router;
