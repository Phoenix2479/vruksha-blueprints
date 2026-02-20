const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8869;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'vendor_management', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'vendor_management' }));

// === VENDORS/SUPPLIERS ===
app.get('/vendors', (req, res) => {
  try {
    const { active = '1', rating_min } = req.query;
    let sql = 'SELECT * FROM suppliers WHERE active = ?';
    const params = [parseInt(active)];
    if (rating_min) { sql += ' AND rating >= ?'; params.push(parseFloat(rating_min)); }
    sql += ' ORDER BY name';
    res.json({ success: true, vendors: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/vendors/:id', (req, res) => {
  try {
    const vendor = get('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor not found' });
    const orders = query('SELECT * FROM purchase_orders WHERE supplier_id = ? ORDER BY created_at DESC LIMIT 20', [req.params.id]);
    const ratings = query('SELECT * FROM supplier_ratings WHERE supplier_id = ? ORDER BY created_at DESC LIMIT 10', [req.params.id]);
    const feedback = query('SELECT * FROM vendor_feedback WHERE vendor_id = ? ORDER BY created_at DESC LIMIT 10', [req.params.id]);
    res.json({ success: true, vendor, purchase_orders: orders, ratings, feedback });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/vendors', (req, res) => {
  try {
    const { name, contact_name, email, phone, address, payment_terms } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Name required' });
    const id = uuidv4();
    run('INSERT INTO suppliers (id, name, contact_name, email, phone, address, payment_terms) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, name, contact_name, email, phone, address, payment_terms]);
    res.json({ success: true, vendor: { id, name } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/vendors/:id', (req, res) => {
  try {
    const { name, contact_name, email, phone, address, payment_terms, active } = req.body;
    run(`UPDATE suppliers SET name = COALESCE(?, name), contact_name = COALESCE(?, contact_name), 
         email = COALESCE(?, email), phone = COALESCE(?, phone), address = COALESCE(?, address),
         payment_terms = COALESCE(?, payment_terms), active = COALESCE(?, active), updated_at = ? WHERE id = ?`,
      [name, contact_name, email, phone, address, payment_terms, active, new Date().toISOString(), req.params.id]);
    res.json({ success: true, message: 'Vendor updated' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Vendor performance
app.get('/vendors/:id/performance', (req, res) => {
  try {
    const { period_start, period_end } = req.query;
    let sql = 'SELECT * FROM purchase_orders WHERE supplier_id = ?';
    const params = [req.params.id];
    if (period_start) { sql += ' AND created_at >= ?'; params.push(period_start); }
    if (period_end) { sql += ' AND created_at <= ?'; params.push(period_end); }
    const orders = query(sql, params);
    
    const totalOrders = orders.length;
    const totalValue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const onTime = orders.filter(o => o.status === 'received' && o.received_date && o.expected_delivery_date && o.received_date <= o.expected_delivery_date).length;
    
    const ratingResult = get('SELECT AVG(rating) as avg FROM supplier_ratings WHERE supplier_id = ?', [req.params.id]);
    
    res.json({
      success: true,
      performance: {
        total_orders: totalOrders,
        total_value: totalValue,
        on_time_delivery_rate: totalOrders > 0 ? (onTime / totalOrders) * 100 : 0,
        average_rating: ratingResult?.avg || 0
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Compare vendors
app.get('/vendors/compare', (req, res) => {
  try {
    const { ids } = req.query;
    if (!ids) return res.status(400).json({ success: false, error: 'Vendor IDs required' });
    const vendorIds = ids.split(',');
    
    const vendors = [];
    for (const id of vendorIds) {
      const vendor = get('SELECT * FROM suppliers WHERE id = ?', [id.trim()]);
      if (vendor) {
        const orderStats = get('SELECT COUNT(*) as total, SUM(total) as value FROM purchase_orders WHERE supplier_id = ?', [id.trim()]);
        const ratingResult = get('SELECT AVG(rating) as avg FROM supplier_ratings WHERE supplier_id = ?', [id.trim()]);
        vendors.push({
          ...vendor,
          total_orders: orderStats?.total || 0,
          total_value: orderStats?.value || 0,
          average_rating: ratingResult?.avg || 0
        });
      }
    }
    
    res.json({ success: true, vendors });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Top vendors
app.get('/vendors/top', (req, res) => {
  try {
    const { limit = 10, by = 'rating' } = req.query;
    let sql = 'SELECT * FROM suppliers WHERE active = 1 ORDER BY ';
    if (by === 'rating') sql += 'rating DESC';
    else if (by === 'orders') sql += '(SELECT COUNT(*) FROM purchase_orders WHERE supplier_id = suppliers.id) DESC';
    sql += ' LIMIT ?';
    res.json({ success: true, vendors: query(sql, [parseInt(limit)]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Vendor stats
app.get('/vendor/stats', (req, res) => {
  try {
    const stats = get('SELECT COUNT(*) as total, SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) as active, AVG(rating) as avg_rating FROM suppliers');
    res.json({ success: true, stats: stats || {} });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'vendor_management', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Vendor Management Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
