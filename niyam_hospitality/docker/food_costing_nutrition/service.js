const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
app.use(express.json());
const started = Date.now();
app.get('/healthz', (req,res)=> res.json({ status: 'ok' }));
app.get('/readyz', (req,res)=> res.json({ status: 'ready' }));
app.get('/stats', (req,res)=> res.json({ uptime: Math.round((Date.now()-started)/1000) }));

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

const PORT = process.env.PORT || 8901;
app.listen(PORT, ()=> console.log('service listening on', PORT));
