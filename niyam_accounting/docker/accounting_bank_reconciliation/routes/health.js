/**
 * Health check routes for accounting_bank_reconciliation
 */

const { Router } = require('express');
const router = Router();

const started = Date.now();

router.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

router.get('/readyz', (_req, res) => res.json({ status: 'ready' }));

router.get('/stats', (_req, res) => res.json({
  uptime: Math.round((Date.now() - started) / 1000),
  service: 'accounting_bank_reconciliation',
  version: '1.0.0'
}));

module.exports = router;
