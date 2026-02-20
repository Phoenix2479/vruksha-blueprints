const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8862;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'marketing_automation', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'marketing_automation' }));

// === CAMPAIGNS ===
app.get('/campaigns', (req, res) => {
  try {
    const { status, type, limit = 100 } = req.query;
    let sql = 'SELECT * FROM campaigns WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (type) { sql += ' AND type = ?'; params.push(type); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    const campaigns = query(sql, params);
    res.json({ success: true, campaigns });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/campaigns/:id', (req, res) => {
  try {
    const campaign = get('SELECT * FROM campaigns WHERE id = ?', [req.params.id]);
    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });
    res.json({ success: true, campaign: { ...campaign, metrics: JSON.parse(campaign.metrics || '{}') } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/campaigns', (req, res) => {
  try {
    const { name, type, start_date, end_date, budget, target_audience, content } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Name required' });
    const id = uuidv4();
    run('INSERT INTO campaigns (id, name, type, start_date, end_date, budget, target_audience, content) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, name, type || 'email', start_date, end_date, budget || 0, target_audience, content]);
    res.json({ success: true, campaign: { id, name, status: 'draft' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/campaigns/:id', (req, res) => {
  try {
    const { name, type, start_date, end_date, budget, target_audience, content, status } = req.body;
    run(`UPDATE campaigns SET name = COALESCE(?, name), type = COALESCE(?, type), start_date = COALESCE(?, start_date),
         end_date = COALESCE(?, end_date), budget = COALESCE(?, budget), target_audience = COALESCE(?, target_audience),
         content = COALESCE(?, content), status = COALESCE(?, status), updated_at = ? WHERE id = ?`,
      [name, type, start_date, end_date, budget, target_audience, content, status, new Date().toISOString(), req.params.id]);
    res.json({ success: true, message: 'Campaign updated' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Campaign status update
app.patch('/campaigns/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });
    run('UPDATE campaigns SET status = ?, updated_at = ? WHERE id = ?', [status, new Date().toISOString(), req.params.id]);
    res.json({ success: true, message: 'Status updated' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Update campaign metrics
app.post('/campaigns/:id/metrics', (req, res) => {
  try {
    const { sent, opened, clicked, converted, revenue } = req.body;
    const campaign = get('SELECT * FROM campaigns WHERE id = ?', [req.params.id]);
    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });
    const metrics = { ...JSON.parse(campaign.metrics || '{}'), sent, opened, clicked, converted, revenue, updated: new Date().toISOString() };
    run('UPDATE campaigns SET metrics = ?, updated_at = ? WHERE id = ?', [JSON.stringify(metrics), new Date().toISOString(), req.params.id]);
    res.json({ success: true, metrics });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// === EMAIL TEMPLATES ===
app.get('/email-templates', (req, res) => {
  try {
    const templates = query('SELECT * FROM emails WHERE template IS NOT NULL GROUP BY template ORDER BY created_at DESC');
    res.json({ success: true, templates });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Send email (queue)
app.post('/emails/send', (req, res) => {
  try {
    const { to_address, subject, body, template } = req.body;
    if (!to_address) return res.status(400).json({ success: false, error: 'to_address required' });
    const id = uuidv4();
    run('INSERT INTO emails (id, to_address, subject, body, template, status) VALUES (?, ?, ?, ?, ?, ?)',
      [id, to_address, subject, body, template, 'queued']);
    res.json({ success: true, email: { id, status: 'queued' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get queued emails
app.get('/emails/queue', (req, res) => {
  try {
    const emails = query("SELECT * FROM emails WHERE status = 'queued' OR status = 'pending' ORDER BY created_at LIMIT 100");
    res.json({ success: true, emails });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Mark email sent
app.post('/emails/:id/sent', (req, res) => {
  try {
    run('UPDATE emails SET status = ?, sent_at = ? WHERE id = ?', ['sent', new Date().toISOString(), req.params.id]);
    res.json({ success: true, message: 'Email marked as sent' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Marketing stats
app.get('/marketing/stats', (req, res) => {
  try {
    const campaigns = get('SELECT COUNT(*) as total, SUM(CASE WHEN status = "active" THEN 1 ELSE 0 END) as active FROM campaigns');
    const emails = get('SELECT COUNT(*) as total, SUM(CASE WHEN status = "sent" THEN 1 ELSE 0 END) as sent FROM emails');
    res.json({ success: true, stats: { campaigns: campaigns || {}, emails: emails || {} } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'marketing_automation', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Marketing Automation Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
