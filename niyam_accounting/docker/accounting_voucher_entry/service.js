// Voucher Entry Service - Docker/Postgres
// Port: 8850
// Tally-style unified voucher entry: Sales, Purchase, Payment, Receipt, Contra, Journal

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

let db;
try { db = require('../../../../db/postgres'); } catch (_) { db = require('@vruksha/platform/db/postgres'); }

const { PORT } = require('./config/constants');
const { healthRouter, vouchersRouter, setDbReady, setStarted } = require('./routes');

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization','X-Tenant-ID'] }));
app.use(express.json({ limit: '10mb' }));
app.use((req, _res, next) => { console.log(`[VoucherEntry] ${req.method} ${req.path}`); next(); });

app.use('/', healthRouter);
app.use('/', vouchersRouter);

app.use((err, req, res, _next) => {
  console.error(`[VoucherEntry] Error:`, err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const port = PORT;
app.listen(port, () => {
  console.log(`\nVoucher Entry service on port ${port}`);
  console.log(`Endpoints: /api/voucher-types, /api/vouchers, /api/recurring, /api/accounts, /api/parties`);
  setStarted();
});

const { runMigrations } = require('./db/init');
runMigrations().then(() => setDbReady()).catch(err => console.error('Migration failed:', err));
