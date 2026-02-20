/**
 * Fixed Assets & Depreciation - Lite Version (SQLite)
 * Port: 8906
 * Asset register, SLM/WDV depreciation, disposal tracking
 * Split from fiscal_periods for clean separation
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');
const { sendCSV } = require('../shared/csv-generator');

const app = express();
const PORT = process.env.PORT || 8906;

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'accounting_fixed_assets', mode: 'lite' });
});

// =============================================================================
// ASSET CATEGORIES
// =============================================================================

app.get('/api/asset-categories', (req, res) => {
  try { res.json({ success: true, data: query('SELECT * FROM acc_asset_categories ORDER BY name', []) }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/asset-categories', (req, res) => {
  try {
    const { name, default_useful_life, default_method, gl_asset_account, gl_depreciation_account, gl_expense_account } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'name required' });
    const id = uuidv4();
    run('INSERT INTO acc_asset_categories (id, name, default_useful_life, default_method, gl_asset_account, gl_depreciation_account, gl_expense_account) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, name, default_useful_life || 60, default_method || 'SLM', gl_asset_account || null, gl_depreciation_account || null, gl_expense_account || null]);
    res.status(201).json({ success: true, data: get('SELECT * FROM acc_asset_categories WHERE id = ?', [id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/asset-categories/:id', (req, res) => {
  try {
    const { name, default_useful_life, default_method, gl_asset_account, gl_depreciation_account, gl_expense_account } = req.body;
    run('UPDATE acc_asset_categories SET name = COALESCE(?, name), default_useful_life = COALESCE(?, default_useful_life), default_method = COALESCE(?, default_method), gl_asset_account = COALESCE(?, gl_asset_account), gl_depreciation_account = COALESCE(?, gl_depreciation_account), gl_expense_account = COALESCE(?, gl_expense_account) WHERE id = ?',
      [name, default_useful_life, default_method, gl_asset_account, gl_depreciation_account, gl_expense_account, req.params.id]);
    res.json({ success: true, data: get('SELECT * FROM acc_asset_categories WHERE id = ?', [req.params.id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =============================================================================
// FIXED ASSETS
// =============================================================================

app.get('/api/fixed-assets', (req, res) => {
  try {
    const { status, category_id } = req.query;
    let sql = 'SELECT a.*, c.name as category_name FROM acc_fixed_assets a LEFT JOIN acc_asset_categories c ON a.category_id = c.id WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND a.status = ?'; params.push(status); }
    if (category_id) { sql += ' AND a.category_id = ?'; params.push(category_id); }
    sql += ' ORDER BY a.created_at DESC';
    res.json({ success: true, data: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/fixed-assets/register', (req, res) => {
  try {
    const assets = query('SELECT a.*, c.name as category_name, COALESCE(d.acc_dep, 0) as accumulated_depreciation FROM acc_fixed_assets a LEFT JOIN acc_asset_categories c ON a.category_id = c.id LEFT JOIN (SELECT asset_id, SUM(depreciation_amount) as acc_dep FROM acc_depreciation_entries GROUP BY asset_id) d ON a.id = d.asset_id ORDER BY a.asset_code', []);
    const data = assets.map(a => ({ ...a, book_value: (a.purchase_value || 0) - (a.accumulated_depreciation || 0) }));
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/fixed-assets/csv', (req, res) => {
  try {
    const data = query('SELECT a.*, c.name as category_name, COALESCE(d.acc_dep, 0) as accumulated_depreciation FROM acc_fixed_assets a LEFT JOIN acc_asset_categories c ON a.category_id = c.id LEFT JOIN (SELECT asset_id, SUM(depreciation_amount) as acc_dep FROM acc_depreciation_entries GROUP BY asset_id) d ON a.id = d.asset_id', []);
    sendCSV(res, data.map(a => ({ ...a, book_value: (a.purchase_value || 0) - (a.accumulated_depreciation || 0) })), 'fixed-assets.csv');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/fixed-assets', (req, res) => {
  try {
    const { asset_code, name, category_id, purchase_date, purchase_value, salvage_value, useful_life_months, depreciation_method, gl_asset_account, gl_depreciation_account, gl_expense_account } = req.body;
    if (!asset_code || !name || !purchase_value) return res.status(400).json({ success: false, error: 'asset_code, name, purchase_value required' });
    const id = uuidv4();
    let method = depreciation_method || 'SLM', life = useful_life_months || 60, glAsset = gl_asset_account, glDep = gl_depreciation_account, glExp = gl_expense_account;
    if (category_id) {
      const cat = get('SELECT * FROM acc_asset_categories WHERE id = ?', [category_id]);
      if (cat) { method = depreciation_method || cat.default_method; life = useful_life_months || cat.default_useful_life; glAsset = glAsset || cat.gl_asset_account; glDep = glDep || cat.gl_depreciation_account; glExp = glExp || cat.gl_expense_account; }
    }
    run('INSERT INTO acc_fixed_assets (id, asset_code, name, category_id, purchase_date, purchase_value, salvage_value, useful_life_months, depreciation_method, gl_asset_account, gl_depreciation_account, gl_expense_account) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, asset_code, name, category_id || null, purchase_date || new Date().toISOString().split('T')[0], purchase_value, salvage_value || 0, life, method, glAsset || null, glDep || null, glExp || null]);
    res.status(201).json({ success: true, data: get('SELECT * FROM acc_fixed_assets WHERE id = ?', [id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/fixed-assets/:id', (req, res) => {
  try {
    const asset = get('SELECT a.*, c.name as category_name FROM acc_fixed_assets a LEFT JOIN acc_asset_categories c ON a.category_id = c.id WHERE a.id = ?', [req.params.id]);
    if (!asset) return res.status(404).json({ success: false, error: 'Asset not found' });
    const entries = query('SELECT * FROM acc_depreciation_entries WHERE asset_id = ? ORDER BY period', [req.params.id]);
    const accumulated = entries.reduce((s, e) => s + (e.depreciation_amount || 0), 0);
    res.json({ success: true, data: { ...asset, depreciation_entries: entries, accumulated_depreciation: accumulated, book_value: (asset.purchase_value || 0) - accumulated } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/fixed-assets/:id', (req, res) => {
  try {
    const { name, category_id, salvage_value, useful_life_months, depreciation_method, status } = req.body;
    run('UPDATE acc_fixed_assets SET name = COALESCE(?, name), category_id = COALESCE(?, category_id), salvage_value = COALESCE(?, salvage_value), useful_life_months = COALESCE(?, useful_life_months), depreciation_method = COALESCE(?, depreciation_method), status = COALESCE(?, status), updated_at = datetime(\'now\') WHERE id = ?',
      [name, category_id, salvage_value, useful_life_months, depreciation_method, status, req.params.id]);
    res.json({ success: true, data: get('SELECT * FROM acc_fixed_assets WHERE id = ?', [req.params.id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =============================================================================
// DEPRECIATION
// =============================================================================

app.post('/api/fixed-assets/run-depreciation', (req, res) => {
  try {
    const { period } = req.body;
    const currentPeriod = period || new Date().toISOString().substring(0, 7);
    const assets = query('SELECT * FROM acc_fixed_assets WHERE status = \'active\'', []);
    const results = [];
    for (const asset of assets) {
      const existing = get('SELECT id FROM acc_depreciation_entries WHERE asset_id = ? AND period = ?', [asset.id, currentPeriod]);
      if (existing) continue;
      const accRows = query('SELECT SUM(depreciation_amount) as total FROM acc_depreciation_entries WHERE asset_id = ?', [asset.id]);
      const accDep = accRows[0]?.total || 0;
      const bookValue = (asset.purchase_value || 0) - accDep;
      if (bookValue <= (asset.salvage_value || 0)) continue;
      let depAmount = 0;
      if (asset.depreciation_method === 'WDV') {
        const rate = asset.useful_life_months > 0 ? (1 - Math.pow((asset.salvage_value || 1) / (asset.purchase_value || 1), 12 / asset.useful_life_months)) / 12 : 0;
        depAmount = Math.round(bookValue * rate * 100) / 100;
      } else {
        depAmount = asset.useful_life_months > 0 ? Math.round(((asset.purchase_value || 0) - (asset.salvage_value || 0)) / asset.useful_life_months * 100) / 100 : 0;
      }
      depAmount = Math.min(depAmount, bookValue - (asset.salvage_value || 0));
      const entryId = uuidv4();
      run('INSERT INTO acc_depreciation_entries (id, asset_id, period, depreciation_amount, accumulated, book_value) VALUES (?, ?, ?, ?, ?, ?)',
        [entryId, asset.id, currentPeriod, depAmount, accDep + depAmount, bookValue - depAmount]);
      results.push({ asset_id: asset.id, asset_name: asset.name, depreciation: depAmount, new_book_value: bookValue - depAmount });
    }
    res.json({ success: true, data: { period: currentPeriod, assets_processed: results.length, entries: results } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/fixed-assets/:id/schedule', (req, res) => {
  try {
    const asset = get('SELECT * FROM acc_fixed_assets WHERE id = ?', [req.params.id]);
    if (!asset) return res.status(404).json({ success: false, error: 'Asset not found' });
    const depreciable = (asset.purchase_value || 0) - (asset.salvage_value || 0);
    const months = asset.useful_life_months || 60;
    const schedule = [];
    if (asset.depreciation_method === 'WDV') {
      const rate = months > 0 ? (1 - Math.pow((asset.salvage_value || 1) / (asset.purchase_value || 1), 12 / months)) : 0;
      let bv = asset.purchase_value;
      for (let i = 1; i <= Math.ceil(months / 12); i++) {
        const dep = Math.round(bv * rate * 100) / 100;
        bv -= dep;
        schedule.push({ year: i, depreciation: dep, accumulated: asset.purchase_value - bv, book_value: Math.max(bv, asset.salvage_value || 0) });
      }
    } else {
      const monthlyDep = months > 0 ? Math.round(depreciable / months * 100) / 100 : 0;
      let acc = 0;
      for (let i = 1; i <= months; i++) {
        acc += monthlyDep;
        schedule.push({ month: i, depreciation: monthlyDep, accumulated: Math.round(acc * 100) / 100, book_value: Math.round((asset.purchase_value - acc) * 100) / 100 });
      }
    }
    res.json({ success: true, data: { asset_id: asset.id, method: asset.depreciation_method, schedule } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/fixed-assets/:id/dispose', (req, res) => {
  try {
    const { disposed_value, disposed_date } = req.body;
    const asset = get('SELECT * FROM acc_fixed_assets WHERE id = ?', [req.params.id]);
    if (!asset) return res.status(404).json({ success: false, error: 'Asset not found' });
    const accumulated = query('SELECT SUM(depreciation_amount) as total FROM acc_depreciation_entries WHERE asset_id = ?', [req.params.id]);
    const accDep = accumulated[0]?.total || 0;
    const bookValue = (asset.purchase_value || 0) - accDep;
    const gainLoss = (disposed_value || 0) - bookValue;
    run('UPDATE acc_fixed_assets SET status = \'disposed\', disposed_date = ?, disposed_value = ?, updated_at = datetime(\'now\') WHERE id = ?',
      [disposed_date || new Date().toISOString().split('T')[0], disposed_value || 0, req.params.id]);
    res.json({ success: true, data: { asset_id: req.params.id, book_value: bookValue, disposed_value: disposed_value || 0, gain_loss: gainLoss, type: gainLoss >= 0 ? 'gain' : 'loss' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/depreciation-forecast', (req, res) => {
  try {
    const { months } = req.query;
    const periods = parseInt(months) || 12;
    const assets = query('SELECT * FROM acc_fixed_assets WHERE status = \'active\'', []);
    const forecast = [];
    for (let m = 0; m < periods; m++) {
      const d = new Date(); d.setMonth(d.getMonth() + m);
      const period = d.toISOString().substring(0, 7);
      let totalDep = 0;
      for (const asset of assets) {
        const depreciable = (asset.purchase_value || 0) - (asset.salvage_value || 0);
        const monthly = asset.useful_life_months > 0 ? depreciable / asset.useful_life_months : 0;
        totalDep += monthly;
      }
      forecast.push({ period, total_depreciation: Math.round(totalDep * 100) / 100 });
    }
    res.json({ success: true, data: forecast });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// SPA fallback
app.get('*', (req, res) => {
  if (req.accepts('html') && fs.existsSync(path.join(uiPath, 'index.html'))) {
    return res.sendFile(path.join(uiPath, 'index.html'));
  }
  res.status(404).json({ error: 'Not found' });
});

initDb().then(() => {
  app.listen(PORT, () => console.log(`Fixed Assets (lite) on port ${PORT}`));
}).catch(err => { console.error('Failed to init DB:', err); process.exit(1); });

module.exports = app;
