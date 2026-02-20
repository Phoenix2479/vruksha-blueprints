const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8818;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'email_client', mode: 'lite' }));

app.get('/api/emails', (req, res) => {
  try {
    const { status } = req.query;
    let emails = query('SELECT * FROM emails ORDER BY created_at DESC');
    if (status) emails = emails.filter(e => e.status === status);
    res.json({ success: true, data: emails });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/emails', (req, res) => {
  try {
    const { to_address, subject, body, template } = req.body;
    const id = uuidv4();
    run('INSERT INTO emails (id, to_address, subject, body, template, status) VALUES (?, ?, ?, ?, ?, ?)', [id, to_address, subject, body, template, 'pending']);
    res.json({ success: true, data: { id } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/emails/:id/send', (req, res) => {
  try {
    run('UPDATE emails SET status = ?, sent_at = ? WHERE id = ?', ['sent', new Date().toISOString(), req.params.id]);
    res.json({ success: true, message: 'Email marked as sent' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/customers', (req, res) => {
  try { res.json({ success: true, data: query('SELECT id, name, email FROM customers WHERE email IS NOT NULL') }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'email_client', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Email Client] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
