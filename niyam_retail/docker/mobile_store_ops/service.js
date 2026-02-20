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

const PORT = process.env.PORT || 8880;

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// 1. Product Scan (Lookup)
app.get('/products/scan/:barcode', async (req, res) => {
  try {
    const { barcode } = req.params;
    const result = await pool.query(
      `SELECT p.*, i.quantity, i.bin_location 
       FROM products p 
       LEFT JOIN inventory i ON p.id = i.product_id 
       WHERE p.sku = $1 OR p.barcode = $1`,
      [barcode]
    );
    
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    
    res.json({ success: true, product: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. Cycle Count (Update Stock)
app.post('/inventory/count', async (req, res) => {
  try {
    const { product_id, counted_qty, location_id } = req.body;
    
    // Update inventory table
    await pool.query(
      `UPDATE inventory SET quantity = $1, last_counted_at = NOW() WHERE product_id = $2 AND store_id = $3`,
      [counted_qty, product_id, location_id]
    );
    
    res.json({ success: true, message: 'Stock updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. My Tasks
app.get('/tasks/my', async (req, res) => {
  try {
    // Mock tasks
    const tasks = [
      { id: 1, title: 'Restock Aisle 4', status: 'pending' },
      { id: 2, title: 'Cycle Count: Dairy', status: 'in_progress' }
    ];
    res.json({ success: true, tasks });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', service: 'mobile_store_ops' });
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
  console.log(`✅ Mobile Store Ops service listening on port ${PORT}`);
});
