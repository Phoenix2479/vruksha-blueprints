// Return request routes

const express = require('express');
const { getTenantId, getUserId } = require('../middleware/auth');
const { returnService } = require('../services');

const router = express.Router();

// List returns (with filters)
router.get('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { status, customer_id, order_id, page, limit } = req.query;
    const result = await returnService.listReturns(tenantId, {
      status, customer_id, order_id,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20
    });
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

// Get single return with items and exchanges
router.get('/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const result = await returnService.getReturn(tenantId, req.params.id);
    if (!result) {
      return res.status(404).json({ error: 'Return not found' });
    }
    res.json({ success: true, return: result });
  } catch (error) {
    next(error);
  }
});

// Create return request
router.post('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    if (!req.body.order_id) {
      return res.status(400).json({ error: 'order_id is required' });
    }
    const result = await returnService.createReturn(tenantId, req.body);
    res.status(201).json({ success: true, return: result });
  } catch (error) {
    next(error);
  }
});

// Update return status
router.patch('/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    if (!req.body.status) {
      return res.status(400).json({ error: 'status is required' });
    }
    const result = await returnService.updateReturnStatus(tenantId, req.params.id, req.body.status, userId);
    if (!result) {
      return res.status(404).json({ error: 'Return not found' });
    }
    res.json({ success: true, return: result });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
