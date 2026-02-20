const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');
const { notifyAccounting } = require('../shared/accounting-hook');

const app = express();
const PORT = process.env.PORT || 9156;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'payment_gateway', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'payment_gateway' }));
app.get('/readyz', (req, res) => res.json({ status: 'ok', service: 'payment_gateway', ready: true }));

// ── Gateway Configs ─────────────────────────────────────────────

// List gateways
app.get('/gateways', (req, res) => {
  try {
    const { active_only } = req.query;
    let sql = 'SELECT * FROM gateway_configs WHERE 1=1';
    const params = [];
    if (active_only === 'true') { sql += ' AND is_active = 1'; }
    sql += ' ORDER BY is_default DESC, created_at DESC';
    const gateways = query(sql, params);
    res.json({ success: true, data: gateways });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get gateway by ID
app.get('/gateways/:id', (req, res) => {
  try {
    const gateway = get('SELECT * FROM gateway_configs WHERE id = ?', [req.params.id]);
    if (!gateway) return res.status(404).json({ success: false, error: 'Gateway not found' });
    res.json({ success: true, data: gateway });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Create gateway
app.post('/gateways', (req, res) => {
  try {
    const { provider, display_name, credentials, is_active, is_default, supported_methods } = req.body;
    if (!provider || !display_name) {
      return res.status(400).json({ success: false, error: 'provider and display_name are required' });
    }
    const id = uuidv4();

    // If setting as default, unset others
    if (is_default) {
      run('UPDATE gateway_configs SET is_default = 0 WHERE is_default = 1');
    }

    run(`INSERT INTO gateway_configs (id, provider, display_name, credentials, is_active, is_default, supported_methods)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, provider, display_name, JSON.stringify(credentials || {}), is_active !== false ? 1 : 0, is_default ? 1 : 0, JSON.stringify(supported_methods || ['card'])]);

    res.status(201).json({ success: true, data: { id, provider, display_name, is_active: is_active !== false, is_default: !!is_default } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Update gateway
app.put('/gateways/:id', (req, res) => {
  try {
    const existing = get('SELECT * FROM gateway_configs WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Gateway not found' });

    const { provider, display_name, credentials, is_active, is_default, supported_methods } = req.body;

    if (is_default) {
      run('UPDATE gateway_configs SET is_default = 0 WHERE is_default = 1 AND id != ?', [req.params.id]);
    }

    run(`UPDATE gateway_configs SET provider = ?, display_name = ?, credentials = ?, is_active = ?, is_default = ?, supported_methods = ? WHERE id = ?`,
      [
        provider !== undefined ? provider : existing.provider,
        display_name !== undefined ? display_name : existing.display_name,
        credentials !== undefined ? JSON.stringify(credentials) : existing.credentials,
        is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
        is_default !== undefined ? (is_default ? 1 : 0) : existing.is_default,
        supported_methods !== undefined ? JSON.stringify(supported_methods) : existing.supported_methods,
        req.params.id
      ]);

    res.json({ success: true, data: { message: 'Gateway updated' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Delete gateway
app.delete('/gateways/:id', (req, res) => {
  try {
    const existing = get('SELECT * FROM gateway_configs WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Gateway not found' });
    run('DELETE FROM gateway_configs WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: { message: 'Gateway deleted' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Transactions ────────────────────────────────────────────────

// List transactions
app.get('/transactions', (req, res) => {
  try {
    const { order_id, status, type, limit = 100 } = req.query;
    let sql = 'SELECT * FROM transactions WHERE 1=1';
    const params = [];
    if (order_id) { sql += ' AND order_id = ?'; params.push(order_id); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (type) { sql += ' AND type = ?'; params.push(type); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    const transactions = query(sql, params);
    res.json({ success: true, data: transactions });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get transaction by ID
app.get('/transactions/:id', (req, res) => {
  try {
    const txn = get('SELECT * FROM transactions WHERE id = ?', [req.params.id]);
    if (!txn) return res.status(404).json({ success: false, error: 'Transaction not found' });
    res.json({ success: true, data: txn });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Authorize a payment
app.post('/transactions/authorize', (req, res) => {
  try {
    const { order_id, gateway_id, amount, currency, payment_method, metadata } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Valid amount is required' });
    }

    const id = uuidv4();
    const cardLastFour = String(Math.floor(1000 + Math.random() * 9000));
    const referenceId = `TXN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    run(`INSERT INTO transactions (id, order_id, gateway_id, type, amount, currency, status, payment_method, card_last_four, reference_id, metadata)
         VALUES (?, ?, ?, 'charge', ?, ?, 'authorized', ?, ?, ?, ?)`,
      [id, order_id || null, gateway_id || null, amount, currency || 'USD', payment_method || 'card', cardLastFour, referenceId, JSON.stringify(metadata || {})]);

    res.status(201).json({ success: true, data: { id, type: 'charge', amount, status: 'authorized', card_last_four: cardLastFour, reference_id: referenceId } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Capture an authorized payment
app.post('/transactions/:id/capture', (req, res) => {
  try {
    const txn = get('SELECT * FROM transactions WHERE id = ?', [req.params.id]);
    if (!txn) return res.status(404).json({ success: false, error: 'Transaction not found' });
    if (txn.status !== 'authorized') {
      return res.status(400).json({ success: false, error: `Cannot capture transaction with status '${txn.status}'` });
    }

    const referenceId = `CAP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    run('UPDATE transactions SET status = ?, type = ?, reference_id = ? WHERE id = ?', ['captured', 'capture', referenceId, req.params.id]);

    notifyAccounting('ecommerce', 'ecommerce.payment.completed', {
      transaction_id: req.params.id, order_id: txn.order_id, amount: txn.amount, payment_method: txn.payment_method
    });

    res.json({ success: true, data: { id: req.params.id, status: 'captured', reference_id: referenceId } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Refund a captured payment
app.post('/transactions/:id/refund', (req, res) => {
  try {
    const txn = get('SELECT * FROM transactions WHERE id = ?', [req.params.id]);
    if (!txn) return res.status(404).json({ success: false, error: 'Transaction not found' });
    if (txn.status !== 'captured') {
      return res.status(400).json({ success: false, error: `Cannot refund transaction with status '${txn.status}'` });
    }

    const refundAmount = req.body.amount || txn.amount;
    if (refundAmount <= 0 || refundAmount > txn.amount) {
      return res.status(400).json({ success: false, error: `Refund amount must be between 0.01 and ${txn.amount}` });
    }

    const refundId = uuidv4();
    const referenceId = `REF-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const isFullRefund = refundAmount >= txn.amount;

    run(`INSERT INTO transactions (id, order_id, gateway_id, type, amount, currency, status, payment_method, card_last_four, reference_id, metadata)
         VALUES (?, ?, ?, 'refund', ?, ?, 'refunded', ?, ?, ?, ?)`,
      [refundId, txn.order_id, txn.gateway_id, refundAmount, txn.currency, txn.payment_method, txn.card_last_four, referenceId,
       JSON.stringify({ reason: req.body.reason || 'Customer requested refund', original_transaction_id: req.params.id })]);

    if (isFullRefund) {
      run('UPDATE transactions SET status = ? WHERE id = ?', ['refunded', req.params.id]);
    }

    res.json({ success: true, data: { refund: { id: refundId, amount: refundAmount, status: 'refunded', reference_id: referenceId }, original_status: isFullRefund ? 'refunded' : 'captured' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Void a pending/authorized payment
app.post('/transactions/:id/void', (req, res) => {
  try {
    const txn = get('SELECT * FROM transactions WHERE id = ?', [req.params.id]);
    if (!txn) return res.status(404).json({ success: false, error: 'Transaction not found' });
    if (txn.status !== 'authorized' && txn.status !== 'pending') {
      return res.status(400).json({ success: false, error: `Cannot void transaction with status '${txn.status}'` });
    }

    run('UPDATE transactions SET status = ?, type = ? WHERE id = ?', ['voided', 'void', req.params.id]);
    res.json({ success: true, data: { id: req.params.id, status: 'voided' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'payment_gateway', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Payment Gateway Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
