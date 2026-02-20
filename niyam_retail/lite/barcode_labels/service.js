const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8817;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'barcode_labels', mode: 'lite' }));

app.get('/api/products', (req, res) => {
  try { res.json({ success: true, data: query('SELECT id, sku, name, price, barcode FROM products WHERE active = 1') }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/labels', (req, res) => {
  try {
    const labels = query('SELECT l.*, p.name as product_name FROM labels l LEFT JOIN products p ON l.product_id = p.id');
    res.json({ success: true, data: labels });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/labels', (req, res) => {
  try {
    const { product_id, barcode, label_type, template } = req.body;
    const id = uuidv4();
    run('INSERT INTO labels (id, product_id, barcode, label_type, template) VALUES (?, ?, ?, ?, ?)', [id, product_id, barcode, label_type, template]);
    res.json({ success: true, data: { id } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/barcode/generate', (req, res) => {
  try {
    const { product_id } = req.body;
    const barcode = 'NM' + Date.now().toString().slice(-10);
    run('UPDATE products SET barcode = ? WHERE id = ?', [barcode, product_id]);
    res.json({ success: true, data: { barcode } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================
// Printer Profile Management
// ============================================

// List all printer profiles
app.get('/api/printer-profiles', (req, res) => {
  try {
    const profiles = query('SELECT * FROM printer_profiles ORDER BY is_default DESC, name');
    res.json({ success: true, data: profiles });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get default profile (MUST be before /:id to avoid matching 'default' as id)
app.get('/api/printer-profiles/default', (req, res) => {
  try {
    const profile = query('SELECT * FROM printer_profiles WHERE is_default = 1')[0];
    res.json({ success: true, data: profile || null });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get single profile
app.get('/api/printer-profiles/:id', (req, res) => {
  try {
    const profile = query('SELECT * FROM printer_profiles WHERE id = ?', [req.params.id])[0];
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
    res.json({ success: true, data: profile });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Create printer profile
app.post('/api/printer-profiles', (req, res) => {
  try {
    const { name, model, vendor, language, connection_type, connection_config, dpi, label_width_mm, label_height_mm, offset_x, offset_y, darkness, speed, is_default } = req.body;
    const id = uuidv4();
    
    // If setting as default, clear other defaults
    if (is_default) {
      run('UPDATE printer_profiles SET is_default = 0');
    }
    
    run(`INSERT INTO printer_profiles (id, name, model, vendor, language, connection_type, connection_config, dpi, label_width_mm, label_height_mm, offset_x, offset_y, darkness, speed, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, model, vendor, language || 'zpl', connection_type, connection_config ? JSON.stringify(connection_config) : null, dpi || 203, label_width_mm, label_height_mm, offset_x || 0, offset_y || 0, darkness || 15, speed || 4, is_default ? 1 : 0]);
    
    res.json({ success: true, data: { id } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Update printer profile
app.put('/api/printer-profiles/:id', (req, res) => {
  try {
    const { name, model, vendor, language, connection_type, connection_config, dpi, label_width_mm, label_height_mm, offset_x, offset_y, darkness, speed, is_default, last_calibrated } = req.body;
    
    // If setting as default, clear other defaults
    if (is_default) {
      run('UPDATE printer_profiles SET is_default = 0');
    }
    
    run(`UPDATE printer_profiles SET name = ?, model = ?, vendor = ?, language = ?, connection_type = ?, connection_config = ?, dpi = ?, label_width_mm = ?, label_height_mm = ?, offset_x = ?, offset_y = ?, darkness = ?, speed = ?, is_default = ?, last_calibrated = ? WHERE id = ?`,
      [name, model, vendor, language, connection_type, connection_config ? JSON.stringify(connection_config) : null, dpi, label_width_mm, label_height_mm, offset_x, offset_y, darkness, speed, is_default ? 1 : 0, last_calibrated, req.params.id]);
    
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Delete printer profile
app.delete('/api/printer-profiles/:id', (req, res) => {
  try {
    run('DELETE FROM printer_profiles WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Set default profile
app.post('/api/printer-profiles/:id/set-default', (req, res) => {
  try {
    run('UPDATE printer_profiles SET is_default = 0');
    run('UPDATE printer_profiles SET is_default = 1 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Update calibration data
app.post('/api/printer-profiles/:id/calibrate', (req, res) => {
  try {
    const { offset_x, offset_y, darkness, speed } = req.body;
    run(`UPDATE printer_profiles SET offset_x = ?, offset_y = ?, darkness = ?, speed = ?, last_calibrated = datetime('now') WHERE id = ?`,
      [offset_x, offset_y, darkness, speed, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================
// Barcode Correction Learning
// ============================================

// Save correction for learning
app.post('/api/barcode-corrections', (req, res) => {
  try {
    const { original_data, corrected_data, symbology_used, symbology_suggested, user_accepted } = req.body;
    run(`INSERT INTO barcode_corrections (original_data, corrected_data, symbology_used, symbology_suggested, user_accepted) VALUES (?, ?, ?, ?, ?)`,
      [original_data, corrected_data, symbology_used, symbology_suggested, user_accepted ? 1 : 0]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get correction patterns (for AI suggestions)
app.get('/api/barcode-corrections/patterns', (req, res) => {
  try {
    const patterns = query(`
      SELECT symbology_used, symbology_suggested, COUNT(*) as count, 
             SUM(user_accepted) as accepted_count
      FROM barcode_corrections 
      WHERE symbology_suggested IS NOT NULL
      GROUP BY symbology_used, symbology_suggested
      ORDER BY count DESC LIMIT 20
    `);
    res.json({ success: true, data: patterns });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================
// Layout Suggestion History
// ============================================

// Save layout suggestion
app.post('/api/layout-suggestions', (req, res) => {
  try {
    const { prompt, generated_template, user_accepted } = req.body;
    run(`INSERT INTO layout_suggestions (prompt, generated_template, user_accepted) VALUES (?, ?, ?)`,
      [prompt, JSON.stringify(generated_template), user_accepted ? 1 : 0]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get recent layout suggestions
app.get('/api/layout-suggestions', (req, res) => {
  try {
    const suggestions = query(`SELECT * FROM layout_suggestions ORDER BY created_at DESC LIMIT 20`);
    res.json({ success: true, data: suggestions.map(s => ({ ...s, generated_template: JSON.parse(s.generated_template || '{}') })) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'barcode_labels', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Barcode & Labels] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
