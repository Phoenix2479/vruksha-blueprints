/**
 * Partner Integration Hub Service - Niyam Hospitality (Max Lite)
 * Stub service - implement when needed
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8959;
const SERVICE_NAME = 'partner_integration_hub';

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) { app.use(express.static(uiPath)); }

// Health endpoints
app.get('/health', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME, mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME }));
app.get('/readyz', (req, res) => res.json({ status: 'ready', service: SERVICE_NAME }));

// Service info
app.get('/', (req, res) => res.json({
  service: SERVICE_NAME,
  name: 'Partner Integration Hub',
  version: '1.0.0',
  mode: 'lite',
  status: 'stub - implement when needed'
}));

// Placeholder endpoints
app.get('/api/partner_integration_hub', (req, res) => {
  res.json({ success: true, message: 'Stub endpoint - implement business logic', items: [] });
});

app.post('/api/partner_integration_hub', (req, res) => {
  res.status(201).json({ success: true, message: 'Created (stub)', data: req.body });
});

// Catch-all for UI
app.get('*', (req, res) => {
  if (fs.existsSync(path.join(uiPath, 'index.html'))) {
    res.sendFile(path.join(uiPath, 'index.html'));
  } else {
    res.json({ service: SERVICE_NAME, mode: 'lite', status: 'running (stub)' });
  }
});

app.listen(PORT, () => console.log(`✅ ${SERVICE_NAME} (Lite Stub) running on port ${PORT}`));
