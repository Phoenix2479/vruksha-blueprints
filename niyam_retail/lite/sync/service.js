const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get, saveDb, DB_PATH } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8885;
app.use(cors());
app.use(express.json({ limit: '50mb' }));
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

// Add sync tracking table
const initSync = async () => {
  const db = await initDb();
  run(`CREATE TABLE IF NOT EXISTS sync_log (
    id TEXT PRIMARY KEY,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL,
    data TEXT,
    synced INTEGER DEFAULT 0,
    synced_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  return db;
};

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'sync', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'sync' }));

// Get sync status
app.get('/sync/status', (req, res) => {
  try {
    const pending = get('SELECT COUNT(*) as count FROM sync_log WHERE synced = 0');
    const lastSync = get('SELECT MAX(synced_at) as last_sync FROM sync_log WHERE synced = 1');
    const byTable = query('SELECT table_name, COUNT(*) as pending FROM sync_log WHERE synced = 0 GROUP BY table_name');
    
    res.json({
      success: true,
      status: {
        pending_changes: pending?.count || 0,
        last_sync: lastSync?.last_sync,
        by_table: byTable
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get pending changes
app.get('/sync/pending', (req, res) => {
  try {
    const { table_name, limit = 100 } = req.query;
    let sql = 'SELECT * FROM sync_log WHERE synced = 0';
    const params = [];
    if (table_name) { sql += ' AND table_name = ?'; params.push(table_name); }
    sql += ' ORDER BY created_at LIMIT ?';
    params.push(parseInt(limit));
    
    const changes = query(sql, params);
    res.json({ success: true, changes: changes.map(c => ({ ...c, data: c.data ? JSON.parse(c.data) : null })) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Mark changes as synced
app.post('/sync/mark-synced', (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) return res.status(400).json({ success: false, error: 'ids array required' });
    
    const syncedAt = new Date().toISOString();
    for (const id of ids) {
      run('UPDATE sync_log SET synced = 1, synced_at = ? WHERE id = ?', [syncedAt, id]);
    }
    
    res.json({ success: true, synced: ids.length });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Push changes (from another instance)
app.post('/sync/push', (req, res) => {
  try {
    const { changes } = req.body;
    if (!changes || !Array.isArray(changes)) return res.status(400).json({ success: false, error: 'changes array required' });
    
    let applied = 0;
    for (const change of changes) {
      // Apply change based on table and action
      // This is simplified - real implementation would need proper conflict resolution
      if (change.action === 'insert' && change.data) {
        // Try to insert, ignore if exists
        try {
          const columns = Object.keys(change.data).join(', ');
          const placeholders = Object.keys(change.data).map(() => '?').join(', ');
          run(`INSERT OR REPLACE INTO ${change.table_name} (${columns}) VALUES (${placeholders})`, Object.values(change.data));
          applied++;
        } catch (e) { /* ignore conflicts */ }
      } else if (change.action === 'update' && change.data && change.record_id) {
        const sets = Object.keys(change.data).map(k => `${k} = ?`).join(', ');
        run(`UPDATE ${change.table_name} SET ${sets} WHERE id = ?`, [...Object.values(change.data), change.record_id]);
        applied++;
      } else if (change.action === 'delete' && change.record_id) {
        run(`DELETE FROM ${change.table_name} WHERE id = ?`, [change.record_id]);
        applied++;
      }
    }
    
    saveDb();
    res.json({ success: true, applied });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Export database
app.get('/sync/export', (req, res) => {
  try {
    if (fs.existsSync(DB_PATH)) {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', 'attachment; filename=retail.db');
      res.send(fs.readFileSync(DB_PATH));
    } else {
      res.status(404).json({ success: false, error: 'Database not found' });
    }
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Import database
app.post('/sync/import', (req, res) => {
  try {
    const { data } = req.body; // Base64 encoded database
    if (!data) return res.status(400).json({ success: false, error: 'data required' });
    
    const buffer = Buffer.from(data, 'base64');
    fs.writeFileSync(DB_PATH + '.backup', fs.readFileSync(DB_PATH)); // Backup
    fs.writeFileSync(DB_PATH, buffer);
    
    res.json({ success: true, message: 'Database imported. Restart required.' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Clear sync log
app.delete('/sync/log', (req, res) => {
  try {
    const { synced_only = 'true' } = req.query;
    if (synced_only === 'true') {
      run('DELETE FROM sync_log WHERE synced = 1');
    } else {
      run('DELETE FROM sync_log');
    }
    res.json({ success: true, message: 'Sync log cleared' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'sync', mode: 'lite', status: 'running' });
});

initSync().then(() => app.listen(PORT, () => console.log(`[Sync Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
