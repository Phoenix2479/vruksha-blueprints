// Fixed Assets + Depreciation Service - Docker/Postgres
// Port: 8856 | SLM, WDV, UoP depreciation methods

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

let db;
try { db = require('../../../../db/postgres'); } catch (_) { db = require('@vruksha/platform/db/postgres'); }

const { PORT } = require('./config/constants');
const { healthRouter, assetsRouter, setDbReady, setStarted } = require('./routes');

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization','X-Tenant-ID'] }));
app.use(express.json());
app.use((req, _r, next) => { console.log(`[FixedAssets] ${req.method} ${req.path}`); next(); });

app.use('/', healthRouter);
app.use('/', assetsRouter);

app.use((err, req, res, _next) => {
  console.error(`[FixedAssets] Error:`, err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const port = PORT;
app.listen(port, () => { console.log(`Fixed Assets service on port ${port}`); setStarted(); });

const { runMigrations } = require('./db/init');
runMigrations().then(() => setDbReady()).catch(err => console.error('Migration failed:', err));
