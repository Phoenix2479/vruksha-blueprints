// Health check routes for Integration Bridge

const express = require('express');
const router = express.Router();
const { bridgeService } = require('../services');

router.get('/healthz', (req, res) => {
  const natsConnection = bridgeService.getNatsConnection();
  const retailNatsConnection = bridgeService.getRetailNatsConnection();
  const ecommerceNatsConnection = bridgeService.getEcommerceNatsConnection();

  res.json({
    status: 'ok',
    service: 'accounting_integration_bridge',
    nats_connected: !!natsConnection,
    retail_nats_connected: !!retailNatsConnection,
    ecommerce_nats_connected: !!ecommerceNatsConnection,
    mode: (retailNatsConnection || ecommerceNatsConnection) ? 'integrated' : 'standalone'
  });
});

router.get('/readyz', (req, res) => {
  const natsConnection = bridgeService.getNatsConnection();
  if (natsConnection) {
    res.json({ status: 'ready' });
  } else {
    res.status(503).json({ status: 'not_ready', reason: 'NATS not connected' });
  }
});

module.exports = router;
