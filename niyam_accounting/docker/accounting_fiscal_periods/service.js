// Fiscal Periods Service - Thin entry point
// Manages: Fiscal years, periods, year-end closing, budgets, cost centers

const express = require('express');
const helmet = require('helmet');

const { PORT } = require('./config/constants');
const { router: healthRouter, setDbReady, setStarted } = require('./routes/health');
const periodsRoutes = require('./routes/periods');

const app = express();

app.use(helmet());
app.use(express.json());

const started = Date.now();
setStarted(started);

// Mount routes
app.use(healthRouter);
app.use(periodsRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error('Fiscal Periods Error:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'development' ? err.message : 'An internal error occurred'
    }
  });
});

app.listen(PORT, () => {
  console.log(`Fiscal Periods service listening on port ${PORT}`);
});

// Run DB migrations and mark ready
(async () => {
  try {
    const { runMigrations } = require('./db/init');
    await runMigrations();
    setDbReady(true);
    console.log('[FiscalPeriods] DB ready');
  } catch (err) {
    console.error('[FiscalPeriods] DB init failed:', err.message);
  }
})();

module.exports = app;
