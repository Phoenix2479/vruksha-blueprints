// Health check routes for Fiscal Periods service

const express = require('express');
const router = express.Router();

let dbReady = false;
let startedAt = Date.now();

function setDbReady(val) { dbReady = val; }
function setStarted(ts) { startedAt = ts; }

router.get('/healthz', (req, res) => {
  res.json({ status: 'ok', service: 'accounting_fiscal_periods' });
});

router.get('/readyz', (req, res) => {
  if (dbReady) {
    res.json({ status: 'ready', service: 'accounting_fiscal_periods' });
  } else {
    res.status(503).json({ status: 'not_ready', service: 'accounting_fiscal_periods' });
  }
});

router.get('/stats', (req, res) => {
  res.json({
    uptime: Math.round((Date.now() - startedAt) / 1000),
    service: 'accounting_fiscal_periods',
    version: '1.0.0'
  });
});

module.exports = { router, setDbReady, setStarted };
