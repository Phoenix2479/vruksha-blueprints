const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8867;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'logistics', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'logistics' }));

// === SHIPMENTS ===
app.get('/shipments', (req, res) => {
  try {
    const { status, order_id, carrier, limit = 100 } = req.query;
    let sql = 'SELECT * FROM shipments WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (order_id) { sql += ' AND order_id = ?'; params.push(order_id); }
    if (carrier) { sql += ' AND carrier = ?'; params.push(carrier); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    res.json({ success: true, shipments: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/shipments/:id', (req, res) => {
  try {
    const shipment = get('SELECT * FROM shipments WHERE id = ?', [req.params.id]);
    if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
    res.json({ success: true, shipment });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/shipments', (req, res) => {
  try {
    const { order_id, carrier, tracking_number, origin, destination, estimated_delivery, cost } = req.body;
    if (!order_id) return res.status(400).json({ success: false, error: 'order_id required' });
    const id = uuidv4();
    run(`INSERT INTO shipments (id, order_id, carrier, tracking_number, origin, destination, estimated_delivery, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, order_id, carrier, tracking_number, origin, destination, estimated_delivery, cost || 0]);
    res.json({ success: true, shipment: { id, tracking_number, status: 'pending' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.patch('/shipments/:id/status', (req, res) => {
  try {
    const { status, tracking_number, actual_delivery } = req.body;
    const valid = ['pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'returned', 'cancelled'];
    if (status && !valid.includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });
    
    let sql = 'UPDATE shipments SET updated_at = ?';
    const params = [new Date().toISOString()];
    if (status) { sql += ', status = ?'; params.push(status); }
    if (tracking_number) { sql += ', tracking_number = ?'; params.push(tracking_number); }
    if (actual_delivery || status === 'delivered') { sql += ', actual_delivery = ?'; params.push(actual_delivery || new Date().toISOString()); }
    sql += ' WHERE id = ?';
    params.push(req.params.id);
    
    run(sql, params);
    res.json({ success: true, message: 'Shipment updated' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Track shipment
app.get('/shipments/:id/track', (req, res) => {
  try {
    const shipment = get('SELECT * FROM shipments WHERE id = ? OR tracking_number = ?', [req.params.id, req.params.id]);
    if (!shipment) return res.status(404).json({ success: false, error: 'Shipment not found' });
    
    // Simple tracking events based on status
    const events = [];
    if (shipment.created_at) events.push({ status: 'created', timestamp: shipment.created_at, location: shipment.origin });
    if (['picked_up', 'in_transit', 'out_for_delivery', 'delivered'].includes(shipment.status)) {
      events.push({ status: 'picked_up', timestamp: shipment.created_at, location: shipment.origin });
    }
    if (['in_transit', 'out_for_delivery', 'delivered'].includes(shipment.status)) {
      events.push({ status: 'in_transit', timestamp: shipment.updated_at, location: 'In Transit' });
    }
    if (['out_for_delivery', 'delivered'].includes(shipment.status)) {
      events.push({ status: 'out_for_delivery', timestamp: shipment.updated_at, location: shipment.destination });
    }
    if (shipment.status === 'delivered') {
      events.push({ status: 'delivered', timestamp: shipment.actual_delivery || shipment.updated_at, location: shipment.destination });
    }
    
    res.json({ success: true, shipment, tracking_events: events });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get rates (simplified)
app.post('/shipping/rates', (req, res) => {
  try {
    const { origin, destination, weight, dimensions } = req.body;
    
    // Simplified rate calculation
    const baseRate = 5.00;
    const weightRate = (weight || 1) * 0.50;
    const rates = [
      { carrier: 'Standard', service: 'Ground', price: baseRate + weightRate, days: '5-7' },
      { carrier: 'Express', service: 'Air', price: (baseRate + weightRate) * 2, days: '2-3' },
      { carrier: 'Priority', service: 'Overnight', price: (baseRate + weightRate) * 4, days: '1' }
    ];
    
    res.json({ success: true, rates });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Logistics stats
app.get('/logistics/stats', (req, res) => {
  try {
    const stats = get(`SELECT COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'in_transit' THEN 1 ELSE 0 END) as in_transit,
      SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
      SUM(cost) as total_cost FROM shipments`);
    const byCarrier = query('SELECT carrier, COUNT(*) as count FROM shipments GROUP BY carrier');
    res.json({ success: true, stats: stats || {}, by_carrier: byCarrier });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Pending deliveries
app.get('/shipments/pending', (req, res) => {
  try {
    const shipments = query("SELECT * FROM shipments WHERE status NOT IN ('delivered', 'cancelled', 'returned') ORDER BY estimated_delivery");
    res.json({ success: true, shipments });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'logistics', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Logistics Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
