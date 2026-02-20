// Stock alert routes

const express = require('express');
const { getTenantId } = require('../middleware');
const { alertService } = require('../services');

const router = express.Router();

// List alerts
router.get('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { is_read, product_id, type, limit, offset } = req.query;
    const alerts = await alertService.listAlerts(tenantId, { is_read, product_id, type, limit, offset });
    res.json({ success: true, data: alerts });
  } catch (error) {
    next(error);
  }
});

// Mark alert as read
router.patch('/:id/read', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const result = await alertService.markRead(tenantId, req.params.id);
    if (!result.success) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: result.error } });
    }
    res.json({ success: true, data: result.alert });
  } catch (error) {
    next(error);
  }
});

// Mark all alerts as read
router.post('/mark-all-read', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const result = await alertService.markAllRead(tenantId);
    res.json({ success: true, data: { updated: result.updated } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
