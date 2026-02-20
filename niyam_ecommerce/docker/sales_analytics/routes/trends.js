// Trend analysis routes

const express = require('express');
const { getTenantId } = require('../middleware');
const { trendService } = require('../services');

const router = express.Router();

// GET /api/analytics/trends - revenue by day/week/month for date range
router.get('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { group_by, start_date, end_date } = req.query;
    const trends = await trendService.getTrends(tenantId, { group_by, start_date, end_date });
    res.json({ success: true, data: trends });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
