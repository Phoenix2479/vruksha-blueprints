const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8872;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'notifications', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'notifications' }));

// Get notifications for user
app.get('/notifications', (req, res) => {
  try {
    const { user_id, unread_only, type, limit = 50 } = req.query;
    let sql = 'SELECT * FROM notifications WHERE 1=1';
    const params = [];
    if (user_id) { sql += ' AND user_id = ?'; params.push(user_id); }
    if (unread_only === 'true') { sql += ' AND read = 0'; }
    if (type) { sql += ' AND type = ?'; params.push(type); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    res.json({ success: true, notifications: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Create notification
app.post('/notifications', (req, res) => {
  try {
    const { user_id, type, title, message } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'Title required' });
    const id = uuidv4();
    run('INSERT INTO notifications (id, user_id, type, title, message) VALUES (?, ?, ?, ?, ?)',
      [id, user_id, type || 'info', title, message]);
    res.json({ success: true, notification: { id, title, type: type || 'info' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Mark as read
app.patch('/notifications/:id/read', (req, res) => {
  try {
    run('UPDATE notifications SET read = 1 WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Marked as read' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Mark all as read
app.post('/notifications/read-all', (req, res) => {
  try {
    const { user_id } = req.body;
    let sql = 'UPDATE notifications SET read = 1';
    const params = [];
    if (user_id) { sql += ' WHERE user_id = ?'; params.push(user_id); }
    run(sql, params);
    res.json({ success: true, message: 'All marked as read' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Delete notification
app.delete('/notifications/:id', (req, res) => {
  try {
    run('DELETE FROM notifications WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get unread count
app.get('/notifications/unread-count', (req, res) => {
  try {
    const { user_id } = req.query;
    let sql = 'SELECT COUNT(*) as count FROM notifications WHERE read = 0';
    const params = [];
    if (user_id) { sql += ' AND user_id = ?'; params.push(user_id); }
    const result = get(sql, params);
    res.json({ success: true, count: result?.count || 0 });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Broadcast notification
app.post('/notifications/broadcast', (req, res) => {
  try {
    const { type, title, message, user_ids } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'Title required' });
    const targets = user_ids || ['all'];
    const created = [];
    for (const userId of targets) {
      const id = uuidv4();
      run('INSERT INTO notifications (id, user_id, type, title, message) VALUES (?, ?, ?, ?, ?)',
        [id, userId === 'all' ? null : userId, type || 'broadcast', title, message]);
      created.push(id);
    }
    res.json({ success: true, created: created.length });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Clear old notifications
app.delete('/notifications/clear-old', (req, res) => {
  try {
    const { days = 30 } = req.query;
    const cutoff = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000).toISOString();
    run('DELETE FROM notifications WHERE created_at < ? AND read = 1', [cutoff]);
    res.json({ success: true, message: `Cleared notifications older than ${days} days` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'notifications', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Notifications Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
