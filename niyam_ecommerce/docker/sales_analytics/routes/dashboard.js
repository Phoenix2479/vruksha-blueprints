// Dashboard KPI routes

const express = require('express');
const { getTenantId } = require('../middleware');
const { dashboardService } = require('../services');

const router = express.Router();

// GET /api/dashboard/kpis - total revenue, order count, avg order value, refund rate
router.get('/kpis', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { start_date, end_date } = req.query;
    const kpis = await dashboardService.getKPIs(tenantId, { start_date, end_date });
    res.json({ success: true, data: kpis });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
