/**
 * Accounting Bank Reconciliation Service
 * Port: 8840
 *
 * Handles bank account management and reconciliation:
 * - Bank account CRUD operations
 * - Bank transaction import and management
 * - Automatic and manual transaction matching
 * - Reconciliation workflows and statements
 * - Unreconciled item tracking
 */

const express = require('express');
const helmet = require('helmet');
const { PORT } = require('./config/constants');
const {
  healthRouter,
  bankAccountsRouter,
  transactionsRouter,
  reconciliationRouter,
  matchingRouter,
  reportsRouter
} = require('./routes');

const app = express();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(helmet());
app.use(express.json({ limit: '10mb' }));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use(healthRouter);
app.use(bankAccountsRouter);
app.use(transactionsRouter);
app.use(reconciliationRouter);
app.use(matchingRouter);
app.use(reportsRouter);

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------
app.use((err, req, res, _next) => {
  console.error('Bank Reconciliation Error:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'development' ? err.message : 'An internal error occurred'
    }
  });
});

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
app.listen(PORT, () => console.log(`Bank Reconciliation service listening on port ${PORT}`));

module.exports = app;
