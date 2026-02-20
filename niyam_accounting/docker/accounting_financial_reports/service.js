// Financial Reports Service - Thin entry point
// Generates: Balance Sheet, P&L, Trial Balance, Cash Flow, Custom reports

const express = require('express');
const helmet = require('helmet');

const { PORT } = require('./config/constants');
const { router: healthRouter, setDbReady, setStarted } = require('./routes/health');
const reportsRoutes = require('./routes/reports');

const app = express();

app.use(helmet());
app.use(express.json());

const started = Date.now();
setStarted(started);

// Mount routes
app.use(healthRouter);
app.use(reportsRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error('Financial Reports Error:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'development' ? err.message : 'An internal error occurred'
    }
  });
});

app.listen(PORT, () => {
  console.log(`Financial Reports service listening on port ${PORT}`);
});

// Run DB migrations and mark ready
(async () => {
  try {
    const { runMigrations } = require('./db/init');
    await runMigrations();
    setDbReady(true);
    console.log('[FinancialReports] DB ready');
  } catch (err) {
    console.error('[FinancialReports] DB init failed:', err.message);
  }
})();

module.exports = app;
