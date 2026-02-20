// Health check routes for Journal Entries service

const express = require('express');
const router = express.Router();

let dbReady = false;
let startedAt = Date.now();

function setDbReady(val) { dbReady = val; }
function setStarted(ts) { startedAt = ts; }

router.get('/healthz', (req, res) => {
  res.json({ status: 'ok', service: 'accounting_journal_entries' });
});

router.get('/readyz', (req, res) => {
  if (dbReady) {
    res.json({ status: 'ready', service: 'accounting_journal_entries' });
  } else {
    res.status(503).json({ status: 'not_ready', service: 'accounting_journal_entries' });
  }
});

router.get('/stats', (req, res) => {
  res.json({
    uptime: Math.round((Date.now() - startedAt) / 1000),
    service: 'accounting_journal_entries',
    version: '1.0.0'
  });
});

module.exports = { router, setDbReady, setStarted };
