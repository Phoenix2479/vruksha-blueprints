// Product analytics routes

const express = require('express');
const { getTenantId } = require('../middleware');
const { productAnalyticsService } = require('../services');

const router = express.Router();

// GET /api/analytics/products/top - top products by revenue or units
router.get('/top', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { sort_by, limit, start_date, end_date } = req.query;
    const products = await productAnalyticsService.getTopProducts(tenantId, { sort_by, limit, start_date, end_date });
    res.json({ success: true, data: products });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
