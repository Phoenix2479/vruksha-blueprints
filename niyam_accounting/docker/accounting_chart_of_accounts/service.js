// Chart of Accounts Service - Thin entry point
// All business logic in services/, all route handlers in routes/

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { PORT, ALLOW_ALL_CORS } = require('./config/constants');
const { mountRoutes } = require('./routes');

const app = express();

// Security & CORS
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: (origin, cb) => {
    if (ALLOW_ALL_CORS || !origin) return cb(null, true);
    return cb(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
}));
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`[ChartOfAccounts] ${req.method} ${req.path}`);
  next();
});

// Mount all routes
mountRoutes(app);

// Error handler
app.use((err, req, res, next) => {
  console.error('[ChartOfAccounts] Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\nChart of Accounts service listening on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  GET    /account-types             - List account types`);
  console.log(`  POST   /account-types             - Create account type`);
  console.log(`  GET    /accounts                  - List accounts (hierarchical)`);
  console.log(`  GET    /accounts/:id              - Get account`);
  console.log(`  GET    /accounts/code/:code       - Get account by code`);
  console.log(`  POST   /accounts                  - Create account`);
  console.log(`  PUT    /accounts/:id              - Update account`);
  console.log(`  DELETE /accounts/:id              - Delete (deactivate) account`);
  console.log(`  GET    /accounts/:id/balance      - Get account balance`);
  console.log(`  GET    /trial-balance             - Get trial balance`);
  console.log(`  GET    /search?q=                 - Search accounts`);
  console.log(`  GET    /postable-accounts         - Get postable accounts`);
  console.log(`  GET    /export                    - Export chart of accounts`);
  console.log(`  POST   /import                    - Bulk import accounts`);
  console.log(`  GET    /healthz                   - Health check\n`);
});
