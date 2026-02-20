const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8891;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

const initLang = async () => {
  const db = await initDb();
  run(`CREATE TABLE IF NOT EXISTS translations (
    id TEXT PRIMARY KEY, locale TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(locale, key)
  )`);
  return db;
};

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'language_support', mode: 'lite' }));

// Available locales
app.get('/locales', (req, res) => {
  try {
    const locales = query('SELECT DISTINCT locale FROM translations ORDER BY locale');
    res.json({ success: true, locales: locales.map(l => l.locale), default: 'en' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get translations for locale
app.get('/translations/:locale', (req, res) => {
  try {
    const translations = query('SELECT key, value FROM translations WHERE locale = ?', [req.params.locale]);
    const result = {};
    translations.forEach(t => { result[t.key] = t.value; });
    res.json({ success: true, locale: req.params.locale, translations: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Add/update translation
app.post('/translations', (req, res) => {
  try {
    const { locale, key, value } = req.body;
    if (!locale || !key || !value) return res.status(400).json({ success: false, error: 'locale, key, value required' });
    const existing = get('SELECT id FROM translations WHERE locale = ? AND key = ?', [locale, key]);
    if (existing) {
      run('UPDATE translations SET value = ? WHERE id = ?', [value, existing.id]);
    } else {
      run('INSERT INTO translations (id, locale, key, value) VALUES (?, ?, ?, ?)', [uuidv4(), locale, key, value]);
    }
    res.json({ success: true, message: 'Translation saved' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Bulk import
app.post('/translations/import', (req, res) => {
  try {
    const { locale, translations } = req.body;
    if (!locale || !translations) return res.status(400).json({ success: false, error: 'locale and translations required' });
    let imported = 0;
    for (const [key, value] of Object.entries(translations)) {
      const existing = get('SELECT id FROM translations WHERE locale = ? AND key = ?', [locale, key]);
      if (existing) {
        run('UPDATE translations SET value = ? WHERE id = ?', [value, existing.id]);
      } else {
        run('INSERT INTO translations (id, locale, key, value) VALUES (?, ?, ?, ?)', [uuidv4(), locale, key, value]);
      }
      imported++;
    }
    res.json({ success: true, imported });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Translate helper
app.get('/translate', (req, res) => {
  try {
    const { key, locale = 'en', fallback } = req.query;
    if (!key) return res.status(400).json({ success: false, error: 'key required' });
    const translation = get('SELECT value FROM translations WHERE locale = ? AND key = ?', [locale, key]);
    res.json({ success: true, value: translation?.value || fallback || key });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'language_support', mode: 'lite', status: 'running' });
});

initLang().then(() => app.listen(PORT, () => console.log(`[Language Support Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
