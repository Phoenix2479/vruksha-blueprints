/**
 * Bank Reconciliation - Lite Version (SQLite)
 * Port: 8854
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');
const { sendCSV } = require('../shared/csv-generator');
const { sendPDF, addHeader, addTable, fmtCurrency, fmtDate } = require('../shared/pdf-generator');

const app = express();
const PORT = process.env.PORT || 8854;

app.use(cors());
app.use(express.json());

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'accounting_bank_reconciliation', mode: 'lite' });
});

// Bank accounts
app.get('/api/bank-accounts', (req, res) => {
  try {
    const accounts = query(`
      SELECT ba.*, a.account_code, a.account_name
      FROM acc_bank_accounts ba
      LEFT JOIN acc_accounts a ON ba.account_id = a.id
      WHERE ba.is_active = 1
      ORDER BY ba.bank_name
    `);
    res.json({ success: true, data: accounts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/bank-accounts', (req, res) => {
  try {
    const { account_id, bank_name, account_number, ifsc_code, branch, account_type, currency, opening_balance } = req.body;
    if (!bank_name || !account_number) {
      return res.status(400).json({ success: false, error: 'bank_name and account_number required' });
    }
    const id = uuidv4();
    const balance = opening_balance || 0;
    run(
      `INSERT INTO acc_bank_accounts (id, account_id, bank_name, account_number, ifsc_code, branch, account_type, currency, opening_balance, current_balance)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, account_id || null, bank_name, account_number, ifsc_code || null, branch || null, account_type || 'current', currency || 'INR', balance, balance]
    );
    const created = get('SELECT * FROM acc_bank_accounts WHERE id = ?', [id]);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Bank transactions
app.get('/api/bank-accounts/:bankId/transactions', (req, res) => {
  try {
    const { start_date, end_date, reconciled } = req.query;
    let sql = 'SELECT * FROM acc_bank_transactions WHERE bank_account_id = ?';
    const params = [req.params.bankId];

    if (start_date) { sql += ' AND transaction_date >= ?'; params.push(start_date); }
    if (end_date) { sql += ' AND transaction_date <= ?'; params.push(end_date); }
    if (reconciled !== undefined) { sql += ' AND is_reconciled = ?'; params.push(reconciled === 'true' ? 1 : 0); }

    sql += ' ORDER BY transaction_date DESC';
    const transactions = query(sql, params);
    res.json({ success: true, data: transactions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/bank-accounts/:bankId/transactions', (req, res) => {
  try {
    const { transaction_date, description, reference, debit_amount, credit_amount } = req.body;
    if (!transaction_date) {
      return res.status(400).json({ success: false, error: 'transaction_date required' });
    }

    const bank = get('SELECT * FROM acc_bank_accounts WHERE id = ?', [req.params.bankId]);
    if (!bank) return res.status(404).json({ success: false, error: 'Bank account not found' });

    const id = uuidv4();
    const debit = debit_amount || 0;
    const credit = credit_amount || 0;
    const newBalance = bank.current_balance + credit - debit;

    run(
      `INSERT INTO acc_bank_transactions (id, bank_account_id, transaction_date, description, reference, debit_amount, credit_amount, balance)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.params.bankId, transaction_date, description || null, reference || null, debit, credit, newBalance]
    );

    run('UPDATE acc_bank_accounts SET current_balance = ?, updated_at = datetime(\'now\') WHERE id = ?', [newBalance, req.params.bankId]);

    const created = get('SELECT * FROM acc_bank_transactions WHERE id = ?', [id]);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reconcile a transaction
app.post('/api/bank-transactions/:id/reconcile', (req, res) => {
  try {
    const { journal_entry_id } = req.body;
    const txn = get('SELECT * FROM acc_bank_transactions WHERE id = ?', [req.params.id]);
    if (!txn) return res.status(404).json({ success: false, error: 'Transaction not found' });

    run(
      "UPDATE acc_bank_transactions SET is_reconciled = 1, reconciled_at = datetime('now'), journal_entry_id = ? WHERE id = ?",
      [journal_entry_id || null, req.params.id]
    );

    const updated = get('SELECT * FROM acc_bank_transactions WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Unreconciled transactions
app.get('/api/unreconciled', (req, res) => {
  try {
    const transactions = query(`
      SELECT bt.*, ba.bank_name, ba.account_number
      FROM acc_bank_transactions bt
      JOIN acc_bank_accounts ba ON bt.bank_account_id = ba.id
      WHERE bt.is_reconciled = 0
      ORDER BY bt.transaction_date DESC
    `);
    res.json({ success: true, data: transactions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reconciliation summary
app.get('/api/reconciliation-summary/:bankId', (req, res) => {
  try {
    const bank = get('SELECT * FROM acc_bank_accounts WHERE id = ?', [req.params.bankId]);
    if (!bank) return res.status(404).json({ success: false, error: 'Bank account not found' });

    const stats = get(`
      SELECT
        COUNT(*) as total_transactions,
        SUM(CASE WHEN is_reconciled = 1 THEN 1 ELSE 0 END) as reconciled_count,
        SUM(CASE WHEN is_reconciled = 0 THEN 1 ELSE 0 END) as unreconciled_count,
        COALESCE(SUM(CASE WHEN is_reconciled = 0 THEN debit_amount ELSE 0 END), 0) as unreconciled_debits,
        COALESCE(SUM(CASE WHEN is_reconciled = 0 THEN credit_amount ELSE 0 END), 0) as unreconciled_credits
      FROM acc_bank_transactions WHERE bank_account_id = ?
    `, [req.params.bankId]);

    res.json({ success: true, data: { bank, ...stats } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// EXPORT
// =============================================================================

app.get('/api/bank-accounts/:bankId/transactions/export/csv', (req, res) => {
  try {
    const data = query('SELECT transaction_date, description, reference, debit_amount, credit_amount, balance, CASE WHEN is_reconciled THEN \'Yes\' ELSE \'No\' END as reconciled FROM acc_bank_transactions WHERE bank_account_id = ? ORDER BY transaction_date DESC', [req.params.bankId]);
    const bank = get('SELECT bank_name, account_number FROM acc_bank_accounts WHERE id = ?', [req.params.bankId]);
    sendCSV(res, data, [
      { key: 'transaction_date', label: 'Date' }, { key: 'description', label: 'Description' },
      { key: 'reference', label: 'Reference' }, { key: 'debit_amount', label: 'Debit' },
      { key: 'credit_amount', label: 'Credit' }, { key: 'balance', label: 'Balance' },
      { key: 'reconciled', label: 'Reconciled' }
    ], `bank_transactions_${bank?.account_number || 'all'}.csv`);
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =============================================================================
// BANK STATEMENT IMPORT (CSV / OFX / MT940)
// =============================================================================

const bankParser = require('../shared/bank-parser');

app.post('/api/bank-statements/upload', (req, res) => {
  try {
    const { bank_account_id, content, file_name, format, column_mapping } = req.body;
    if (!bank_account_id || !content) return res.status(400).json({ success: false, error: 'bank_account_id and content required' });
    const bank = get('SELECT * FROM acc_bank_accounts WHERE id = ?', [bank_account_id]);
    if (!bank) return res.status(404).json({ success: false, error: 'Bank account not found' });

    const detectedFormat = format || bankParser.detectFormat(content);
    const transactions = bankParser.parse(content, detectedFormat, column_mapping ? JSON.parse(column_mapping) : {});

    const importId = uuidv4();
    run(`INSERT INTO acc_bank_imports (id, bank_account_id, file_name, file_format, total_records, status, column_mapping)
      VALUES (?, ?, ?, ?, ?, 'preview', ?)`,
      [importId, bank_account_id, file_name || 'statement', detectedFormat, transactions.length, column_mapping || null]);

    res.json({ success: true, data: { import_id: importId, format: detectedFormat, total_records: transactions.length, transactions: transactions.slice(0, 50) } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/bank-statements/parse-preview', (req, res) => {
  try {
    const { content, format, column_mapping } = req.body;
    if (!content) return res.status(400).json({ success: false, error: 'content required' });
    const detectedFormat = format || bankParser.detectFormat(content);
    const transactions = bankParser.parse(content, detectedFormat, column_mapping || {});
    res.json({ success: true, data: { format: detectedFormat, total_records: transactions.length, preview: transactions.slice(0, 20) } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/bank-statements/import-confirm', (req, res) => {
  try {
    const { import_id, bank_account_id, transactions } = req.body;
    if (!bank_account_id || !transactions || !transactions.length) {
      return res.status(400).json({ success: false, error: 'bank_account_id and transactions required' });
    }

    let imported = 0, skipped = 0;
    transactions.forEach(txn => {
      const exists = get('SELECT id FROM acc_bank_transactions WHERE bank_account_id = ? AND transaction_date = ? AND description = ? AND (debit_amount = ? OR credit_amount = ?)',
        [bank_account_id, txn.date, txn.description, Math.abs(txn.amount < 0 ? txn.amount : 0), txn.amount > 0 ? txn.amount : 0]);
      if (exists) { skipped++; return; }

      const id = uuidv4();
      const debit = txn.amount < 0 ? Math.abs(txn.amount) : 0;
      const credit = txn.amount > 0 ? txn.amount : 0;
      run(`INSERT INTO acc_bank_transactions (id, bank_account_id, transaction_date, description, reference, debit_amount, credit_amount, balance, transaction_type, is_reconciled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [id, bank_account_id, txn.date, txn.description, txn.reference || '', debit, credit, txn.balance || 0, txn.type || 'other']);
      imported++;
    });

    if (import_id) {
      run('UPDATE acc_bank_imports SET status = ?, imported_records = ?, skipped_records = ? WHERE id = ?',
        ['imported', imported, skipped, import_id]);
    }

    res.json({ success: true, data: { imported, skipped, total: transactions.length } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/bank-statements/history', (req, res) => {
  try {
    const data = query(`SELECT bi.*, ba.bank_name, ba.account_number FROM acc_bank_imports bi
      LEFT JOIN acc_bank_accounts ba ON bi.bank_account_id = ba.id ORDER BY bi.created_at DESC LIMIT 50`);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  if (req.accepts('html') && fs.existsSync(path.join(uiPath, 'index.html'))) {
    return res.sendFile(path.join(uiPath, 'index.html'));
  }
  res.status(404).json({ error: 'Not found' });
});

initDb().then(() => {
  app.listen(PORT, () => console.log(`Bank Reconciliation (lite) on port ${PORT}`));
}).catch(err => { console.error('Failed to init DB:', err); process.exit(1); });

module.exports = app;
