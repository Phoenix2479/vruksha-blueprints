const express = require('express');
const router = express.Router();

let dbReady = false, started = false;

router.get('/healthz', (_req, res) => res.json({ status: 'ok', service: 'accounting_voucher_entry', timestamp: new Date().toISOString() }));

router.get('/readyz', (_req, res) => {
  const ready = dbReady && started;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', checks: { db: dbReady, started } });
});

router.get('/stats', (_req, res) => res.json({ service: 'accounting_voucher_entry', uptime: process.uptime(), version: '0.1.0' }));

module.exports = { router, setDbReady() { dbReady = true; }, setStarted() { started = true; } };
