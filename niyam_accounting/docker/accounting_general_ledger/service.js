// General Ledger Service - Thin entry point
// Features: Ledger entries, account history, period balances, reporting

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { PORT } = require('./config/constants');
const { router: healthRouter, setDbReady, setStarted } = require('./routes/health');
const ledgerRoutes = require('./routes/ledger');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'] }));
app.use(express.json());

const started = Date.now();
setStarted(started);

app.use((req, res, next) => {
  console.log(`[GeneralLedger] ${req.method} ${req.path}`);
  next();
});

// Mount routes
app.use(healthRouter);
app.use(ledgerRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error('[GeneralLedger] Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`\n  General Ledger service listening on port ${PORT}`);
  console.log(`  http://localhost:${PORT}\n`);
});

// Run DB migrations and mark ready
(async () => {
  try {
    const { runMigrations } = require('./db/init');
    await runMigrations();
    setDbReady(true);
    console.log('[GeneralLedger] DB ready');
  } catch (err) {
    console.error('[GeneralLedger] DB init failed:', err.message);
  }
})();
