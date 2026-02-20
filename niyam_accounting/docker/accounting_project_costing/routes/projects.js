// Route handlers for Project Costing domain

const express = require('express');
const router = express.Router();
const { getTenantId } = require('../middleware/auth');
const projectCostingService = require('../services/projectCostingService');

// --- Projects ---

router.get('/api/projects', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const result = await projectCostingService.listProjects(tenantId, req.query);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/api/projects/csv', async (req, res, next) => {
  try {
    const csvGen = require('../../shared/csv-generator');
    const rows = await projectCostingService.listProjectsCsv(getTenantId(req));
    csvGen.sendCSV(res, rows, null, 'projects.csv');
  } catch (err) { next(err); }
});

router.post('/api/projects', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const result = await projectCostingService.createProject(getTenantId(req), req.body);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/api/projects/:id', async (req, res, next) => {
  try {
    const result = await projectCostingService.getProject(getTenantId(req), req.params.id);
    if (!result) return res.status(404).json({ error: 'Project not found' });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.put('/api/projects/:id', async (req, res, next) => {
  try {
    const result = await projectCostingService.updateProject(getTenantId(req), req.params.id, req.body);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.delete('/api/projects/:id', async (req, res, next) => {
  try {
    await projectCostingService.deleteProject(getTenantId(req), req.params.id);
    res.json({ success: true, message: 'Project deleted' });
  } catch (err) { next(err); }
});

// --- Allocate Cost ---

router.post('/api/projects/:id/allocate-cost', async (req, res, next) => {
  try {
    const { amount } = req.body;
    if (!amount) return res.status(400).json({ error: 'amount required' });
    const result = await projectCostingService.allocateCost(getTenantId(req), req.params.id, req.body);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

// --- Add Revenue ---

router.post('/api/projects/:id/add-revenue', async (req, res, next) => {
  try {
    const { amount } = req.body;
    if (!amount) return res.status(400).json({ error: 'amount required' });
    const result = await projectCostingService.addRevenue(getTenantId(req), req.params.id, req.body);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

// --- Profitability ---

router.get('/api/projects/:id/profitability', async (req, res, next) => {
  try {
    const result = await projectCostingService.getProfitability(getTenantId(req), req.params.id);
    if (!result) return res.status(404).json({ error: 'Project not found' });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// --- Budget vs Actual ---

router.get('/api/projects/:id/budget-vs-actual', async (req, res, next) => {
  try {
    const result = await projectCostingService.getBudgetVsActual(getTenantId(req), req.params.id);
    if (!result) return res.status(404).json({ error: 'Project not found' });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

module.exports = router;
