// Exchange routes

const express = require('express');
const { getTenantId } = require('../middleware/auth');
const { exchangeService } = require('../services');

const router = express.Router();

// Create exchange for a return
router.post('/:id/exchange', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    if (!req.body.original_product_id || !req.body.new_product_id) {
      return res.status(400).json({ error: 'original_product_id and new_product_id are required' });
    }
    const result = await exchangeService.createExchange(tenantId, req.params.id, req.body);
    if (!result) {
      return res.status(404).json({ error: 'Return not found' });
    }
    res.status(201).json({ success: true, exchange: result });
  } catch (error) {
    next(error);
  }
});

// List exchanges for a return
router.get('/:id/exchanges', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const exchanges = await exchangeService.listExchanges(tenantId, req.params.id);
    res.json({ success: true, exchanges });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
