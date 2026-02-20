const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');
const { notifyAccounting } = require('../shared/accounting-hook');

const app = express();
const PORT = process.env.PORT || 9158;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

const DEFAULT_BASE_RATE = 5.00;
const DEFAULT_PER_KG_RATE = 2.00;

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'shipping_integration', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'shipping_integration' }));
app.get('/readyz', (req, res) => res.json({ status: 'ok', service: 'shipping_integration', ready: true }));

// ── Carriers ────────────────────────────────────────────────────────

// List carriers
app.get('/carriers', (req, res) => {
  try {
    const activeOnly = req.query.active === 'true';
    let sql = 'SELECT * FROM carriers';
    if (activeOnly) sql += ' WHERE is_active = 1';
    sql += ' ORDER BY name ASC';
    const carriers = query(sql);
    res.json({ success: true, data: carriers.map(c => ({ ...c, config: JSON.parse(c.config || '{}') })) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get carrier by ID
app.get('/carriers/:id', (req, res) => {
  try {
    const carrier = get('SELECT * FROM carriers WHERE id = ?', [req.params.id]);
    if (!carrier) return res.status(404).json({ success: false, error: 'Carrier not found' });
    res.json({ success: true, data: { ...carrier, config: JSON.parse(carrier.config || '{}') } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Create carrier
app.post('/carriers', (req, res) => {
  try {
    const { name, code, is_active, config } = req.body;
    if (!name || !code) return res.status(400).json({ success: false, error: 'name and code are required' });
    const id = uuidv4();
    run('INSERT INTO carriers (id, name, code, is_active, config) VALUES (?, ?, ?, ?, ?)',
      [id, name, code, is_active !== false ? 1 : 0, JSON.stringify(config || {})]);
    res.status(201).json({ success: true, data: { id, name, code, is_active: is_active !== false } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Update carrier
app.put('/carriers/:id', (req, res) => {
  try {
    const { name, code, is_active, config } = req.body;
    const existing = get('SELECT * FROM carriers WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Carrier not found' });

    const updates = [];
    const params = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (code !== undefined) { updates.push('code = ?'); params.push(code); }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }
    if (config !== undefined) { updates.push('config = ?'); params.push(JSON.stringify(config)); }

    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

    params.push(req.params.id);
    run(`UPDATE carriers SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ success: true, data: { id: req.params.id, message: 'Updated' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Delete carrier
app.delete('/carriers/:id', (req, res) => {
  try {
    const existing = get('SELECT * FROM carriers WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Carrier not found' });
    run('DELETE FROM carriers WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: { message: 'Carrier deleted' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Shipments ───────────────────────────────────────────────────────

// List shipments
app.get('/shipments', (req, res) => {
  try {
    const { order_id, carrier_id, status, limit = 200 } = req.query;
    let sql = 'SELECT s.*, c.name as carrier_name, c.code as carrier_code FROM shipments s LEFT JOIN carriers c ON s.carrier_id = c.id WHERE 1=1';
    const params = [];
    if (order_id) { sql += ' AND s.order_id = ?'; params.push(order_id); }
    if (carrier_id) { sql += ' AND s.carrier_id = ?'; params.push(carrier_id); }
    if (status) { sql += ' AND s.status = ?'; params.push(status); }
    sql += ' ORDER BY s.created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    const shipments = query(sql, params);
    res.json({ success: true, data: shipments.map(s => ({ ...s, dimensions: JSON.parse(s.dimensions || '{}') })) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get shipment by ID
app.get('/shipments/:id', (req, res) => {
  try {
    const shipment = get('SELECT s.*, c.name as carrier_name, c.code as carrier_code FROM shipments s LEFT JOIN carriers c ON s.carrier_id = c.id WHERE s.id = ?', [req.params.id]);
    if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
    res.json({ success: true, data: { ...shipment, dimensions: JSON.parse(shipment.dimensions || '{}') } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Create shipment
app.post('/shipments', (req, res) => {
  try {
    const { order_id, carrier_id, tracking_number, label_url, estimated_delivery, cost, weight, dimensions, origin_location } = req.body;
    if (!order_id) return res.status(400).json({ success: false, error: 'order_id is required' });

    const id = uuidv4();
    const trackingNum = tracking_number || `TRK-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const estDelivery = estimated_delivery || new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();

    // Calculate cost from carrier if not provided
    let shippingCost = cost || 0;
    if (!cost && carrier_id && weight) {
      const carrier = get('SELECT * FROM carriers WHERE id = ?', [carrier_id]);
      if (carrier) {
        const carrierConfig = JSON.parse(carrier.config || '{}');
        const baseRate = carrierConfig.base_rate || DEFAULT_BASE_RATE;
        const perKgRate = carrierConfig.per_kg_rate || DEFAULT_PER_KG_RATE;
        shippingCost = baseRate + (weight * perKgRate);
      }
    }

    run(`INSERT INTO shipments (id, order_id, carrier_id, tracking_number, label_url, status, estimated_delivery, cost, weight, dimensions)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      [id, order_id, carrier_id, trackingNum, label_url, estDelivery, shippingCost, weight || 0, JSON.stringify(dimensions || {})]);

    // Create initial tracking event
    const eventId = uuidv4();
    run('INSERT INTO tracking_events (id, shipment_id, status, location, description, occurred_at) VALUES (?, ?, \'created\', ?, \'Shipment created\', datetime(\'now\'))',
      [eventId, id, origin_location || 'Origin']);

    res.status(201).json({ success: true, data: { id, order_id, tracking_number: trackingNum, status: 'pending', cost: shippingCost, estimated_delivery: estDelivery } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Update shipment status
app.patch('/shipments/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'returned', 'cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${valid.join(', ')}` });

    const shipment = get('SELECT * FROM shipments WHERE id = ?', [req.params.id]);
    if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });

    if (status === 'delivered') {
      run('UPDATE shipments SET status = ?, actual_delivery = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?', [status, req.params.id]);
    } else {
      run('UPDATE shipments SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [status, req.params.id]);
    }

    res.json({ success: true, data: { id: req.params.id, status } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Tracking ────────────────────────────────────────────────────────

// Get tracking timeline for a shipment
app.get('/tracking/shipment/:shipment_id', (req, res) => {
  try {
    const events = query('SELECT * FROM tracking_events WHERE shipment_id = ? ORDER BY occurred_at ASC', [req.params.shipment_id]);
    res.json({ success: true, data: events });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get tracking by tracking number
app.get('/tracking/number/:tracking_number', (req, res) => {
  try {
    const shipment = get('SELECT * FROM shipments WHERE tracking_number = ?', [req.params.tracking_number]);
    if (!shipment) return res.status(404).json({ success: false, error: 'Tracking number not found' });
    const events = query('SELECT * FROM tracking_events WHERE shipment_id = ? ORDER BY occurred_at ASC', [shipment.id]);
    res.json({ success: true, data: { shipment: { ...shipment, dimensions: JSON.parse(shipment.dimensions || '{}') }, events } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Add tracking event
app.post('/tracking', (req, res) => {
  try {
    const { shipment_id, status, location, description, occurred_at } = req.body;
    if (!shipment_id || !status) return res.status(400).json({ success: false, error: 'shipment_id and status are required' });

    const shipment = get('SELECT * FROM shipments WHERE id = ?', [shipment_id]);
    if (!shipment) return res.status(400).json({ success: false, error: 'Shipment not found' });

    const id = uuidv4();
    run('INSERT INTO tracking_events (id, shipment_id, status, location, description, occurred_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, shipment_id, status, location, description, occurred_at || new Date().toISOString()]);

    // Update shipment status
    run('UPDATE shipments SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [status, shipment_id]);

    res.status(201).json({ success: true, data: { id, shipment_id, status, location, description } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Rates ───────────────────────────────────────────────────────────

// Calculate shipping rate
app.post('/rates/calculate', (req, res) => {
  try {
    const { weight = 0, carrier_id } = req.body;
    const weightNum = parseFloat(weight) || 0;

    if (carrier_id) {
      const carrier = get('SELECT * FROM carriers WHERE id = ? AND is_active = 1', [carrier_id]);
      if (carrier) {
        const config = JSON.parse(carrier.config || '{}');
        const baseRate = config.base_rate || DEFAULT_BASE_RATE;
        const perKgRate = config.per_kg_rate || DEFAULT_PER_KG_RATE;
        const totalCost = Math.round((baseRate + weightNum * perKgRate) * 100) / 100;
        return res.json({
          success: true,
          data: { carrier_id: carrier.id, carrier_name: carrier.name, carrier_code: carrier.code, weight: weightNum, base_rate: baseRate, per_kg_rate: perKgRate, total_cost: totalCost, currency: 'USD', estimated_days: 5 }
        });
      }
    }

    // Return rates for all active carriers, or default
    const carriers = query('SELECT * FROM carriers WHERE is_active = 1 ORDER BY name ASC');
    if (carriers.length === 0) {
      const totalCost = Math.round((DEFAULT_BASE_RATE + weightNum * DEFAULT_PER_KG_RATE) * 100) / 100;
      return res.json({
        success: true,
        data: { carrier_id: null, carrier_name: 'Standard Shipping', carrier_code: 'standard', weight: weightNum, base_rate: DEFAULT_BASE_RATE, per_kg_rate: DEFAULT_PER_KG_RATE, total_cost: totalCost, currency: 'USD', estimated_days: 5 }
      });
    }

    const rates = carriers.map(c => {
      const config = JSON.parse(c.config || '{}');
      const baseRate = config.base_rate || DEFAULT_BASE_RATE;
      const perKgRate = config.per_kg_rate || DEFAULT_PER_KG_RATE;
      const totalCost = Math.round((baseRate + weightNum * perKgRate) * 100) / 100;
      return { carrier_id: c.id, carrier_name: c.name, carrier_code: c.code, weight: weightNum, base_rate: baseRate, per_kg_rate: perKgRate, total_cost: totalCost, currency: 'USD', estimated_days: 5 };
    });

    res.json({ success: true, data: rates });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'shipping_integration', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Shipping Integration Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
