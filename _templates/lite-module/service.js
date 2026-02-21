const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 0; // Replace 0 with your assigned port

app.use(cors()); // Open CORS — intentional for local desktop use
app.use(express.json());

// Serve static UI build if present
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

// Health endpoint (required by Vruksha)
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'your_module_id', mode: 'lite' }));

// Your routes
app.use('/', require('./routes'));

// SPA fallback — serve index.html for non-API routes only
app.get(/^(?!\/api\/).*/, (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'your_module_id', mode: 'lite', status: 'running' });
});

// Initialize database, then start server
initDb()
  .then(() => app.listen(PORT, () => console.log(`[Your Module Name Lite] Running on http://localhost:${PORT}`)))
  .catch((err) => { console.error('Failed to start:', err); process.exit(1); });
