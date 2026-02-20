/**
 * Payment Gateway Service - Niyam Hospitality (Max Lite)
 * Payment processing, refunds, settlements
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8930;
const SERVICE_NAME = 'payment_gateway';

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) { app.use(express.static(uiPath)); }

app.get('/health', (req, res) => res.json({ status: 'ok', service: SERVICE_NAME, mode: 'lite' }));

async function ensureTables() {
  const db = await initDb();
  
  db.run(`CREATE TABLE IF NOT EXISTS payment_transactions (
    id TEXT PRIMARY KEY, transaction_ref TEXT UNIQUE, reservation_id TEXT, guest_id TEXT,
    amount REAL NOT NULL, currency TEXT DEFAULT 'INR', payment_method TEXT NOT NULL,
    card_last_four TEXT, card_brand TEXT, gateway TEXT DEFAULT 'manual',
    gateway_ref TEXT, status TEXT DEFAULT 'pending', authorized_at TEXT, captured_at TEXT,
    failed_at TEXT, failure_reason TEXT, metadata TEXT, created_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS refunds (
    id TEXT PRIMARY KEY, transaction_id TEXT NOT NULL, refund_ref TEXT UNIQUE,
    amount REAL NOT NULL, reason TEXT, status TEXT DEFAULT 'pending',
    gateway_ref TEXT, processed_at TEXT, created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS payment_methods (
    id TEXT PRIMARY KEY, guest_id TEXT NOT NULL, method_type TEXT NOT NULL,
    card_last_four TEXT, card_brand TEXT, card_expiry TEXT, is_default INTEGER DEFAULT 0,
    token TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS settlements (
    id TEXT PRIMARY KEY, settlement_date TEXT NOT NULL, gateway TEXT,
    total_transactions INTEGER DEFAULT 0, gross_amount REAL DEFAULT 0,
    fees REAL DEFAULT 0, net_amount REAL DEFAULT 0, status TEXT DEFAULT 'pending',
    settled_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS settlement_items (
    id TEXT PRIMARY KEY, settlement_id TEXT NOT NULL, transaction_id TEXT NOT NULL,
    amount REAL NOT NULL, fee REAL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  
  return db;
}

// PROCESS PAYMENT
app.post('/charge', async (req, res) => {
  try {
    await ensureTables();
    const { amount, currency, payment_method, reservation_id, guest_id, card_last_four, card_brand, metadata, created_by } = req.body;
    
    if (!amount || amount <= 0) return res.status(400).json({ success: false, error: 'Invalid amount' });
    
    const id = generateId();
    const transactionRef = `TXN${Date.now().toString(36).toUpperCase()}`;
    
    // In production, this would call actual payment gateway
    // For lite, we simulate successful payment
    run(`INSERT INTO payment_transactions (id, transaction_ref, reservation_id, guest_id, amount, currency, payment_method, card_last_four, card_brand, gateway, status, authorized_at, captured_at, metadata, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', 'captured', ?, ?, ?, ?, ?)`,
      [id, transactionRef, reservation_id, guest_id, amount, currency || 'INR', payment_method, card_last_four, card_brand, timestamp(), timestamp(), JSON.stringify(metadata || {}), created_by, timestamp()]);
    
    // Update reservation if linked
    if (reservation_id) {
      run(`INSERT INTO payments (id, reservation_id, guest_id, amount, payment_method, reference_number, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?)`,
        [generateId(), reservation_id, guest_id, amount, payment_method, transactionRef, timestamp()]);
    }
    
    res.json({ success: true, transaction: { id, transaction_ref: transactionRef, amount, status: 'captured' } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// AUTHORIZE (hold without capture)
app.post('/authorize', async (req, res) => {
  try {
    await ensureTables();
    const { amount, currency, payment_method, reservation_id, guest_id, card_last_four, card_brand } = req.body;
    
    const id = generateId();
    const transactionRef = `AUTH${Date.now().toString(36).toUpperCase()}`;
    
    run(`INSERT INTO payment_transactions (id, transaction_ref, reservation_id, guest_id, amount, currency, payment_method, card_last_four, card_brand, gateway, status, authorized_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', 'authorized', ?, ?)`,
      [id, transactionRef, reservation_id, guest_id, amount, currency || 'INR', payment_method, card_last_four, card_brand, timestamp(), timestamp()]);
    
    res.json({ success: true, transaction: { id, transaction_ref: transactionRef, amount, status: 'authorized' } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// CAPTURE authorized payment
app.post('/capture/:transactionId', async (req, res) => {
  try {
    await ensureTables();
    const { transactionId } = req.params;
    const { amount } = req.body;
    
    const txn = get(`SELECT * FROM payment_transactions WHERE id = ? AND status = 'authorized'`, [transactionId]);
    if (!txn) return res.status(404).json({ success: false, error: 'Authorization not found' });
    
    const captureAmount = amount || txn.amount;
    if (captureAmount > txn.amount) return res.status(400).json({ success: false, error: 'Capture amount exceeds authorization' });
    
    run(`UPDATE payment_transactions SET status = 'captured', captured_at = ?, amount = ? WHERE id = ?`,
      [timestamp(), captureAmount, transactionId]);
    
    res.json({ success: true, transaction: { id: transactionId, amount: captureAmount, status: 'captured' } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// VOID authorization
app.post('/void/:transactionId', async (req, res) => {
  try {
    await ensureTables();
    const txn = get(`SELECT * FROM payment_transactions WHERE id = ? AND status = 'authorized'`, [req.params.transactionId]);
    if (!txn) return res.status(404).json({ success: false, error: 'Authorization not found' });
    
    run(`UPDATE payment_transactions SET status = 'voided' WHERE id = ?`, [req.params.transactionId]);
    res.json({ success: true, message: 'Authorization voided' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// REFUND
app.post('/refund', async (req, res) => {
  try {
    await ensureTables();
    const { transaction_id, amount, reason, created_by } = req.body;
    
    const txn = get(`SELECT * FROM payment_transactions WHERE id = ? AND status = 'captured'`, [transaction_id]);
    if (!txn) return res.status(404).json({ success: false, error: 'Transaction not found' });
    
    const existingRefunds = get(`SELECT SUM(amount) as total FROM refunds WHERE transaction_id = ? AND status != 'failed'`, [transaction_id]);
    const refundedAmount = existingRefunds?.total || 0;
    const refundAmount = amount || txn.amount;
    
    if (refundAmount > (txn.amount - refundedAmount)) {
      return res.status(400).json({ success: false, error: 'Refund amount exceeds available balance' });
    }
    
    const id = generateId();
    const refundRef = `REF${Date.now().toString(36).toUpperCase()}`;
    
    run(`INSERT INTO refunds (id, transaction_id, refund_ref, amount, reason, status, processed_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?)`,
      [id, transaction_id, refundRef, refundAmount, reason, timestamp(), created_by, timestamp()]);
    
    // If fully refunded, update transaction status
    if (refundAmount + refundedAmount >= txn.amount) {
      run(`UPDATE payment_transactions SET status = 'refunded' WHERE id = ?`, [transaction_id]);
    }
    
    res.json({ success: true, refund: { id, refund_ref: refundRef, amount: refundAmount, status: 'completed' } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// TRANSACTIONS
app.get('/transactions', async (req, res) => {
  try {
    await ensureTables();
    const { reservation_id, guest_id, status, from_date, to_date, limit = 50 } = req.query;
    let sql = `SELECT * FROM payment_transactions WHERE 1=1`;
    const params = [];
    if (reservation_id) { sql += ` AND reservation_id = ?`; params.push(reservation_id); }
    if (guest_id) { sql += ` AND guest_id = ?`; params.push(guest_id); }
    if (status) { sql += ` AND status = ?`; params.push(status); }
    if (from_date) { sql += ` AND DATE(created_at) >= ?`; params.push(from_date); }
    if (to_date) { sql += ` AND DATE(created_at) <= ?`; params.push(to_date); }
    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(parseInt(limit));
    res.json({ success: true, transactions: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/transactions/:id', async (req, res) => {
  try {
    await ensureTables();
    const txn = get(`SELECT * FROM payment_transactions WHERE id = ?`, [req.params.id]);
    if (!txn) return res.status(404).json({ success: false, error: 'Transaction not found' });
    const refunds = query(`SELECT * FROM refunds WHERE transaction_id = ? ORDER BY created_at DESC`, [req.params.id]);
    res.json({ success: true, transaction: { ...txn, refunds } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// SAVED PAYMENT METHODS
app.get('/methods/:guestId', async (req, res) => {
  try {
    await ensureTables();
    const methods = query(`SELECT id, method_type, card_last_four, card_brand, card_expiry, is_default FROM payment_methods WHERE guest_id = ?`, [req.params.guestId]);
    res.json({ success: true, methods });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/methods', async (req, res) => {
  try {
    await ensureTables();
    const { guest_id, method_type, card_last_four, card_brand, card_expiry, is_default, token } = req.body;
    const id = generateId();
    if (is_default) run(`UPDATE payment_methods SET is_default = 0 WHERE guest_id = ?`, [guest_id]);
    run(`INSERT INTO payment_methods (id, guest_id, method_type, card_last_four, card_brand, card_expiry, is_default, token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, guest_id, method_type, card_last_four, card_brand, card_expiry, is_default ? 1 : 0, token, timestamp()]);
    res.json({ success: true, method: { id } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete('/methods/:id', async (req, res) => {
  try {
    await ensureTables();
    run(`DELETE FROM payment_methods WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// SETTLEMENTS
app.get('/settlements', async (req, res) => {
  try {
    await ensureTables();
    const { status, from_date, to_date } = req.query;
    let sql = `SELECT * FROM settlements WHERE 1=1`;
    const params = [];
    if (status) { sql += ` AND status = ?`; params.push(status); }
    if (from_date) { sql += ` AND settlement_date >= ?`; params.push(from_date); }
    if (to_date) { sql += ` AND settlement_date <= ?`; params.push(to_date); }
    sql += ` ORDER BY settlement_date DESC`;
    res.json({ success: true, settlements: query(sql, params) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/settlements/generate', async (req, res) => {
  try {
    await ensureTables();
    const { date } = req.body;
    const settlementDate = date || new Date().toISOString().split('T')[0];
    
    // Get unsettled transactions
    const txns = query(`SELECT * FROM payment_transactions WHERE status = 'captured' AND DATE(captured_at) = ? AND id NOT IN (SELECT transaction_id FROM settlement_items)`, [settlementDate]);
    
    if (txns.length === 0) return res.json({ success: true, message: 'No transactions to settle' });
    
    const id = generateId();
    const grossAmount = txns.reduce((sum, t) => sum + t.amount, 0);
    const fees = grossAmount * 0.02; // 2% fee simulation
    const netAmount = grossAmount - fees;
    
    run(`INSERT INTO settlements (id, settlement_date, total_transactions, gross_amount, fees, net_amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [id, settlementDate, txns.length, grossAmount, fees, netAmount, timestamp()]);
    
    for (const txn of txns) {
      const fee = txn.amount * 0.02;
      run(`INSERT INTO settlement_items (id, settlement_id, transaction_id, amount, fee, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [generateId(), id, txn.id, txn.amount, fee, timestamp()]);
    }
    
    res.json({ success: true, settlement: { id, gross_amount: grossAmount, net_amount: netAmount, transactions: txns.length } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// STATS
app.get('/stats', async (req, res) => {
  try {
    await ensureTables();
    const { days = 30 } = req.query;
    const totals = get(`SELECT COUNT(*) as count, SUM(amount) as amount FROM payment_transactions WHERE status = 'captured' AND created_at > datetime('now', '-${parseInt(days)} days')`);
    const refundTotals = get(`SELECT COUNT(*) as count, SUM(amount) as amount FROM refunds WHERE status = 'completed' AND created_at > datetime('now', '-${parseInt(days)} days')`);
    const byMethod = query(`SELECT payment_method, COUNT(*) as count, SUM(amount) as amount FROM payment_transactions WHERE status = 'captured' AND created_at > datetime('now', '-${parseInt(days)} days') GROUP BY payment_method`);
    res.json({ success: true, stats: { transactions: totals?.count || 0, revenue: totals?.amount || 0, refunds: refundTotals?.count || 0, refund_amount: refundTotals?.amount || 0, by_method: byMethod } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

async function start() {
  await ensureTables();
  app.get('*', (req, res) => {
    if (fs.existsSync(path.join(uiPath, 'index.html'))) res.sendFile(path.join(uiPath, 'index.html'));
    else res.json({ service: SERVICE_NAME, mode: 'lite', status: 'running' });
  });
  app.listen(PORT, () => console.log(`✅ ${SERVICE_NAME} (Lite) running on port ${PORT}`));
}

start();
