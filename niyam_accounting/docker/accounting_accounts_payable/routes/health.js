// Health check routes

const express = require('express');
const router = express.Router();

const started = Date.now();

router.get('/healthz', (req, res) => res.json({ status: 'ok' }));
router.get('/readyz', (req, res) => res.json({ status: 'ready' }));
router.get('/stats', (req, res) => res.json({
  uptime: Math.round((Date.now() - started) / 1000),
  service: 'accounting_accounts_payable',
  version: '1.0.0'
}));

module.exports = router;
