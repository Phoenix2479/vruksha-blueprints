const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');
const { notifyAccounting } = require('../shared/accounting-hook');

const app = express();
const PORT = process.env.PORT || 9163;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'returns_management', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'returns_management' }));
app.get('/readyz', (req, res) => res.json({ status: 'ok', service: 'returns_management', ready: true }));

// ══════════════════════════════════════════════════════════════════════
// RETURNS
// ══════════════════════════════════════════════════════════════════════

// List returns
app.get('/returns', (req, res) => {
  const { status, order_id, customer_id, limit = 20, offset = 0 } = req.query;
  let sql = 'SELECT * FROM returns WHERE 1=1';
  const params = [];

  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (order_id) { sql += ' AND order_id = ?'; params.push(order_id); }
  if (customer_id) { sql += ' AND customer_id = ?'; params.push(customer_id); }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const returns = query(sql, params);
  res.json({ success: true, returns });
});

// Get return by ID
app.get('/returns/:id', (req, res) => {
  const ret = get('SELECT * FROM returns WHERE id = ?', [req.params.id]);
  if (!ret) return res.status(404).json({ error: 'Return not found' });

  const items = query('SELECT * FROM return_items WHERE return_id = ?', [req.params.id]);
  const exchanges = query('SELECT * FROM exchanges WHERE return_id = ?', [req.params.id]);
  res.json({ success: true, return: { ...ret, items, exchanges } });
});

// Create return
app.post('/returns', (req, res) => {
  const { order_id, customer_id, reason, reason_category, refund_method, notes, items } = req.body;
  if (!order_id) return res.status(400).json({ error: 'order_id is required' });

  const id = uuidv4();
  const refundAmount = items
    ? items.reduce((sum, i) => sum + (parseFloat(i.unit_price) || 0) * (i.quantity || 1), 0)
    : 0;

  run(
    `INSERT INTO returns (id, order_id, customer_id, status, reason, reason_category, refund_amount, refund_method, notes, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [id, order_id, customer_id || null, reason, reason_category || null,
     refundAmount, refund_method || 'original_payment', notes || null]
  );

  if (items && items.length > 0) {
    for (const item of items) {
      run(
        `INSERT INTO return_items (id, return_id, product_id, variant_id, quantity, unit_price, reason, condition, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [uuidv4(), id, item.product_id, item.variant_id || null,
         item.quantity || 1, parseFloat(item.unit_price) || 0,
         item.reason || null, item.condition || 'unopened']
      );
    }
  }

  notifyAccounting('return.created', { return_id: id, order_id, refund_amount: refundAmount });
  const created = get('SELECT * FROM returns WHERE id = ?', [id]);
  res.status(201).json({ success: true, return: created });
});

// Update return status
app.patch('/returns/:id', (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'status is required' });

  const existing = get('SELECT * FROM returns WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Return not found' });

  const validTransitions = {
    pending: ['approved', 'rejected'],
    approved: ['processing', 'completed', 'cancelled'],
    processing: ['completed', 'cancelled']
  };

  if (!validTransitions[existing.status]?.includes(status)) {
    return res.status(400).json({ error: `Cannot transition from ${existing.status} to ${status}` });
  }

  run('UPDATE returns SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [status, req.params.id]);

  if (status === 'completed') {
    notifyAccounting('return.completed', { return_id: req.params.id, refund_amount: existing.refund_amount });
  }

  const updated = get('SELECT * FROM returns WHERE id = ?', [req.params.id]);
  res.json({ success: true, return: updated });
});

// Create exchange
app.post('/returns/:id/exchange', (req, res) => {
  const ret = get('SELECT * FROM returns WHERE id = ?', [req.params.id]);
  if (!ret) return res.status(404).json({ error: 'Return not found' });
  if (!['approved', 'processing'].includes(ret.status)) {
    return res.status(400).json({ error: 'Return must be approved before creating an exchange' });
  }

  const { original_product_id, new_product_id, original_variant_id, new_variant_id, quantity, price_difference } = req.body;
  if (!original_product_id || !new_product_id) {
    return res.status(400).json({ error: 'original_product_id and new_product_id are required' });
  }

  const id = uuidv4();
  run(
    `INSERT INTO exchanges (id, return_id, original_product_id, original_variant_id, new_product_id, new_variant_id, quantity, price_difference, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))`,
    [id, req.params.id, original_product_id, original_variant_id || null,
     new_product_id, new_variant_id || null, quantity || 1, parseFloat(price_difference) || 0]
  );

  const exchange = get('SELECT * FROM exchanges WHERE id = ?', [id]);
  res.status(201).json({ success: true, exchange });
});

// List exchanges for a return
app.get('/returns/:id/exchanges', (req, res) => {
  const exchanges = query('SELECT * FROM exchanges WHERE return_id = ? ORDER BY created_at', [req.params.id]);
  res.json({ success: true, exchanges });
});

// ══════════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════════

initDb(`
  CREATE TABLE IF NOT EXISTS returns (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    customer_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    reason TEXT,
    reason_category TEXT,
    refund_amount REAL DEFAULT 0,
    refund_method TEXT DEFAULT 'original_payment',
    notes TEXT,
    approved_at TEXT,
    approved_by TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS return_items (
    id TEXT PRIMARY KEY,
    return_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    variant_id TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price REAL DEFAULT 0,
    reason TEXT,
    condition TEXT DEFAULT 'unopened',
    created_at TEXT NOT NULL,
    FOREIGN KEY (return_id) REFERENCES returns(id)
  );

  CREATE TABLE IF NOT EXISTS exchanges (
    id TEXT PRIMARY KEY,
    return_id TEXT NOT NULL,
    original_product_id TEXT NOT NULL,
    original_variant_id TEXT,
    new_product_id TEXT NOT NULL,
    new_variant_id TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    price_difference REAL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (return_id) REFERENCES returns(id)
  );

  CREATE INDEX IF NOT EXISTS idx_returns_order ON returns(order_id);
  CREATE INDEX IF NOT EXISTS idx_returns_status ON returns(status);
  CREATE INDEX IF NOT EXISTS idx_return_items_return ON return_items(return_id);
  CREATE INDEX IF NOT EXISTS idx_exchanges_return ON exchanges(return_id);
`);

app.listen(PORT, () => {
  console.log(`Returns Management (lite) listening on port ${PORT}`);
});
