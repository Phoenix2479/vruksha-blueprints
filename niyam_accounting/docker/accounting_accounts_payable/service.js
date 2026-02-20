/**
 * Accounting Accounts Payable Service - Thin entry point
 * All business logic in services/, all route handlers in routes/
 */

const express = require('express');
const helmet = require('helmet');

const { PORT } = require('./config/constants');
const { mountRoutes } = require('./routes');

const app = express();
app.use(helmet());
app.use(express.json({ limit: '10mb' }));

// Mount all routes
mountRoutes(app);

// Error handler
app.use((err, req, res, next) => {
  console.error('Accounts Payable Error:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'development' ? err.message : 'An internal error occurred'
    }
  });
});

// Start server
app.listen(PORT, () => console.log(`Accounts Payable service listening on port ${PORT}`));

module.exports = app;
