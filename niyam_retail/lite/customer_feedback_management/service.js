const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8877;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

// Add feedback table if not exists
const initFeedback = async () => {
  const db = await initDb();
  run(`CREATE TABLE IF NOT EXISTS customer_feedback (
    id TEXT PRIMARY KEY,
    customer_id TEXT,
    customer_name TEXT,
    customer_email TEXT,
    type TEXT,
    rating INTEGER,
    subject TEXT,
    message TEXT,
    status TEXT DEFAULT 'new',
    response TEXT,
    responded_by TEXT,
    responded_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  return db;
};

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'customer_feedback_management', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'customer_feedback_management' }));

// List feedback
app.get('/feedback', (req, res) => {
  try {
    const { status, type, rating_max, limit = 100 } = req.query;
    let sql = 'SELECT * FROM customer_feedback WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (type) { sql += ' AND type = ?'; params.push(type); }
    if (rating_max) { sql += ' AND rating <= ?'; params.push(parseInt(rating_max)); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    res.json({ success: true, feedback: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/feedback/:id', (req, res) => {
  try {
    const feedback = get('SELECT * FROM customer_feedback WHERE id = ?', [req.params.id]);
    if (!feedback) return res.status(404).json({ success: false, error: 'Feedback not found' });
    res.json({ success: true, feedback });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Submit feedback
app.post('/feedback', (req, res) => {
  try {
    const { customer_id, customer_name, customer_email, type, rating, subject, message } = req.body;
    if (!message) return res.status(400).json({ success: false, error: 'Message required' });
    const id = uuidv4();
    run(`INSERT INTO customer_feedback (id, customer_id, customer_name, customer_email, type, rating, subject, message) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, customer_id, customer_name, customer_email, type || 'general', rating, subject, message]);
    res.json({ success: true, feedback: { id, type: type || 'general', status: 'new' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Update feedback status
app.patch('/feedback/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['new', 'in_progress', 'resolved', 'closed'];
    if (!valid.includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });
    run('UPDATE feedback SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ success: true, message: 'Status updated' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Respond to feedback
app.post('/feedback/:id/respond', (req, res) => {
  try {
    const { response, responded_by } = req.body;
    if (!response) return res.status(400).json({ success: false, error: 'Response required' });
    run('UPDATE customer_feedback SET response = ?, responded_by = ?, responded_at = ?, status = ? WHERE id = ?',
      [response, responded_by, new Date().toISOString(), 'resolved', req.params.id]);
    res.json({ success: true, message: 'Response recorded' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Feedback summary
app.get('/feedback/summary', (req, res) => {
  try {
    const byStatus = query('SELECT status, COUNT(*) as count FROM customer_feedback GROUP BY status');
    const byType = query('SELECT type, COUNT(*) as count FROM customer_feedback GROUP BY type');
    const avgRating = get('SELECT AVG(rating) as avg FROM customer_feedback WHERE rating IS NOT NULL');
    const ratingDist = query('SELECT rating, COUNT(*) as count FROM customer_feedback WHERE rating IS NOT NULL GROUP BY rating ORDER BY rating DESC');
    
    res.json({
      success: true,
      summary: {
        by_status: byStatus,
        by_type: byType,
        average_rating: avgRating?.avg || 0,
        rating_distribution: ratingDist
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Recent negative feedback
app.get('/feedback/negative', (req, res) => {
  try {
    const { threshold = 3, limit = 20 } = req.query;
    const feedback = query('SELECT * FROM customer_feedback WHERE rating <= ? ORDER BY created_at DESC LIMIT ?',
      [parseInt(threshold), parseInt(limit)]);
    res.json({ success: true, feedback });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Pending responses
app.get('/feedback/pending', (req, res) => {
  try {
    const feedback = query("SELECT * FROM customer_feedback WHERE status IN ('new', 'in_progress') AND response IS NULL ORDER BY created_at");
    res.json({ success: true, feedback, count: feedback.length });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'customer_feedback_management', mode: 'lite', status: 'running' });
});

initFeedback().then(() => app.listen(PORT, () => console.log(`[Customer Feedback Management Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
