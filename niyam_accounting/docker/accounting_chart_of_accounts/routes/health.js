// Health check routes

const express = require('express');
const router = express.Router();

let db;
try {
  db = require('../../../../../db/postgres');
} catch (_) {
  db = require('@vruksha/platform/db/postgres');
}

const { query } = db;
const started = Date.now();

router.get('/healthz', (req, res) => {
  res.json({ status: 'ok', service: 'accounting_chart_of_accounts' });
});

router.get('/readyz', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ready', service: 'accounting_chart_of_accounts' });
  } catch (e) {
    res.status(503).json({ status: 'not_ready', error: e.message });
  }
});

router.get('/stats', (req, res) => {
  res.json({
    uptime: Math.round((Date.now() - started) / 1000),
    service: 'accounting_chart_of_accounts',
    version: '1.0.0'
  });
});

module.exports = router;
