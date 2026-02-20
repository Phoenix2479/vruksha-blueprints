const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');
const { notifyAccounting } = require('../shared/accounting-hook');

const app = express();
const PORT = process.env.PORT || 9161;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'product_reviews', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'product_reviews' }));
app.get('/readyz', (req, res) => res.json({ status: 'ok', service: 'product_reviews', ready: true }));

// ── Submit a review ──────────────────────────────────────────────────
app.post('/reviews', (req, res) => {
  try {
    const { product_id, customer_id, customer_name, rating, title, body, is_verified_purchase = false } = req.body;
    if (!product_id || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, error: 'product_id and rating (1-5) are required' });
    }
    const id = uuidv4();
    run(`INSERT INTO reviews (id, product_id, customer_id, customer_name, rating, title, body, is_verified_purchase, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [id, product_id, customer_id || null, customer_name || null, rating, title || null, body || null, is_verified_purchase ? 1 : 0]);

    notifyAccounting('ecommerce', 'ecommerce.review.submitted', { review_id: id, product_id, rating });
    res.status(201).json({ success: true, data: { id, product_id, rating, status: 'pending' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── List reviews by product ──────────────────────────────────────────
app.get('/reviews/products/:product_id', (req, res) => {
  try {
    const { status, limit = 50, page = 1 } = req.query;
    let sql = 'SELECT * FROM reviews WHERE product_id = ?';
    const params = [req.params.product_id];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const lim = parseInt(limit);
    const offset = (Math.max(1, parseInt(page)) - 1) * lim;
    params.push(lim, offset);
    const reviews = query(sql, params);

    const countSql = status
      ? 'SELECT COUNT(*) as total FROM reviews WHERE product_id = ? AND status = ?'
      : 'SELECT COUNT(*) as total FROM reviews WHERE product_id = ?';
    const countParams = status ? [req.params.product_id, status] : [req.params.product_id];
    const total = get(countSql, countParams);

    res.json({ success: true, data: reviews, pagination: { page: parseInt(page), limit: lim, total: total ? total.total : 0 } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Get aggregate ratings for a product ──────────────────────────────
app.get('/reviews/products/:product_id/summary', (req, res) => {
  try {
    const rows = query("SELECT rating, COUNT(*) as cnt FROM reviews WHERE product_id = ? AND status = 'approved' GROUP BY rating", [req.params.product_id]);
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalReviews = 0;
    let totalRating = 0;
    for (const row of rows) {
      distribution[row.rating] = row.cnt;
      totalReviews += row.cnt;
      totalRating += row.rating * row.cnt;
    }
    const averageRating = totalReviews > 0 ? parseFloat((totalRating / totalReviews).toFixed(2)) : 0;
    res.json({ success: true, data: { product_id: req.params.product_id, average_rating: averageRating, total_reviews: totalReviews, rating_distribution: distribution } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Get review by ID ─────────────────────────────────────────────────
app.get('/reviews/:id', (req, res) => {
  try {
    const review = get('SELECT * FROM reviews WHERE id = ?', [req.params.id]);
    if (!review) return res.status(404).json({ success: false, error: 'Review not found' });
    res.json({ success: true, data: review });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Moderate review ──────────────────────────────────────────────────
app.patch('/reviews/:id/moderate', (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, error: "status must be 'approved' or 'rejected'" });
    }
    const review = get('SELECT * FROM reviews WHERE id = ?', [req.params.id]);
    if (!review) return res.status(404).json({ success: false, error: 'Review not found' });
    run('UPDATE reviews SET status = ?, updated_at = ? WHERE id = ?', [status, new Date().toISOString(), req.params.id]);
    if (status === 'approved') {
      notifyAccounting('ecommerce', 'ecommerce.review.approved', { review_id: req.params.id, product_id: review.product_id, rating: review.rating });
    }
    res.json({ success: true, data: { ...review, status } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Admin respond ────────────────────────────────────────────────────
app.patch('/reviews/:id/respond', (req, res) => {
  try {
    const { admin_response } = req.body;
    if (!admin_response) return res.status(400).json({ success: false, error: 'admin_response is required' });
    const review = get('SELECT * FROM reviews WHERE id = ?', [req.params.id]);
    if (!review) return res.status(404).json({ success: false, error: 'Review not found' });
    const now = new Date().toISOString();
    run('UPDATE reviews SET admin_response = ?, responded_at = ?, updated_at = ? WHERE id = ?', [admin_response, now, now, req.params.id]);
    res.json({ success: true, data: { ...review, admin_response, responded_at: now } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Helpful vote ─────────────────────────────────────────────────────
app.post('/reviews/:id/helpful', (req, res) => {
  try {
    const review = get('SELECT * FROM reviews WHERE id = ?', [req.params.id]);
    if (!review) return res.status(404).json({ success: false, error: 'Review not found' });
    run('UPDATE reviews SET helpful_count = helpful_count + 1, updated_at = ? WHERE id = ?', [new Date().toISOString(), req.params.id]);
    res.json({ success: true, data: { helpful_count: review.helpful_count + 1 } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Report review ────────────────────────────────────────────────────
app.post('/reviews/:id/report', (req, res) => {
  try {
    const review = get('SELECT * FROM reviews WHERE id = ?', [req.params.id]);
    if (!review) return res.status(404).json({ success: false, error: 'Review not found' });
    run('UPDATE reviews SET reported_count = reported_count + 1, updated_at = ? WHERE id = ?', [new Date().toISOString(), req.params.id]);
    res.json({ success: true, data: { reported_count: review.reported_count + 1 } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'product_reviews', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Product Reviews Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
