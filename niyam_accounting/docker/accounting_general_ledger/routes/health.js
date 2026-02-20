// Health check routes for General Ledger service

const express = require('express');
const router = express.Router();

let dbReady = false;
let startedAt = Date.now();

function setDbReady(val) { dbReady = val; }
function setStarted(ts) { startedAt = ts; }

router.get('/healthz', (req, res) => {
  res.json({ status: 'ok', service: 'accounting_general_ledger' });
});

router.get('/readyz', (req, res) => {
  if (dbReady) {
    res.json({ status: 'ready', service: 'accounting_general_ledger' });
  } else {
    res.status(503).json({ status: 'not_ready', service: 'accounting_general_ledger' });
  }
});

router.get('/stats', (req, res) => {
  res.json({
    uptime: Math.round((Date.now() - startedAt) / 1000),
    service: 'accounting_general_ledger',
    version: '1.0.0'
  });
});

module.exports = { router, setDbReady, setStarted };
