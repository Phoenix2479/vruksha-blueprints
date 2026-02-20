// Inventory Valuation Service - Docker/Postgres
// Port: 8854 | FIFO/LIFO/Weighted Average costing

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { PORT, ALLOW_ALL_CORS } = require('./config/constants');
const { healthRouter, valuationRouter, setDbReady, setStarted } = require('./routes');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: ALLOW_ALL_CORS ? true : undefined, methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization','X-Tenant-ID'] }));
app.use(express.json());
app.use((req, _r, next) => { console.log(`[InventoryValuation] ${req.method} ${req.path}`); next(); });

// Mount routes
app.use('/', healthRouter);
app.use('/', valuationRouter);

// Error handler
app.use((err, req, res, _next) => {
  console.error('[InventoryValuation] Error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const port = PORT;
app.listen(port, () => { console.log(`Inventory Valuation service on port ${port}`); setStarted(); });

// DB readiness
const { runMigrations } = require('./db/init');
runMigrations().then(() => setDbReady()).catch(err => console.error('Migration failed:', err));
