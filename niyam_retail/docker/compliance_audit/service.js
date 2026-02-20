const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8870;

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Ensure Audit Table
(async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS compliance_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        details JSONB,
        actor_id UUID,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ Compliance: Tables initialized');
  } catch (e) { console.error(e); } finally { client.release(); }
})();

// 1. View Logs
app.get('/logs', async (req, res) => {
  try {
    const { entity_type, entity_id } = req.query;
    let query = 'SELECT * FROM compliance_logs WHERE 1=1';
    const params = [];
    if (entity_type) {
      params.push(entity_type);
      query += ` AND entity_type = $${params.length}`;
    }
    query += ' ORDER BY created_at DESC LIMIT 50';
    const result = await pool.query(query, params);
    res.json({ success: true, logs: result.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. Age Verification
app.post('/verify-age', async (req, res) => {
  try {
    const { dob, transaction_id } = req.body;
    const birthDate = new Date(dob);
    const ageDifMs = Date.now() - birthDate.getTime();
    const ageDate = new Date(ageDifMs);
    const age = Math.abs(ageDate.getUTCFullYear() - 1970);
    
    const allowed = age >= 18; // Example rule
    
    // Log check
    await pool.query(
      `INSERT INTO compliance_logs (entity_type, entity_id, action, details) VALUES ($1, $2, $3, $4)`,
      ['transaction', transaction_id, 'age_check', JSON.stringify({ age, allowed })]
    );
    
    res.json({ success: true, allowed, age });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. Track Hazmat
app.post('/hazmat/track', async (req, res) => {
  try {
    const { item_id, location_id, status } = req.body;
    await pool.query(
      `INSERT INTO compliance_logs (entity_type, entity_id, action, details) VALUES ($1, $2, $3, $4)`,
      ['inventory_item', item_id, 'hazmat_update', JSON.stringify({ location_id, status })]
    );
    res.json({ success: true, message: 'Hazmat status logged' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', service: 'compliance_audit' });
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

app.listen(PORT, () => {
  console.log(`✅ Compliance & Audit service listening on port ${PORT}`);
});
