// Fiscal Periods route handlers

const express = require('express');
const router = express.Router();
const { getTenantId } = require('../middleware/auth');
const periodsService = require('../services/periodsService');

// =============================================================================
// FISCAL YEAR ENDPOINTS
// =============================================================================

// List fiscal years
router.get('/fiscal-years', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { is_active } = req.query;

    const rows = await periodsService.listFiscalYears(tenantId, { is_active });
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

// Get current fiscal year (MUST be before /:id to avoid greedy matching)
router.get('/fiscal-years/current', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);

    const data = await periodsService.getCurrentFiscalYear(tenantId);

    if (!data) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'No active fiscal year found' } });
    }

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Get single fiscal year with periods
router.get('/fiscal-years/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    const data = await periodsService.getFiscalYear(tenantId, id);

    if (!data) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Fiscal year not found' } });
    }

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Create fiscal year with periods
router.post('/fiscal-years', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);

    const result = await periodsService.createFiscalYear(tenantId, req.body);

    if (result.error) {
      return res.status(result.status).json({ success: false, error: { code: result.code, message: result.error } });
    }

    res.status(201).json({ success: true, data: result.data });
  } catch (error) {
    next(error);
  }
});

// Update fiscal year
router.put('/fiscal-years/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    const result = await periodsService.updateFiscalYear(tenantId, id, req.body);

    if (result.error) {
      return res.status(result.status).json({ success: false, error: { code: result.code, message: result.error } });
    }

    res.json({ success: true, data: result.data });
  } catch (error) {
    next(error);
  }
});

// Close fiscal year (year-end closing)
router.post('/fiscal-years/:id/close', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    const result = await periodsService.closeFiscalYear(tenantId, id, req.body);

    if (result.error) {
      return res.status(result.status).json({ success: false, error: { code: result.code, message: result.error } });
    }

    res.json({ success: true, data: result.data });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// FISCAL PERIOD ENDPOINTS
// =============================================================================

// List periods
router.get('/periods', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { fiscal_year_id, status } = req.query;

    const rows = await periodsService.listPeriods(tenantId, { fiscal_year_id, status });
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

// Get current period
router.get('/periods/current', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);

    const data = await periodsService.getCurrentPeriod(tenantId);

    if (!data) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'No open period found for current date' } });
    }

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Close period
router.post('/periods/:id/close', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { force = false } = req.body;

    const result = await periodsService.closePeriod(tenantId, id, { force });

    if (result.error) {
      return res.status(result.status).json({ success: false, error: { code: result.code, message: result.error } });
    }

    res.json({ success: true, data: result.data });
  } catch (error) {
    next(error);
  }
});

// Reopen period
router.post('/periods/:id/reopen', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    const result = await periodsService.reopenPeriod(tenantId, id);

    if (result.error) {
      return res.status(result.status).json({ success: false, error: { code: result.code, message: result.error } });
    }

    res.json({ success: true, data: result.data });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// BUDGET ENDPOINTS
// =============================================================================

// List budgets
router.get('/budgets', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { fiscal_year_id, status } = req.query;

    const rows = await periodsService.listBudgets(tenantId, { fiscal_year_id, status });
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

// Get budget with lines
router.get('/budgets/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    const data = await periodsService.getBudget(tenantId, id);

    if (!data) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Budget not found' } });
    }

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Create budget
router.post('/budgets', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);

    const result = await periodsService.createBudget(tenantId, req.body);

    if (result.error) {
      return res.status(result.status).json({ success: false, error: { code: result.code, message: result.error } });
    }

    res.status(201).json({ success: true, data: result.data });
  } catch (error) {
    next(error);
  }
});

// Add budget line
router.post('/budgets/:budgetId/lines', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { budgetId } = req.params;

    const result = await periodsService.addBudgetLine(tenantId, budgetId, req.body);

    if (result.error) {
      return res.status(result.status).json({ success: false, error: { code: result.code, message: result.error } });
    }

    res.status(201).json({ success: true, data: result.data });
  } catch (error) {
    next(error);
  }
});

// Approve budget
router.post('/budgets/:id/approve', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    const result = await periodsService.approveBudget(tenantId, id);

    if (result.error) {
      return res.status(result.status).json({ success: false, error: { code: result.code, message: result.error } });
    }

    res.json({ success: true, data: result.data });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// COST CENTER ENDPOINTS
// =============================================================================

// List cost centers
router.get('/cost-centers', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { is_active } = req.query;

    const rows = await periodsService.listCostCenters(tenantId, { is_active });
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

// Create cost center
router.post('/cost-centers', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);

    const result = await periodsService.createCostCenter(tenantId, req.body);

    if (result.error) {
      return res.status(result.status).json({ success: false, error: { code: result.code, message: result.error } });
    }

    res.status(201).json({ success: true, data: result.data });
  } catch (error) {
    next(error);
  }
});

// Update cost center
router.put('/cost-centers/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    const result = await periodsService.updateCostCenter(tenantId, id, req.body);

    if (result.error) {
      return res.status(result.status).json({ success: false, error: { code: result.code, message: result.error } });
    }

    res.json({ success: true, data: result.data });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// CSV EXPORT ENDPOINTS
// =============================================================================

router.get('/fiscal-years/export/csv', async (req, res, next) => {
  try {
    const csvGen = require('../../shared/csv-generator');
    const tenantId = getTenantId(req);
    const rows = await periodsService.getFiscalYearsCSVData(tenantId);
    csvGen.sendCSV(res, rows, null, 'fiscal-years.csv');
  } catch (e) { next(e); }
});

router.get('/periods/export/csv', async (req, res, next) => {
  try {
    const csvGen = require('../../shared/csv-generator');
    const tenantId = getTenantId(req);
    const rows = await periodsService.getPeriodsCSVData(tenantId);
    csvGen.sendCSV(res, rows, null, 'fiscal-periods.csv');
  } catch (e) { next(e); }
});

module.exports = router;
