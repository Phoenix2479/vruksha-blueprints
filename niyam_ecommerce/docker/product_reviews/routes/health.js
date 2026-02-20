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
    service: 'product_reviews',
    description: 'Product reviews, ratings, moderation, and aggregation',
    ready: dbReady
  });
});

// Health check
router.get('/healthz', (req, res) => {
  res.json({ status: 'ok', service: 'product_reviews' });
});

// Readiness check
router.get('/readyz', (req, res) => {
  res.json({
    status: dbReady ? 'ready' : 'not_ready',
    service: 'product_reviews',
    db: dbReady
  });
});

// Stats endpoint
router.get('/stats', (req, res) => {
  res.json({
    uptime: Math.round((Date.now() - started) / 1000),
    service: 'product_reviews',
    version: '1.0.0'
  });
});

module.exports = {
  router,
  setDbReady,
  setStarted
};
