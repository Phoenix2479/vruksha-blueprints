const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');
const { notifyAccounting } = require('../shared/accounting-hook');

const app = express();
const PORT = process.env.PORT || 9157;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'inventory_sync', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'inventory_sync' }));
app.get('/readyz', (req, res) => res.json({ status: 'ok', service: 'inventory_sync', ready: true }));

// ── Stock Records ───────────────────────────────────────────────────

// Get stock levels by product
app.get('/stock/:product_id', (req, res) => {
  try {
    const { variant_id } = req.query;
    let sql = 'SELECT * FROM stock_records WHERE product_id = ?';
    const params = [req.params.product_id];
    if (variant_id) { sql += ' AND variant_id = ?'; params.push(variant_id); }
    sql += ' ORDER BY location ASC';
    const records = query(sql, params);
    const data = records.map(r => ({ ...r, available: r.quantity - r.reserved }));
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Update stock quantity
app.put('/stock', (req, res) => {
  try {
    const { product_id, variant_id, location = 'default', quantity, low_stock_threshold = 10 } = req.body;
    if (!product_id || quantity === undefined) return res.status(400).json({ success: false, error: 'product_id and quantity are required' });

    // Check if record exists
    const existing = get('SELECT * FROM stock_records WHERE product_id = ? AND COALESCE(variant_id, \'\') = COALESCE(?, \'\') AND location = ?',
      [product_id, variant_id || '', location]);

    if (existing) {
      run('UPDATE stock_records SET quantity = ?, low_stock_threshold = ?, updated_at = datetime(\'now\') WHERE id = ?',
        [quantity, low_stock_threshold, existing.id]);
    } else {
      const id = uuidv4();
      run('INSERT INTO stock_records (id, product_id, variant_id, location, quantity, reserved, low_stock_threshold) VALUES (?, ?, ?, ?, ?, 0, ?)',
        [id, product_id, variant_id || null, location, quantity, low_stock_threshold]);
    }

    // Check for low stock alert
    if (quantity <= low_stock_threshold) {
      const alertId = uuidv4();
      run('INSERT INTO stock_alerts (id, product_id, type, message) VALUES (?, ?, \'low_stock\', ?)',
        [alertId, product_id, `Low stock alert: product ${product_id} at ${location} has ${quantity} units (threshold: ${low_stock_threshold})`]);
    }

    const record = get('SELECT * FROM stock_records WHERE product_id = ? AND COALESCE(variant_id, \'\') = COALESCE(?, \'\') AND location = ?',
      [product_id, variant_id || '', location]);
    res.json({ success: true, data: { ...record, available: record.quantity - record.reserved } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Bulk update stock
app.put('/stock/bulk', (req, res) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, error: 'items array is required' });

    const results = [];
    for (const item of items) {
      const location = item.location || 'default';
      const existing = get('SELECT * FROM stock_records WHERE product_id = ? AND COALESCE(variant_id, \'\') = COALESCE(?, \'\') AND location = ?',
        [item.product_id, item.variant_id || '', location]);

      if (existing) {
        run('UPDATE stock_records SET quantity = ?, low_stock_threshold = ?, updated_at = datetime(\'now\') WHERE id = ?',
          [item.quantity, item.low_stock_threshold || 10, existing.id]);
      } else {
        const id = uuidv4();
        run('INSERT INTO stock_records (id, product_id, variant_id, location, quantity, reserved, low_stock_threshold) VALUES (?, ?, ?, ?, ?, 0, ?)',
          [id, item.product_id, item.variant_id || null, location, item.quantity, item.low_stock_threshold || 10]);
      }

      const record = get('SELECT * FROM stock_records WHERE product_id = ? AND COALESCE(variant_id, \'\') = COALESCE(?, \'\') AND location = ?',
        [item.product_id, item.variant_id || '', location]);
      results.push({ ...record, available: record.quantity - record.reserved });

      // Low stock check
      if (record.quantity <= record.low_stock_threshold) {
        const alertId = uuidv4();
        run('INSERT INTO stock_alerts (id, product_id, type, message) VALUES (?, ?, \'low_stock\', ?)',
          [alertId, item.product_id, `Low stock alert: product ${item.product_id} at ${location} has ${record.quantity} units`]);
      }
    }
    res.json({ success: true, data: results });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Reservations ────────────────────────────────────────────────────

// List active reservations
app.get('/reservations', (req, res) => {
  try {
    const { product_id } = req.query;
    let sql = 'SELECT * FROM stock_reservations WHERE status = \'active\'';
    const params = [];
    if (product_id) { sql += ' AND product_id = ?'; params.push(product_id); }
    sql += ' ORDER BY created_at DESC';
    const reservations = query(sql, params);
    res.json({ success: true, data: reservations });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Reserve stock
app.post('/reservations', (req, res) => {
  try {
    const { product_id, variant_id, order_id, quantity, expires_at } = req.body;
    if (!product_id || !quantity || quantity < 1) return res.status(400).json({ success: false, error: 'product_id and positive quantity are required' });

    // Check availability
    const stock = get('SELECT * FROM stock_records WHERE product_id = ? AND COALESCE(variant_id, \'\') = COALESCE(?, \'\')',
      [product_id, variant_id || '']);
    if (!stock) return res.status(400).json({ success: false, error: 'Stock record not found' });

    const available = stock.quantity - stock.reserved;
    if (quantity > available) return res.status(400).json({ success: false, error: `Insufficient stock. Available: ${available}, Requested: ${quantity}` });

    const id = uuidv4();
    const expiry = expires_at || new Date(Date.now() + 30 * 60 * 1000).toISOString();
    run('INSERT INTO stock_reservations (id, product_id, variant_id, order_id, quantity, status, expires_at) VALUES (?, ?, ?, ?, ?, \'active\', ?)',
      [id, product_id, variant_id || null, order_id || null, quantity, expiry]);

    // Update reserved count
    run('UPDATE stock_records SET reserved = reserved + ?, updated_at = datetime(\'now\') WHERE id = ?', [quantity, stock.id]);

    res.status(201).json({ success: true, data: { id, product_id, quantity, status: 'active', expires_at: expiry } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Release reservation
app.post('/reservations/:id/release', (req, res) => {
  try {
    const reservation = get('SELECT * FROM stock_reservations WHERE id = ? AND status = \'active\'', [req.params.id]);
    if (!reservation) return res.status(400).json({ success: false, error: 'Active reservation not found' });

    run('UPDATE stock_reservations SET status = \'released\' WHERE id = ?', [req.params.id]);

    // Decrease reserved count
    const stock = get('SELECT * FROM stock_records WHERE product_id = ? AND COALESCE(variant_id, \'\') = COALESCE(?, \'\')',
      [reservation.product_id, reservation.variant_id || '']);
    if (stock) {
      const newReserved = Math.max(stock.reserved - reservation.quantity, 0);
      run('UPDATE stock_records SET reserved = ?, updated_at = datetime(\'now\') WHERE id = ?', [newReserved, stock.id]);
    }

    res.json({ success: true, data: { message: 'Reservation released' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Sync Sources ────────────────────────────────────────────────────

// List sync sources
app.get('/sources', (req, res) => {
  try {
    const sources = query('SELECT * FROM sync_sources ORDER BY created_at DESC');
    res.json({ success: true, data: sources.map(s => ({ ...s, config: JSON.parse(s.config || '{}') })) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get sync source
app.get('/sources/:id', (req, res) => {
  try {
    const source = get('SELECT * FROM sync_sources WHERE id = ?', [req.params.id]);
    if (!source) return res.status(404).json({ success: false, error: 'Sync source not found' });
    res.json({ success: true, data: { ...source, config: JSON.parse(source.config || '{}') } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Create sync source
app.post('/sources', (req, res) => {
  try {
    const { name, type, config, is_active } = req.body;
    if (!name || !type) return res.status(400).json({ success: false, error: 'name and type are required' });
    const id = uuidv4();
    run('INSERT INTO sync_sources (id, name, type, config, is_active) VALUES (?, ?, ?, ?, ?)',
      [id, name, type, JSON.stringify(config || {}), is_active !== false ? 1 : 0]);
    res.status(201).json({ success: true, data: { id, name, type, is_active: is_active !== false } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Update sync source
app.put('/sources/:id', (req, res) => {
  try {
    const { name, type, config, is_active, last_synced_at } = req.body;
    const existing = get('SELECT * FROM sync_sources WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Sync source not found' });

    const updates = [];
    const params = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (type !== undefined) { updates.push('type = ?'); params.push(type); }
    if (config !== undefined) { updates.push('config = ?'); params.push(JSON.stringify(config)); }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }
    if (last_synced_at !== undefined) { updates.push('last_synced_at = ?'); params.push(last_synced_at); }

    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

    params.push(req.params.id);
    run(`UPDATE sync_sources SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ success: true, data: { id: req.params.id, message: 'Updated' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Delete sync source
app.delete('/sources/:id', (req, res) => {
  try {
    const existing = get('SELECT * FROM sync_sources WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Sync source not found' });
    run('DELETE FROM sync_sources WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: { message: 'Sync source deleted' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Stock Alerts ────────────────────────────────────────────────────

// List alerts
app.get('/alerts', (req, res) => {
  try {
    const { is_read, product_id, type, limit = 100 } = req.query;
    let sql = 'SELECT * FROM stock_alerts WHERE 1=1';
    const params = [];
    if (is_read !== undefined) { sql += ' AND is_read = ?'; params.push(is_read === 'true' ? 1 : 0); }
    if (product_id) { sql += ' AND product_id = ?'; params.push(product_id); }
    if (type) { sql += ' AND type = ?'; params.push(type); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    const alerts = query(sql, params);
    res.json({ success: true, data: alerts });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Mark alert as read
app.patch('/alerts/:id/read', (req, res) => {
  try {
    const alert = get('SELECT * FROM stock_alerts WHERE id = ?', [req.params.id]);
    if (!alert) return res.status(404).json({ success: false, error: 'Alert not found' });
    run('UPDATE stock_alerts SET is_read = 1 WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: { ...alert, is_read: 1 } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Mark all alerts as read
app.post('/alerts/mark-all-read', (req, res) => {
  try {
    run('UPDATE stock_alerts SET is_read = 1 WHERE is_read = 0');
    res.json({ success: true, data: { message: 'All alerts marked as read' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'inventory_sync', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Inventory Sync Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
