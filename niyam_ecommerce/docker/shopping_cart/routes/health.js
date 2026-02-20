// Health and status routes

const express = require('express');

const router = express.Router();

let started = Date.now();
let dbReady = false;

function setDbReady(ready) {
  dbReady = ready;
}

function setStarted(time) {
  started = time;
}

// Status endpoint
router.get('/status', async (req, res) => {
  res.json({
    success: true,
    service: 'shopping_cart',
    description: 'Shopping cart management with item tracking, coupons, and abandonment detection',
    ready: dbReady
  });
});

// Health check
router.get('/healthz', (req, res) => {
  res.json({ status: 'ok', service: 'shopping_cart' });
});

// Readiness check
router.get('/readyz', (req, res) => {
  res.json({
    status: dbReady ? 'ready' : 'not_ready',
    service: 'shopping_cart',
    db: dbReady
  });
});

// Stats endpoint
router.get('/stats', (req, res) => {
  res.json({
    uptime: Math.round((Date.now() - started) / 1000),
    service: 'shopping_cart',
    version: '1.0.0'
  });
});

module.exports = {
  router,
  setDbReady,
  setStarted
};
