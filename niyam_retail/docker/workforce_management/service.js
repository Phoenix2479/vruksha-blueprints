const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const { z } = require('zod');
const { Pool } = require('pg');

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8850;
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Ensure Tables
(async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS shifts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        employee_id UUID NOT NULL,
        location_id UUID NOT NULL,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        status TEXT DEFAULT 'scheduled',
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS time_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        employee_id UUID NOT NULL,
        action TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT NOW(),
        location_id UUID
      );
    `);
    console.log('✅ Workforce: Tables initialized');
  } catch (e) { console.error(e); } finally { client.release(); }
})();

function getTenantId(req) { return req.headers['x-tenant-id'] || DEFAULT_TENANT_ID; }

// 1. Manage Shifts
app.post('/shifts', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { employee_id, location_id, start_time, end_time } = req.body;
    
    const result = await pool.query(
      `INSERT INTO shifts (tenant_id, employee_id, location_id, start_time, end_time)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [tenantId, employee_id, location_id, start_time, end_time]
    );
    res.json({ success: true, shift: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/shifts', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { employee_id, from, to } = req.query;
    const result = await pool.query(
      `SELECT * FROM shifts WHERE tenant_id = $1 AND start_time >= $2 AND end_time <= $3`,
      [tenantId, from || '1970-01-01', to || '2100-01-01']
    );
    res.json({ success: true, shifts: result.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. Time Clock
app.post('/time-clock', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { employee_id, action, location_id } = req.body; // action: clock_in, clock_out
    
    await pool.query(
      `INSERT INTO time_logs (tenant_id, employee_id, action, location_id) VALUES ($1, $2, $3, $4)`,
      [tenantId, employee_id, action, location_id]
    );
    
    res.json({ success: true, message: `User ${action} successful`, timestamp: new Date() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. Calculate Commission (Mock)
app.post('/commissions/calculate', async (req, res) => {
  try {
    const { employee_id, period_start, period_end } = req.body;
    // In real system: query POS transactions linked to this employee
    const mockSales = 5000.00;
    const rate = 0.02; // 2%
    res.json({ 
      success: true, 
      employee_id, 
      total_sales: mockSales, 
      commission_amount: mockSales * rate, 
      currency: 'USD' 
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', service: 'workforce_management' });
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
  console.log(`✅ Workforce Management service listening on port ${PORT}`);
});
