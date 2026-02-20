// Journal Entries Service - Thin entry point
// Features: Double-entry bookkeeping, validation, posting, recurring entries

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { PORT } = require('./config/constants');
const { router: healthRouter, setDbReady, setStarted } = require('./routes/health');
const journalsRoutes = require('./routes/journals');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'] }));
app.use(express.json());

const started = Date.now();
setStarted(started);

app.use((req, res, next) => {
  console.log(`[JournalEntries] ${req.method} ${req.path}`);
  next();
});

// Mount routes
app.use(healthRouter);
app.use(journalsRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error('[JournalEntries] Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`\n  Journal Entries service listening on port ${PORT}`);
  console.log(`  http://localhost:${PORT}\n`);
});

// Run DB migrations and mark ready
(async () => {
  try {
    const { runMigrations } = require('./db/init');
    await runMigrations();
    setDbReady(true);
    console.log('[JournalEntries] DB ready');
  } catch (err) {
    console.error('[JournalEntries] DB init failed:', err.message);
  }
})();
