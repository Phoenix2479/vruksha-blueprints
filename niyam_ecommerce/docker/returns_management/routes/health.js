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

router.get('/status', async (req, res) => {
  res.json({
    success: true,
    service: 'returns_management',
    description: 'Return requests, refund processing, and exchange management',
    ready: dbReady
  });
});

router.get('/healthz', (req, res) => {
  res.json({ status: 'ok', service: 'returns_management' });
});

router.get('/readyz', (req, res) => {
  res.json({
    status: dbReady ? 'ready' : 'not_ready',
    service: 'returns_management',
    db: dbReady
  });
});

router.get('/stats', (req, res) => {
  res.json({
    uptime: Math.round((Date.now() - started) / 1000),
    service: 'returns_management',
    version: '1.0.0'
  });
});

module.exports = {
  router,
  setDbReady,
  setStarted
};
