const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8870;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'vendor_feedback', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'vendor_feedback' }));

// List feedback
app.get('/feedback', (req, res) => {
  try {
    const { vendor_id, rating_min, limit = 100 } = req.query;
    let sql = 'SELECT vf.*, s.name as vendor_name FROM vendor_feedback vf LEFT JOIN suppliers s ON vf.vendor_id = s.id WHERE 1=1';
    const params = [];
    if (vendor_id) { sql += ' AND vf.vendor_id = ?'; params.push(vendor_id); }
    if (rating_min) { sql += ' AND vf.rating >= ?'; params.push(parseInt(rating_min)); }
    sql += ' ORDER BY vf.created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    res.json({ success: true, feedback: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/feedback/:id', (req, res) => {
  try {
    const feedback = get('SELECT vf.*, s.name as vendor_name FROM vendor_feedback vf LEFT JOIN suppliers s ON vf.vendor_id = s.id WHERE vf.id = ?', [req.params.id]);
    if (!feedback) return res.status(404).json({ success: false, error: 'Feedback not found' });
    res.json({ success: true, feedback });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/feedback', (req, res) => {
  try {
    const { vendor_id, order_id, rating, delivery_rating, quality_rating, comments } = req.body;
    if (!vendor_id || !rating) return res.status(400).json({ success: false, error: 'vendor_id and rating required' });
    if (rating < 1 || rating > 5) return res.status(400).json({ success: false, error: 'Rating must be 1-5' });
    
    const id = uuidv4();
    run('INSERT INTO vendor_feedback (id, vendor_id, order_id, rating, delivery_rating, quality_rating, comments) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, vendor_id, order_id, rating, delivery_rating, quality_rating, comments]);
    
    // Update vendor average rating
    const avgResult = get('SELECT AVG(rating) as avg FROM vendor_feedback WHERE vendor_id = ?', [vendor_id]);
    run('UPDATE suppliers SET rating = ?, updated_at = ? WHERE id = ?', [avgResult?.avg || rating, new Date().toISOString(), vendor_id]);
    
    res.json({ success: true, feedback: { id, rating } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Feedback for vendor
app.get('/vendors/:vendor_id/feedback', (req, res) => {
  try {
    const feedback = query('SELECT * FROM vendor_feedback WHERE vendor_id = ? ORDER BY created_at DESC LIMIT 50', [req.params.vendor_id]);
    const avgRatings = get(`SELECT 
      AVG(rating) as overall,
      AVG(delivery_rating) as delivery,
      AVG(quality_rating) as quality
      FROM vendor_feedback WHERE vendor_id = ?`, [req.params.vendor_id]);
    res.json({ success: true, feedback, averages: avgRatings || {} });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Feedback summary
app.get('/feedback/summary', (req, res) => {
  try {
    const { vendor_id } = req.query;
    let sql = 'SELECT rating, COUNT(*) as count FROM vendor_feedback';
    const params = [];
    if (vendor_id) { sql += ' WHERE vendor_id = ?'; params.push(vendor_id); }
    sql += ' GROUP BY rating ORDER BY rating DESC';
    const distribution = query(sql, params);
    
    const totalResult = get('SELECT COUNT(*) as total, AVG(rating) as avg FROM vendor_feedback' + (vendor_id ? ' WHERE vendor_id = ?' : ''), vendor_id ? [vendor_id] : []);
    
    res.json({ success: true, distribution, total: totalResult?.total || 0, average: totalResult?.avg || 0 });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Recent feedback
app.get('/feedback/recent', (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const feedback = query(`SELECT vf.*, s.name as vendor_name FROM vendor_feedback vf 
      LEFT JOIN suppliers s ON vf.vendor_id = s.id ORDER BY vf.created_at DESC LIMIT ?`, [parseInt(limit)]);
    res.json({ success: true, feedback });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Low rated vendors
app.get('/feedback/low-rated', (req, res) => {
  try {
    const { threshold = 3 } = req.query;
    const vendors = query(`SELECT s.*, AVG(vf.rating) as avg_rating, COUNT(vf.id) as feedback_count
      FROM suppliers s
      LEFT JOIN vendor_feedback vf ON s.id = vf.vendor_id
      GROUP BY s.id
      HAVING avg_rating < ? AND feedback_count > 0
      ORDER BY avg_rating`, [parseFloat(threshold)]);
    res.json({ success: true, vendors });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'vendor_feedback', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Vendor Feedback Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
