const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8814;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'store_management', mode: 'lite' }));

app.get('/api/stores', (req, res) => {
  try { res.json({ success: true, data: query('SELECT * FROM stores') }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/stores', (req, res) => {
  try {
    const { name, address, phone, email, manager } = req.body;
    const id = uuidv4();
    run('INSERT INTO stores (id, name, address, phone, email, manager) VALUES (?, ?, ?, ?, ?, ?)', [id, name, address, phone, email, manager]);
    res.json({ success: true, data: { id, name } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/stores/:id', (req, res) => {
  try {
    const { name, address, phone, email, manager, active } = req.body;
    run('UPDATE stores SET name=?, address=?, phone=?, email=?, manager=?, active=? WHERE id=?', [name, address, phone, email, manager, active ? 1 : 0, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'store_management', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Store Management] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
