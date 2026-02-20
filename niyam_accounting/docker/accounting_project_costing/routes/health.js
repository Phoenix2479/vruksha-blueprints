// Health, readiness, and stats endpoints for accounting_project_costing

const express = require('express');
const router = express.Router();
let dbReady = false, started = false;

router.get('/healthz', (req, res) =>
  res.json({ status: 'ok', service: 'accounting_project_costing', timestamp: new Date().toISOString() }));

router.get('/readyz', (req, res) => {
  const ready = dbReady && started;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', checks: { db: dbReady, started } });
});

router.get('/stats', (req, res) =>
  res.json({ service: 'accounting_project_costing', uptime: process.uptime(), version: '0.1.0' }));

function setDbReady() { dbReady = true; }
function setStarted() { started = true; }

module.exports = { router, setDbReady, setStarted };
