// Niyam Retail Suite - Stub Service
// Auto-generated for Docker deployment - Replace with actual implementation

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 8838;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

// Health endpoints
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'niyam_retail_suite' }));
app.get('/readyz', (req, res) => res.json({ status: 'ready', service: 'niyam_retail_suite' }));

// Basic info endpoint
app.get('/', (req, res) => res.json({ 
  service: 'niyam_retail_suite',
  name: 'Niyam Retail Suite',
  version: '1.0.0',
  status: 'stub - replace with implementation'
}));

// Placeholder API endpoints
app.get('/api/niyam_retail_suite', (req, res) => {
  res.json({ message: 'Stub endpoint - implement business logic here', items: [] });
});

app.post('/api/niyam_retail_suite', (req, res) => {
  res.status(201).json({ message: 'Created (stub)', data: req.body });
});


// Serve embedded UI from ui/dist if it exists
const UI_DIST_PATH = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(UI_DIST_PATH)) {
  console.log('📦 Serving embedded UI from ui/dist');
  app.use(express.static(UI_DIST_PATH));
  
  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || 
        req.path.startsWith('/health') ||
        req.path.startsWith('/metrics')) {
      return next();
    }
    res.sendFile(path.join(UI_DIST_PATH, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Niyam Retail Suite running on port ${PORT}`);
});
