const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8900;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'returns_and_damage_management', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'returns_and_damage_management' }));

// List returns
app.get('/returns', (req, res) => {
  try {
    const { status, customer_id, limit = 100 } = req.query;
    let sql = 'SELECT r.*, c.name as customer_name FROM returns r LEFT JOIN customers c ON r.customer_id = c.id WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND r.status = ?'; params.push(status); }
    if (customer_id) { sql += ' AND r.customer_id = ?'; params.push(customer_id); }
    sql += ' ORDER BY r.created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    const returns = query(sql, params);
    res.json({ success: true, returns: returns.map(r => ({ ...r, items: JSON.parse(r.items || '[]') })) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get single return
app.get('/returns/:id', (req, res) => {
  try {
    const ret = get('SELECT r.*, c.name as customer_name FROM returns r LEFT JOIN customers c ON r.customer_id = c.id WHERE r.id = ?', [req.params.id]);
    if (!ret) return res.status(404).json({ success: false, error: 'Return not found' });
    res.json({ success: true, return: { ...ret, items: JSON.parse(ret.items || '[]') } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Create return request
app.post('/returns', (req, res) => {
  try {
    const { sale_id, customer_id, items, reason } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, error: 'Items required' });
    const id = uuidv4();
    const refundAmount = items.reduce((sum, item) => sum + ((item.quantity || 1) * (item.price || 0)), 0);
    run('INSERT INTO returns (id, sale_id, customer_id, items, reason, refund_amount) VALUES (?, ?, ?, ?, ?, ?)',
      [id, sale_id, customer_id, JSON.stringify(items), reason, refundAmount]);
    res.json({ success: true, return: { id, status: 'pending', refund_amount: refundAmount } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Process return
app.post('/returns/:id/process', (req, res) => {
  try {
    const { status, refund_method, processed_by, notes } = req.body;
    if (!status) return res.status(400).json({ success: false, error: 'status required' });
    const valid = ['approved', 'rejected', 'refunded', 'exchanged'];
    if (!valid.includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });
    
    run('UPDATE returns SET status = ?, refund_method = ?, processed_by = ?, updated_at = ? WHERE id = ?',
      [status, refund_method, processed_by, new Date().toISOString(), req.params.id]);
    
    // If approved/refunded, restore inventory
    if (status === 'approved' || status === 'refunded') {
      const ret = get('SELECT * FROM returns WHERE id = ?', [req.params.id]);
      if (ret) {
        const items = JSON.parse(ret.items || '[]');
        for (const item of items) {
          if (item.product_id) {
            const existing = get('SELECT * FROM inventory WHERE product_id = ?', [item.product_id]);
            if (existing) {
              run('UPDATE inventory SET quantity = ?, updated_at = ? WHERE product_id = ?',
                [existing.quantity + (item.quantity || 1), new Date().toISOString(), item.product_id]);
            }
          }
        }
      }
    }
    
    res.json({ success: true, message: 'Return processed' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Returns stats
app.get('/returns/stats', (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    let sql = 'SELECT status, COUNT(*) as count, SUM(refund_amount) as total_refund FROM returns WHERE 1=1';
    const params = [];
    if (from_date) { sql += ' AND created_at >= ?'; params.push(from_date); }
    if (to_date) { sql += ' AND created_at <= ?'; params.push(to_date); }
    sql += ' GROUP BY status';
    const stats = query(sql, params);
    res.json({ success: true, stats });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Damage report (subset of returns for damaged goods)
app.get('/damage-reports', (req, res) => {
  try {
    const reports = query("SELECT * FROM returns WHERE reason LIKE '%damage%' OR reason LIKE '%defect%' ORDER BY created_at DESC LIMIT 100");
    res.json({ success: true, damage_reports: reports });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'returns_and_damage_management', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Returns & Damage Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
