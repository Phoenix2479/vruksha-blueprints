// Guest DNA & Affinity Engine - Stub Service
// Auto-generated for Docker deployment - Replace with actual implementation

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');

const app = express();

// ============================================
// SERVE EMBEDDED UI (Auto-generated)
// ============================================

const UI_DIST = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(UI_DIST)) {
  console.log('📦 Serving embedded UI from ui/dist');
  app.use(express.static(UI_DIST));
  
  // SPA fallback - serve index.html for non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || 
        req.path.startsWith('/health') ||
        req.path.startsWith('/metrics') ||
        req.path.startsWith('/readyz')) {
      return next();
    }
    res.sendFile(path.join(UI_DIST, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('<html><body style="font-family:system-ui;text-align:center;padding:2rem;"><h1>Service Running</h1><p><a href="/healthz">Health Check</a></p></body></html>');
  });
}

const PORT = process.env.PORT || 8850;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

// Health endpoints
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'guest_dna' }));
app.get('/readyz', (req, res) => res.json({ status: 'ready', service: 'guest_dna' }));

// Basic info endpoint
app.get('/', (req, res) => res.json({ 
  service: 'guest_dna',
  name: 'Guest DNA & Affinity Engine',
  version: '1.0.0',
  status: 'stub - replace with implementation'
}));

// Placeholder API endpoints
app.get('/api/guest_dna', (req, res) => {
  res.json({ message: 'Stub endpoint - implement business logic here', items: [] });
});

app.post('/api/guest_dna', (req, res) => {
  res.status(201).json({ message: 'Created (stub)', data: req.body });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Guest DNA & Affinity Engine running on port ${PORT}`);
});
