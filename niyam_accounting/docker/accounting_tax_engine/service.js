/**
 * Accounting Tax Engine Service
 * Port: 8844
 *
 * Handles Indian tax compliance:
 * - GST (CGST, SGST, IGST, Cess) calculations
 * - TDS (Tax Deducted at Source) management
 * - TCS (Tax Collected at Source) management
 * - GST return data preparation (GSTR-1, GSTR-3B)
 * - Tax code management
 * - HSN/SAC code validation
 */

const express = require('express');
const helmet = require('helmet');
const { PORT } = require('./config/constants');
const {
  healthRouter,
  taxCodesRouter,
  tdsRouter,
  gstReturnsRouter,
  validationRouter,
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
app.use(taxCodesRouter);
app.use(tdsRouter);
app.use(gstReturnsRouter);
app.use(validationRouter);
app.use(reportsRouter);

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------
app.use((err, req, res, _next) => {
  console.error('Tax Engine Error:', err);
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
app.listen(PORT, () => console.log(`Tax Engine service listening on port ${PORT}`));

module.exports = app;
