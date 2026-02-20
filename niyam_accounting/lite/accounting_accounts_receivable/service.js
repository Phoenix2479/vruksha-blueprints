/**
 * Accounts Receivable - Lite Version (SQLite)
 * Port: 8857
 *
 * Handles customer management and accounts receivable:
 * - Customer CRUD with GSTIN/PAN fields
 * - Invoice creation with GST line-level calculation
 * - Invoice posting with auto journal entry creation
 * - Receipt collection with auto JE + TDS entries
 * - Aging reports, customer statements
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');
const { sendCSV } = require('../shared/csv-generator');
const { sendPDF, sendLandscapePDF, addHeader, addTable, fmtCurrency, fmtDate } = require('../shared/pdf-generator');

const app = express();
const PORT = process.env.PORT || 8857;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'accounting_accounts_receivable', mode: 'lite' });
});

// =============================================================================
// CUSTOMERS
// =============================================================================

app.get('/api/customers', (req, res) => {
  try {
    const { search, is_active, customer_type, limit = 100, offset = 0 } = req.query;
    let sql = `
      SELECT c.*, c.code as customer_code, c.name as customer_name,
        (SELECT COALESCE(SUM(i.balance_due), 0) FROM acc_invoices i WHERE i.customer_id = c.id AND i.status NOT IN ('paid','void')) as outstanding_balance,
        (SELECT COALESCE(SUM(i.balance_due), 0) FROM acc_invoices i WHERE i.customer_id = c.id AND i.status NOT IN ('paid','void')) as current_balance,
        (SELECT COUNT(*) FROM acc_invoices i WHERE i.customer_id = c.id) as invoice_count
      FROM acc_customers c WHERE 1=1
    `;
    const params = [];
    if (search) { sql += ' AND (c.name LIKE ? OR c.code LIKE ? OR c.gstin LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (is_active !== undefined) { sql += ' AND c.is_active = ?'; params.push(is_active === 'true' ? 1 : 0); }
    if (customer_type) { sql += ' AND c.customer_type = ?'; params.push(customer_type); }
    sql += ' ORDER BY c.name LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const data = query(sql, params);
    const total = get('SELECT COUNT(*) as total FROM acc_customers');
    res.json({ success: true, data, pagination: { limit: parseInt(limit), offset: parseInt(offset), total: total?.total || 0 } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/customers/:id', (req, res) => {
  try {
    const customer = get(`
      SELECT c.*, c.code as customer_code, c.name as customer_name,
        (SELECT COALESCE(SUM(i.balance_due), 0) FROM acc_invoices i WHERE i.customer_id = c.id AND i.status NOT IN ('paid','void')) as outstanding_balance,
        (SELECT COALESCE(SUM(i.balance_due), 0) FROM acc_invoices i WHERE i.customer_id = c.id AND i.status NOT IN ('paid','void')) as current_balance,
        (SELECT COUNT(*) FROM acc_invoices i WHERE i.customer_id = c.id) as invoice_count,
        (SELECT MAX(i.invoice_date) FROM acc_invoices i WHERE i.customer_id = c.id) as last_invoice_date
      FROM acc_customers c WHERE c.id = ?
    `, [req.params.id]);
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });
    res.json({ success: true, data: customer });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/customers', (req, res) => {
  try {
    const d = req.body;
    if (d.customer_code && !d.code) d.code = d.customer_code;
    if (d.customer_name && !d.name) d.name = d.customer_name;
    if (!d.code || !d.name) return res.status(400).json({ success: false, error: 'code and name required' });
    const existing = get('SELECT id FROM acc_customers WHERE code = ?', [d.code]);
    if (existing) return res.status(400).json({ success: false, error: 'Customer code already exists' });

    if (d.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(d.gstin)) {
      return res.status(400).json({ success: false, error: 'Invalid GSTIN format' });
    }

    const id = uuidv4();
    run(`INSERT INTO acc_customers (id, code, name, display_name, customer_type, gstin, pan, contact_person, email, phone, mobile, address_line1, address_line2, city, state, state_code, postal_code, pincode, country, payment_terms, credit_limit, default_revenue_account_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, d.code, d.name, d.display_name || d.name, d.customer_type || 'business', d.gstin || null, d.pan || null,
        d.contact_person || null, d.email || null, d.phone || null, d.mobile || null,
        d.address_line1 || null, d.address_line2 || null, d.city || null, d.state || null, d.state_code || null, d.postal_code || null, d.pincode || null,
        d.country || 'India', d.payment_terms || d.payment_terms_days || 30, d.credit_limit || 0,
        d.default_revenue_account_id || null, d.notes || null]);
    res.status(201).json({ success: true, data: get('SELECT *, code as customer_code, name as customer_name FROM acc_customers WHERE id = ?', [id]) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/customers/:id', (req, res) => {
  try {
    const existing = get('SELECT * FROM acc_customers WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Customer not found' });

    const fields = ['name', 'display_name', 'customer_type', 'gstin', 'pan', 'contact_person', 'email', 'phone', 'mobile',
      'address_line1', 'address_line2', 'city', 'state', 'state_code', 'postal_code', 'pincode', 'country',
      'payment_terms', 'credit_limit', 'default_revenue_account_id', 'is_active', 'notes'];
    const updates = [], params = [];
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        params.push(f === 'is_active' ? (req.body[f] ? 1 : 0) : req.body[f]);
      }
    }
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    updates.push("updated_at = datetime('now')");
    params.push(req.params.id);
    run(`UPDATE acc_customers SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ success: true, data: get('SELECT * FROM acc_customers WHERE id = ?', [req.params.id]) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// INVOICES
// =============================================================================

app.get('/api/invoices', (req, res) => {
  try {
    const { customer_id, status, start_date, end_date, overdue, limit = 100, offset = 0 } = req.query;
    let sql = 'SELECT i.*, c.name as customer_name, c.code as customer_code FROM acc_invoices i JOIN acc_customers c ON i.customer_id = c.id WHERE 1=1';
    const params = [];
    if (customer_id) { sql += ' AND i.customer_id = ?'; params.push(customer_id); }
    if (status) { sql += ' AND i.status = ?'; params.push(status); }
    if (start_date) { sql += ' AND i.invoice_date >= ?'; params.push(start_date); }
    if (end_date) { sql += ' AND i.invoice_date <= ?'; params.push(end_date); }
    if (overdue === 'true') { sql += " AND i.due_date < date('now') AND i.balance_due > 0"; }
    sql += ' ORDER BY i.invoice_date DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    res.json({ success: true, data: query(sql, params) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/invoices/:id', (req, res) => {
  try {
    const invoice = get(`SELECT i.*, c.name as customer_name, c.code as customer_code, c.gstin as customer_gstin, c.address_line1, c.address_line2, c.city, c.state, c.pincode FROM acc_invoices i JOIN acc_customers c ON i.customer_id = c.id WHERE i.id = ?`, [req.params.id]);
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });
    const lines = query('SELECT il.*, a.account_code, a.account_name, tc.code as tax_code, tc.rate as tax_rate FROM acc_invoice_lines il JOIN acc_accounts a ON il.account_id = a.id LEFT JOIN acc_tax_codes tc ON il.tax_code_id = tc.id WHERE il.invoice_id = ? ORDER BY il.line_number', [req.params.id]);
    const receipts = query('SELECT * FROM acc_invoice_payments WHERE invoice_id = ? ORDER BY payment_date DESC', [req.params.id]);
    res.json({ success: true, data: { ...invoice, lines, receipts } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/invoices', (req, res) => {
  try {
    const { customer_id, invoice_number, invoice_date, due_date, lines, notes, reference_number, so_number, is_interstate, place_of_supply, description, terms_conditions } = req.body;
    if (!customer_id || !invoice_number || !invoice_date || !due_date || !lines?.length) {
      return res.status(400).json({ success: false, error: 'customer_id, invoice_number, invoice_date, due_date, lines required' });
    }

    const id = uuidv4();
    let subtotal = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0, totalCess = 0;
    const interstate = is_interstate ? 1 : 0;

    for (const line of lines) {
      const qty = line.quantity || 1;
      const price = line.unit_price || 0;
      const disc = line.discount_percent || 0;
      const net = qty * price * (1 - disc / 100);
      subtotal += net;

      if (line.tax_code_id) {
        const tc = get('SELECT * FROM acc_tax_codes WHERE id = ?', [line.tax_code_id]);
        if (tc) {
          if (interstate) { totalIgst += net * ((tc.igst_rate || tc.rate) / 100); }
          else { totalCgst += net * ((tc.cgst_rate || tc.rate / 2) / 100); totalSgst += net * ((tc.sgst_rate || tc.rate / 2) / 100); }
          totalCess += net * ((tc.cess_rate || 0) / 100);
        }
      }
    }

    const totalTax = totalCgst + totalSgst + totalIgst + totalCess;
    const totalAmount = subtotal + totalTax;

    run(`INSERT INTO acc_invoices (id, customer_id, invoice_number, invoice_date, due_date, reference_number, so_number, description, notes, terms_conditions, is_interstate, place_of_supply, subtotal, taxable_amount, cgst_amount, sgst_amount, igst_amount, cess_amount, total_tax, tax_amount, total_amount, balance_due, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
      [id, customer_id, invoice_number, invoice_date, due_date, reference_number || null, so_number || null, description || null, notes || null, terms_conditions || null, interstate, place_of_supply || null, subtotal, subtotal, totalCgst, totalSgst, totalIgst, totalCess, totalTax, totalTax, totalAmount, totalAmount]);

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const qty = l.quantity || 1;
      const price = l.unit_price || 0;
      const disc = l.discount_percent || 0;
      const gross = qty * price;
      const discAmt = gross * (disc / 100);
      const net = gross - discAmt;
      let lcgst = 0, lsgst = 0, ligst = 0, lcess = 0;
      if (l.tax_code_id) {
        const tc = get('SELECT * FROM acc_tax_codes WHERE id = ?', [l.tax_code_id]);
        if (tc) {
          if (interstate) { ligst = net * ((tc.igst_rate || tc.rate) / 100); }
          else { lcgst = net * ((tc.cgst_rate || tc.rate / 2) / 100); lsgst = net * ((tc.sgst_rate || tc.rate / 2) / 100); }
          lcess = net * ((tc.cess_rate || 0) / 100);
        }
      }
      const lineTotal = net + lcgst + lsgst + ligst + lcess;
      run(`INSERT INTO acc_invoice_lines (id, invoice_id, line_number, account_id, description, quantity, unit_price, amount, discount_percent, discount_amount, net_amount, tax_code_id, tax_amount, hsn_sac_code, cgst_amount, sgst_amount, igst_amount, cess_amount, total_amount, cost_center_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), id, i + 1, l.account_id, l.description || null, qty, price, gross, disc, discAmt, net, l.tax_code_id || null, lcgst + lsgst + ligst + lcess, l.hsn_sac_code || null, lcgst, lsgst, ligst, lcess, lineTotal, l.cost_center_id || null]);
    }

    res.status(201).json({ success: true, data: get('SELECT * FROM acc_invoices WHERE id = ?', [id]) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Post invoice -> creates journal entry
app.post('/api/invoices/:id/post', (req, res) => {
  try {
    const invoice = get('SELECT i.*, c.name as customer_name FROM acc_invoices i JOIN acc_customers c ON i.customer_id = c.id WHERE i.id = ?', [req.params.id]);
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });
    if (invoice.status !== 'draft') return res.status(400).json({ success: false, error: 'Invoice is already posted' });

    const arAccount = get("SELECT id FROM acc_accounts WHERE account_code = '1200'");
    if (!arAccount) return res.status(400).json({ success: false, error: 'Accounts Receivable account (1200) not configured' });

    const lines = query('SELECT * FROM acc_invoice_lines WHERE invoice_id = ?', [req.params.id]);
    const jeId = uuidv4();
    const entryNumber = `JE-INV-${invoice.invoice_number}`;

    run(`INSERT INTO acc_journal_entries (id, entry_number, entry_date, entry_type, description, reference_type, reference_id, source_document, total_debit, total_credit, status) VALUES (?, ?, ?, 'AR', ?, 'invoice', ?, ?, ?, ?, 'posted')`,
      [jeId, entryNumber, invoice.invoice_date, `Invoice to ${invoice.customer_name}: ${invoice.invoice_number}`, req.params.id, invoice.invoice_number, invoice.total_amount, invoice.total_amount]);

    let lineNum = 1;

    // Debit AR
    run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount) VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [uuidv4(), jeId, lineNum++, arAccount.id, `Receivable from ${invoice.customer_name}`, invoice.total_amount]);

    // Credit revenue accounts
    for (const line of lines) {
      run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount, cost_center_id) VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
        [uuidv4(), jeId, lineNum++, line.account_id, line.description, line.net_amount || line.amount, line.cost_center_id || null]);

      if ((line.cgst_amount || 0) > 0) {
        const acc = get("SELECT id FROM acc_accounts WHERE account_code = '2200'");
        if (acc) run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount) VALUES (?, ?, ?, ?, 'Output CGST', 0, ?)`, [uuidv4(), jeId, lineNum++, acc.id, line.cgst_amount]);
      }
      if ((line.sgst_amount || 0) > 0) {
        const acc = get("SELECT id FROM acc_accounts WHERE account_code = '2201'");
        if (acc) run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount) VALUES (?, ?, ?, ?, 'Output SGST', 0, ?)`, [uuidv4(), jeId, lineNum++, acc.id, line.sgst_amount]);
      }
      if ((line.igst_amount || 0) > 0) {
        const acc = get("SELECT id FROM acc_accounts WHERE account_code = '2202'");
        if (acc) run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount) VALUES (?, ?, ?, ?, 'Output IGST', 0, ?)`, [uuidv4(), jeId, lineNum++, acc.id, line.igst_amount]);
      }
    }

    // Post JE -> update ledger
    const jeLines = query('SELECT * FROM acc_journal_lines WHERE journal_entry_id = ?', [jeId]);
    for (const jl of jeLines) {
      const account = get('SELECT * FROM acc_accounts WHERE id = ?', [jl.account_id]);
      if (!account) continue;
      const newBal = account.current_balance + (jl.debit_amount || 0) - (jl.credit_amount || 0);
      run(`INSERT INTO acc_ledger_entries (id, account_id, journal_entry_id, entry_date, description, debit_amount, credit_amount, running_balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), jl.account_id, jeId, invoice.invoice_date, jl.description, jl.debit_amount, jl.credit_amount, newBal]);
      run("UPDATE acc_accounts SET current_balance = ?, updated_at = datetime('now') WHERE id = ?", [newBal, jl.account_id]);
    }

    run("UPDATE acc_journal_entries SET posted_at = datetime('now') WHERE id = ?", [jeId]);
    run("UPDATE acc_invoices SET status = 'sent', journal_entry_id = ?, posted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", [jeId, req.params.id]);

    res.json({ success: true, data: { invoice_id: req.params.id, journal_entry_id: jeId, status: 'posted' } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// RECEIPTS
// =============================================================================

app.post('/api/receipts', (req, res) => {
  try {
    const d = req.body;
    if (!d.invoice_id || !d.receipt_date || !d.amount) {
      return res.status(400).json({ success: false, error: 'invoice_id, receipt_date, amount required' });
    }

    const invoice = get('SELECT i.*, c.name as customer_name FROM acc_invoices i JOIN acc_customers c ON i.customer_id = c.id WHERE i.id = ?', [d.invoice_id]);
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });
    if (invoice.status === 'draft') return res.status(400).json({ success: false, error: 'Invoice must be posted before receipt' });
    if (d.amount > invoice.balance_due) return res.status(400).json({ success: false, error: 'Receipt exceeds balance due' });

    const receiptId = uuidv4();
    run(`INSERT INTO acc_invoice_payments (id, invoice_id, payment_date, amount, payment_method, bank_account_id, reference, cheque_number, cheque_date, notes, tds_deducted, journal_entry_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [receiptId, d.invoice_id, d.receipt_date, d.amount, d.payment_method || 'bank_transfer', d.bank_account_id || null, d.reference_number || d.reference || null, d.cheque_number || null, d.cheque_date || null, d.notes || null, d.tds_deducted || 0]);

    const newBalance = invoice.balance_due - d.amount;
    const newStatus = newBalance <= 0 ? 'paid' : 'partial';
    run("UPDATE acc_invoices SET balance_due = ?, amount_received = COALESCE(amount_received, 0) + ?, status = ?, updated_at = datetime('now') WHERE id = ?",
      [Math.max(0, newBalance), d.amount, newStatus, d.invoice_id]);

    // Auto journal entry for receipt
    const arAccount = get("SELECT id FROM acc_accounts WHERE account_code = '1200'");
    if (arAccount && d.bank_account_id) {
      const bankAcc = get('SELECT account_id FROM acc_bank_accounts WHERE id = ?', [d.bank_account_id]);
      if (bankAcc && bankAcc.account_id) {
        const jeId = uuidv4();
        const entryNumber = `JE-RCT-${receiptId.slice(0, 8)}`;
        run(`INSERT INTO acc_journal_entries (id, entry_number, entry_date, entry_type, description, reference_type, reference_id, total_debit, total_credit, status, posted_at) VALUES (?, ?, ?, 'RCT', ?, 'receipt', ?, ?, ?, 'posted', datetime('now'))`,
          [jeId, entryNumber, d.receipt_date, `Receipt from ${invoice.customer_name} for invoice ${invoice.invoice_number}`, receiptId, d.amount, d.amount]);

        // Debit Bank
        const netReceipt = d.amount - (d.tds_deducted || 0);
        run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount) VALUES (?, ?, 1, ?, ?, ?, 0)`,
          [uuidv4(), jeId, bankAcc.account_id, `Receipt for invoice ${invoice.invoice_number}`, netReceipt]);
        // Credit AR
        run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount) VALUES (?, ?, 2, ?, ?, 0, ?)`,
          [uuidv4(), jeId, arAccount.id, `Receipt from ${invoice.customer_name}`, d.amount]);

        // TDS entry
        if ((d.tds_deducted || 0) > 0) {
          const tdsAcc = get("SELECT id FROM acc_accounts WHERE account_code = '1510'");
          if (tdsAcc) {
            run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount) VALUES (?, ?, 3, ?, 'TDS Receivable', ?, 0)`,
              [uuidv4(), jeId, tdsAcc.id, d.tds_deducted]);
          }
        }

        // Update ledger
        const jeLines = query('SELECT * FROM acc_journal_lines WHERE journal_entry_id = ?', [jeId]);
        for (const jl of jeLines) {
          const account = get('SELECT * FROM acc_accounts WHERE id = ?', [jl.account_id]);
          if (!account) continue;
          const newBal = account.current_balance + (jl.debit_amount || 0) - (jl.credit_amount || 0);
          run(`INSERT INTO acc_ledger_entries (id, account_id, journal_entry_id, entry_date, description, debit_amount, credit_amount, running_balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [uuidv4(), jl.account_id, jeId, d.receipt_date, jl.description, jl.debit_amount, jl.credit_amount, newBal]);
          run("UPDATE acc_accounts SET current_balance = ?, updated_at = datetime('now') WHERE id = ?", [newBal, jl.account_id]);
        }

        run('UPDATE acc_invoice_payments SET journal_entry_id = ? WHERE id = ?', [jeId, receiptId]);
      }
    }

    res.status(201).json({ success: true, data: get('SELECT * FROM acc_invoice_payments WHERE id = ?', [receiptId]) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Legacy endpoint
app.post('/api/invoices/:id/pay', (req, res) => {
  req.body.invoice_id = req.params.id;
  req.body.receipt_date = req.body.payment_date;
  return app.handle({ ...req, url: '/api/receipts', method: 'POST' }, res);
});

// =============================================================================
// AGING REPORT
// =============================================================================

app.get('/api/aging', (req, res) => {
  try {
    const asOf = req.query.as_of_date || new Date().toISOString().split('T')[0];
    const aging = query(`
      SELECT c.id as customer_id, c.code as customer_code, c.name as customer_name, COUNT(i.id) as invoice_count,
        SUM(CASE WHEN julianday(?) - julianday(i.due_date) <= 0 THEN i.balance_due ELSE 0 END) as current_amount,
        SUM(CASE WHEN julianday(?) - julianday(i.due_date) BETWEEN 1 AND 30 THEN i.balance_due ELSE 0 END) as days_1_30,
        SUM(CASE WHEN julianday(?) - julianday(i.due_date) BETWEEN 31 AND 60 THEN i.balance_due ELSE 0 END) as days_31_60,
        SUM(CASE WHEN julianday(?) - julianday(i.due_date) BETWEEN 61 AND 90 THEN i.balance_due ELSE 0 END) as days_61_90,
        SUM(CASE WHEN julianday(?) - julianday(i.due_date) > 90 THEN i.balance_due ELSE 0 END) as over_90,
        SUM(i.balance_due) as total_outstanding
      FROM acc_customers c LEFT JOIN acc_invoices i ON c.id = i.customer_id AND i.balance_due > 0 AND i.status NOT IN ('draft','void')
      WHERE 1=1 GROUP BY c.id, c.code, c.name HAVING SUM(i.balance_due) > 0 ORDER BY total_outstanding DESC
    `, [asOf, asOf, asOf, asOf, asOf]);

    const totals = aging.reduce((a, r) => ({
      current_amount: a.current_amount + (r.current_amount || 0), days_1_30: a.days_1_30 + (r.days_1_30 || 0),
      days_31_60: a.days_31_60 + (r.days_31_60 || 0), days_61_90: a.days_61_90 + (r.days_61_90 || 0),
      over_90: a.over_90 + (r.over_90 || 0), total_outstanding: a.total_outstanding + (r.total_outstanding || 0)
    }), { current_amount: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, over_90: 0, total_outstanding: 0 });

    res.json({ success: true, data: { as_of_date: asOf, customers: aging, totals } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// CUSTOMER STATEMENT
// =============================================================================

app.get('/api/customers/:id/statement', (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const customer = get('SELECT * FROM acc_customers WHERE id = ?', [req.params.id]);
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });

    let dateFilterInv = '', dateFilterPay = '';
    const invParams = [req.params.id], payParams = [req.params.id];
    if (start_date) { dateFilterInv += ' AND i.invoice_date >= ?'; dateFilterPay += ' AND p.payment_date >= ?'; invParams.push(start_date); payParams.push(start_date); }
    if (end_date) { dateFilterInv += ' AND i.invoice_date <= ?'; dateFilterPay += ' AND p.payment_date <= ?'; invParams.push(end_date); payParams.push(end_date); }

    const invoices = query(`SELECT 'invoice' as type, i.invoice_date as transaction_date, i.invoice_number as reference, i.description, i.total_amount as debit, 0 as credit FROM acc_invoices i WHERE i.customer_id = ? AND i.status NOT IN ('draft','void') ${dateFilterInv} ORDER BY i.invoice_date`, invParams);
    const payments = query(`SELECT 'receipt' as type, p.payment_date as transaction_date, p.reference as reference, 'Receipt' as description, 0 as debit, p.amount as credit FROM acc_invoice_payments p JOIN acc_invoices i ON p.invoice_id = i.id WHERE i.customer_id = ? ${dateFilterPay} ORDER BY p.payment_date`, payParams);

    const transactions = [...invoices, ...payments].sort((a, b) => (a.transaction_date || '').localeCompare(b.transaction_date || ''));
    let runningBalance = 0;
    const statement = transactions.map(t => {
      runningBalance += (t.debit || 0) - (t.credit || 0);
      return { ...t, running_balance: runningBalance };
    });

    res.json({ success: true, data: { customer, transactions: statement, closing_balance: runningBalance } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// CREDIT NOTES
// =============================================================================

app.get('/api/credit-notes', (req, res) => {
  try {
    const { customer_id, status, limit = 100, offset = 0 } = req.query;
    let sql = 'SELECT cn.*, c.name as customer_name, c.code as customer_code FROM acc_credit_notes cn JOIN acc_customers c ON cn.customer_id = c.id WHERE 1=1';
    const params = [];
    if (customer_id) { sql += ' AND cn.customer_id = ?'; params.push(customer_id); }
    if (status) { sql += ' AND cn.status = ?'; params.push(status); }
    sql += ' ORDER BY cn.credit_note_date DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    res.json({ success: true, data: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/credit-notes/:id', (req, res) => {
  try {
    const cn = get('SELECT cn.*, c.name as customer_name FROM acc_credit_notes cn JOIN acc_customers c ON cn.customer_id = c.id WHERE cn.id = ?', [req.params.id]);
    if (!cn) return res.status(404).json({ success: false, error: 'Credit note not found' });
    const lines = query('SELECT cl.*, a.account_code, a.account_name FROM acc_credit_note_lines cl JOIN acc_accounts a ON cl.account_id = a.id WHERE cl.credit_note_id = ? ORDER BY cl.line_number', [req.params.id]);
    res.json({ success: true, data: { ...cn, lines } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/credit-notes', (req, res) => {
  try {
    const { customer_id, credit_note_number, credit_note_date, original_invoice_id, reason, reason_detail, lines, notes } = req.body;
    if (!customer_id || !credit_note_number || !credit_note_date || !lines?.length) {
      return res.status(400).json({ success: false, error: 'customer_id, credit_note_number, credit_note_date, lines required' });
    }
    const id = uuidv4();
    let subtotal = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0;
    for (const l of lines) {
      const amt = (l.quantity || 1) * (l.unit_price || 0);
      subtotal += amt;
      totalCgst += (l.cgst_amount || 0); totalSgst += (l.sgst_amount || 0); totalIgst += (l.igst_amount || 0);
    }
    const totalTax = totalCgst + totalSgst + totalIgst;
    run(`INSERT INTO acc_credit_notes (id, credit_note_number, customer_id, original_invoice_id, credit_note_date, reason, reason_detail, subtotal, cgst_amount, sgst_amount, igst_amount, total_tax, total_amount, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, credit_note_number, customer_id, original_invoice_id || null, credit_note_date, reason || 'return', reason_detail || null, subtotal, totalCgst, totalSgst, totalIgst, totalTax, subtotal + totalTax, notes || null]);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      run(`INSERT INTO acc_credit_note_lines (id, credit_note_id, line_number, account_id, description, hsn_code, quantity, unit_price, amount, tax_code_id, cgst_amount, sgst_amount, igst_amount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [uuidv4(), id, i + 1, l.account_id, l.description || null, l.hsn_code || null, l.quantity || 1, l.unit_price || 0, (l.quantity || 1) * (l.unit_price || 0), l.tax_code_id || null, l.cgst_amount || 0, l.sgst_amount || 0, l.igst_amount || 0]);
    }
    res.status(201).json({ success: true, data: get('SELECT * FROM acc_credit_notes WHERE id = ?', [id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/credit-notes/:id/post', (req, res) => {
  try {
    const cn = get('SELECT cn.*, c.name as customer_name FROM acc_credit_notes cn JOIN acc_customers c ON cn.customer_id = c.id WHERE cn.id = ?', [req.params.id]);
    if (!cn) return res.status(404).json({ success: false, error: 'Not found' });
    if (cn.status !== 'draft') return res.status(400).json({ success: false, error: 'Already posted' });

    const arAccount = get("SELECT id FROM acc_accounts WHERE account_code = '1200'");
    if (!arAccount) return res.status(400).json({ success: false, error: 'AR account (1200) not configured' });

    const lines = query('SELECT * FROM acc_credit_note_lines WHERE credit_note_id = ?', [req.params.id]);
    const jeId = uuidv4();
    run(`INSERT INTO acc_journal_entries (id, entry_number, entry_date, entry_type, description, reference_type, reference_id, total_debit, total_credit, status, posted_at) VALUES (?,?,?,'CN',?,?,?,?,?,'posted',datetime('now'))`,
      [jeId, `JE-CN-${cn.credit_note_number}`, cn.credit_note_date, `Credit Note ${cn.credit_note_number} to ${cn.customer_name}`, 'credit_note', req.params.id, cn.total_amount, cn.total_amount]);

    let lineNum = 1;
    // Dr revenue returns
    for (const l of lines) {
      run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount) VALUES (?,?,?,?,?,?,0)`,
        [uuidv4(), jeId, lineNum++, l.account_id, l.description || 'Sales return', l.amount]);
    }
    // Dr Output GST reversal
    const gstAcc = (code) => get(`SELECT id FROM acc_accounts WHERE account_code = ?`, [code]);
    if (cn.cgst_amount > 0) { const a = gstAcc('2200'); if (a) run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount) VALUES (?,?,?,?,'Reverse Output CGST',?,0)`, [uuidv4(), jeId, lineNum++, a.id, cn.cgst_amount]); }
    if (cn.sgst_amount > 0) { const a = gstAcc('2201'); if (a) run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount) VALUES (?,?,?,?,'Reverse Output SGST',?,0)`, [uuidv4(), jeId, lineNum++, a.id, cn.sgst_amount]); }
    if (cn.igst_amount > 0) { const a = gstAcc('2202'); if (a) run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount) VALUES (?,?,?,?,'Reverse Output IGST',?,0)`, [uuidv4(), jeId, lineNum++, a.id, cn.igst_amount]); }
    // Cr AR
    run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount) VALUES (?,?,?,?,?,0,?)`,
      [uuidv4(), jeId, lineNum, arAccount.id, `Credit Note to ${cn.customer_name}`, cn.total_amount]);

    // Update ledger
    const jeLines = query('SELECT * FROM acc_journal_lines WHERE journal_entry_id = ?', [jeId]);
    for (const jl of jeLines) {
      const account = get('SELECT * FROM acc_accounts WHERE id = ?', [jl.account_id]);
      if (!account) continue;
      const newBal = account.current_balance + (jl.debit_amount || 0) - (jl.credit_amount || 0);
      run(`INSERT INTO acc_ledger_entries (id, account_id, journal_entry_id, entry_date, description, debit_amount, credit_amount, running_balance) VALUES (?,?,?,?,?,?,?,?)`,
        [uuidv4(), jl.account_id, jeId, cn.credit_note_date, jl.description, jl.debit_amount, jl.credit_amount, newBal]);
      run("UPDATE acc_accounts SET current_balance = ?, updated_at = datetime('now') WHERE id = ?", [newBal, jl.account_id]);
    }

    run("UPDATE acc_credit_notes SET status = 'posted', journal_entry_id = ?, updated_at = datetime('now') WHERE id = ?", [jeId, req.params.id]);
    res.json({ success: true, data: get('SELECT * FROM acc_credit_notes WHERE id = ?', [req.params.id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/credit-notes/:id/apply', (req, res) => {
  try {
    const { invoice_id } = req.body;
    if (!invoice_id) return res.status(400).json({ success: false, error: 'invoice_id required' });
    const cn = get('SELECT * FROM acc_credit_notes WHERE id = ? AND status = ?', [req.params.id, 'posted']);
    if (!cn) return res.status(404).json({ success: false, error: 'Credit note not found or not posted' });
    const invoice = get('SELECT * FROM acc_invoices WHERE id = ?', [invoice_id]);
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });

    const applyAmt = Math.min(cn.total_amount, invoice.balance_due);
    const newBalance = invoice.balance_due - applyAmt;
    run("UPDATE acc_invoices SET balance_due = ?, status = ?, updated_at = datetime('now') WHERE id = ?",
      [newBalance, newBalance <= 0 ? 'paid' : 'partial', invoice_id]);
    run("UPDATE acc_credit_notes SET status = 'applied', applied_to_invoice_id = ?, updated_at = datetime('now') WHERE id = ?", [invoice_id, req.params.id]);
    res.json({ success: true, data: { applied_amount: applyAmt, new_balance_due: newBalance } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =============================================================================
// INVOICE PDF (GST-Compliant)
// =============================================================================

app.get('/api/invoices/:id/pdf', (req, res) => {
  try {
    const invoice = get(`SELECT i.*, c.name as customer_name, c.gstin as customer_gstin, c.pan as customer_pan,
      c.address_line1 as c_addr1, c.address_line2 as c_addr2, c.city as c_city, c.state as c_state, c.state_code as c_state_code, c.pincode as c_pincode
      FROM acc_invoices i JOIN acc_customers c ON i.customer_id = c.id WHERE i.id = ?`, [req.params.id]);
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });

    const lines = query(`SELECT il.*, a.account_name FROM acc_invoice_lines il JOIN acc_accounts a ON il.account_id = a.id WHERE il.invoice_id = ? ORDER BY il.line_number`, [req.params.id]);
    const company = get('SELECT * FROM acc_company_settings WHERE id = ?', ['default']);
    const co = company || { company_name: 'My Company', gstin: '', address_line1: '', city: '', state: '', state_code: '', pincode: '' };

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="invoice_${invoice.invoice_number}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(16).fillColor('#1e293b').text(co.company_name, { align: 'left' });
    if (co.gstin) doc.fontSize(9).fillColor('#64748b').text(`GSTIN: ${co.gstin}`);
    if (co.address_line1) doc.text([co.address_line1, co.address_line2, co.city, co.state, co.pincode].filter(Boolean).join(', '));
    if (co.email) doc.text(`Email: ${co.email}  |  Phone: ${co.phone || ''}`);

    doc.moveDown(0.5);
    doc.fontSize(14).fillColor('#1e293b').text('TAX INVOICE', { align: 'center' });
    doc.moveDown(0.3);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#e2e8f0').stroke();
    doc.moveDown(0.5);

    // Invoice details
    const detailY = doc.y;
    doc.fontSize(9).fillColor('#1e293b');
    doc.text(`Invoice #: ${invoice.invoice_number}`, 40, detailY);
    doc.text(`Date: ${fmtDate(invoice.invoice_date)}`, 40, detailY + 14);
    doc.text(`Due Date: ${fmtDate(invoice.due_date)}`, 40, detailY + 28);
    if (invoice.place_of_supply) doc.text(`Place of Supply: ${invoice.place_of_supply}`, 40, detailY + 42);

    doc.text('Bill To:', 320, detailY);
    doc.fontSize(10).text(invoice.customer_name, 320, detailY + 14);
    doc.fontSize(9);
    if (invoice.customer_gstin) doc.text(`GSTIN: ${invoice.customer_gstin}`, 320, detailY + 28);
    const cAddr = [invoice.c_addr1, invoice.c_addr2, invoice.c_city, invoice.c_state, invoice.c_pincode].filter(Boolean).join(', ');
    if (cAddr) doc.text(cAddr, 320, detailY + 42, { width: 220 });

    doc.y = Math.max(doc.y, detailY + 60);
    doc.moveDown(1);

    // Line items table
    const isInterstate = invoice.is_interstate;
    const tableTop = doc.y;
    const colWidths = isInterstate ? [25, 170, 50, 40, 55, 80, 40, 55] : [25, 140, 50, 40, 55, 80, 30, 40, 30, 40];
    const headers = isInterstate
      ? ['#', 'Description', 'HSN/SAC', 'Qty', 'Rate', 'Amount', 'IGST%', 'IGST']
      : ['#', 'Description', 'HSN/SAC', 'Qty', 'Rate', 'Amount', 'C%', 'CGST', 'S%', 'SGST'];
    const totalW = colWidths.reduce((s, w) => s + w, 0);

    // Header row
    doc.rect(40, tableTop, totalW, 18).fill('#1e293b');
    let cx = 40;
    headers.forEach((h, i) => {
      doc.fontSize(7).fillColor('#ffffff').text(h, cx + 3, tableTop + 5, { width: colWidths[i] - 6, lineBreak: false });
      cx += colWidths[i];
    });

    let ry = tableTop + 18;
    lines.forEach((line, idx) => {
      if (ry > 700) { doc.addPage(); ry = 40; }
      if (idx % 2 === 1) doc.rect(40, ry, totalW, 16).fill('#f8fafc');
      cx = 40;
      const vals = isInterstate
        ? [idx + 1, line.description || line.account_name, line.hsn_sac_code || '', line.quantity, fmtCurrency(line.unit_price), fmtCurrency(line.net_amount || line.amount), '', fmtCurrency(line.igst_amount)]
        : [idx + 1, line.description || line.account_name, line.hsn_sac_code || '', line.quantity, fmtCurrency(line.unit_price), fmtCurrency(line.net_amount || line.amount), '', fmtCurrency(line.cgst_amount), '', fmtCurrency(line.sgst_amount)];
      vals.forEach((v, i) => {
        doc.fontSize(7).fillColor('#1e293b').text(String(v), cx + 3, ry + 4, { width: colWidths[i] - 6, lineBreak: false });
        cx += colWidths[i];
      });
      ry += 16;
    });

    doc.y = ry + 10;

    // HSN Summary
    const hsnMap = {};
    lines.forEach(l => {
      const hsn = l.hsn_sac_code || 'N/A';
      if (!hsnMap[hsn]) hsnMap[hsn] = { hsn, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      hsnMap[hsn].taxable += (l.net_amount || l.amount || 0);
      hsnMap[hsn].cgst += (l.cgst_amount || 0);
      hsnMap[hsn].sgst += (l.sgst_amount || 0);
      hsnMap[hsn].igst += (l.igst_amount || 0);
    });
    const hsnRows = Object.values(hsnMap);

    if (hsnRows.length > 0) {
      doc.moveDown(0.5);
      doc.fontSize(9).fillColor('#1e293b').text('HSN/SAC Summary', { underline: true });
      doc.moveDown(0.3);
      const hsnCols = [{ key: 'hsn', label: 'HSN/SAC', width: 1.5 }, { key: 'taxable', label: 'Taxable Value', width: 1.5, align: 'right', formatter: fmtCurrency },
        { key: 'cgst', label: 'CGST', width: 1, align: 'right', formatter: fmtCurrency }, { key: 'sgst', label: 'SGST', width: 1, align: 'right', formatter: fmtCurrency },
        { key: 'igst', label: 'IGST', width: 1, align: 'right', formatter: fmtCurrency }];
      addTable(doc, hsnCols, hsnRows, { fontSize: 7, rowHeight: 16 });
    }

    // Totals
    doc.moveDown(0.5);
    const totX = 350;
    doc.fontSize(9).fillColor('#1e293b');
    doc.text(`Subtotal:`, totX, doc.y, { continued: true }).text(fmtCurrency(invoice.subtotal), { align: 'right' });
    if (invoice.cgst_amount) doc.text(`CGST:`, totX, doc.y, { continued: true }).text(fmtCurrency(invoice.cgst_amount), { align: 'right' });
    if (invoice.sgst_amount) doc.text(`SGST:`, totX, doc.y, { continued: true }).text(fmtCurrency(invoice.sgst_amount), { align: 'right' });
    if (invoice.igst_amount) doc.text(`IGST:`, totX, doc.y, { continued: true }).text(fmtCurrency(invoice.igst_amount), { align: 'right' });
    doc.moveDown(0.3);
    doc.fontSize(11).text(`Grand Total: INR ${fmtCurrency(invoice.total_amount)}`, totX, doc.y, { align: 'right' });

    // Footer
    doc.moveDown(1.5);
    doc.fontSize(8).fillColor('#64748b');
    if (co.invoice_terms) doc.text(`Terms: ${co.invoice_terms}`);
    if (co.bank_name) doc.text(`Bank: ${co.bank_name}  |  A/C: ${co.bank_account || ''}  |  IFSC: ${co.bank_ifsc || ''}`);
    doc.moveDown(1);
    doc.text('[ QR Code Placeholder - for IRN ]', { align: 'right' });
    doc.moveDown(0.5);
    doc.text('Authorized Signatory', { align: 'right' });

    // Page numbers
    const pages = doc.bufferedPageRange();
    for (let i = pages.start; i < pages.start + pages.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(7).fillColor('#94a3b8').text(`Page ${i + 1} of ${pages.count}`, 40, doc.page.height - 25, { align: 'center', width: doc.page.width - 80 });
    }

    doc.end();
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =============================================================================
// COMPANY SETTINGS
// =============================================================================

app.get('/api/company-settings', (req, res) => {
  try {
    const settings = get("SELECT * FROM acc_company_settings WHERE id = 'default'");
    res.json({ success: true, data: settings || {} });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/company-settings', (req, res) => {
  try {
    const d = req.body;
    const existing = get("SELECT id FROM acc_company_settings WHERE id = 'default'");
    if (existing) {
      const fields = ['company_name','gstin','pan','address_line1','address_line2','city','state','state_code','pincode','email','phone','bank_name','bank_account','bank_ifsc','invoice_terms','invoice_footer'];
      const updates = [], params = [];
      for (const f of fields) { if (d[f] !== undefined) { updates.push(`${f} = ?`); params.push(d[f]); } }
      if (updates.length > 0) { updates.push("updated_at = datetime('now')"); params.push('default'); run(`UPDATE acc_company_settings SET ${updates.join(', ')} WHERE id = ?`, params); }
    } else {
      run(`INSERT INTO acc_company_settings (id, company_name, gstin, pan, address_line1, city, state, state_code, pincode, email, phone, bank_name, bank_account, bank_ifsc, invoice_terms) VALUES ('default',?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [d.company_name || 'My Company', d.gstin || null, d.pan || null, d.address_line1 || null, d.city || null, d.state || null, d.state_code || null, d.pincode || null, d.email || null, d.phone || null, d.bank_name || null, d.bank_account || null, d.bank_ifsc || null, d.invoice_terms || null]);
    }
    res.json({ success: true, data: get("SELECT * FROM acc_company_settings WHERE id = 'default'") });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =============================================================================
// EXPORT
// =============================================================================

app.get('/api/invoices/export/csv', (req, res) => {
  try {
    const data = query('SELECT i.invoice_number, c.name as customer_name, i.invoice_date, i.due_date, i.subtotal, i.total_tax, i.total_amount, i.balance_due, i.status FROM acc_invoices i JOIN acc_customers c ON i.customer_id = c.id ORDER BY i.invoice_date DESC');
    sendCSV(res, data, [
      { key: 'invoice_number', label: 'Invoice #' }, { key: 'customer_name', label: 'Customer' },
      { key: 'invoice_date', label: 'Date' }, { key: 'due_date', label: 'Due Date' },
      { key: 'subtotal', label: 'Subtotal' }, { key: 'total_tax', label: 'Tax' },
      { key: 'total_amount', label: 'Total' }, { key: 'balance_due', label: 'Balance Due' },
      { key: 'status', label: 'Status' }
    ], 'invoices.csv');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/customers/export/csv', (req, res) => {
  try {
    const data = query("SELECT c.code, c.name, c.gstin, c.pan, c.email, c.phone, c.city, c.state, CASE WHEN c.is_active THEN 'Active' ELSE 'Inactive' END as status FROM acc_customers c ORDER BY c.name");
    sendCSV(res, data, [
      { key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'gstin', label: 'GSTIN' },
      { key: 'pan', label: 'PAN' }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' },
      { key: 'city', label: 'City' }, { key: 'state', label: 'State' }, { key: 'status', label: 'Status' }
    ], 'customers.csv');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/aging/export/csv', (req, res) => {
  try {
    const asOf = req.query.as_of_date || new Date().toISOString().split('T')[0];
    const data = query(`SELECT c.code, c.name,
      SUM(CASE WHEN julianday(?) - julianday(i.due_date) <= 0 THEN i.balance_due ELSE 0 END) as current_amount,
      SUM(CASE WHEN julianday(?) - julianday(i.due_date) BETWEEN 1 AND 30 THEN i.balance_due ELSE 0 END) as days_1_30,
      SUM(CASE WHEN julianday(?) - julianday(i.due_date) BETWEEN 31 AND 60 THEN i.balance_due ELSE 0 END) as days_31_60,
      SUM(CASE WHEN julianday(?) - julianday(i.due_date) BETWEEN 61 AND 90 THEN i.balance_due ELSE 0 END) as days_61_90,
      SUM(CASE WHEN julianday(?) - julianday(i.due_date) > 90 THEN i.balance_due ELSE 0 END) as over_90,
      SUM(i.balance_due) as total
      FROM acc_customers c LEFT JOIN acc_invoices i ON c.id = i.customer_id AND i.balance_due > 0 AND i.status NOT IN ('draft','void')
      GROUP BY c.id HAVING SUM(i.balance_due) > 0 ORDER BY total DESC`, [asOf, asOf, asOf, asOf, asOf]);
    sendCSV(res, data, [
      { key: 'code', label: 'Code' }, { key: 'name', label: 'Customer' },
      { key: 'current_amount', label: 'Current' }, { key: 'days_1_30', label: '1-30' },
      { key: 'days_31_60', label: '31-60' }, { key: 'days_61_90', label: '61-90' },
      { key: 'over_90', label: '90+' }, { key: 'total', label: 'Total' }
    ], 'ar_aging.csv');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/credit-notes/export/csv', (req, res) => {
  try {
    const data = query('SELECT cn.credit_note_number, c.name as customer_name, cn.credit_note_date, cn.reason, cn.subtotal, cn.total_tax, cn.total_amount, cn.status FROM acc_credit_notes cn JOIN acc_customers c ON cn.customer_id = c.id ORDER BY cn.credit_note_date DESC');
    sendCSV(res, data, [
      { key: 'credit_note_number', label: 'CN #' }, { key: 'customer_name', label: 'Customer' },
      { key: 'credit_note_date', label: 'Date' }, { key: 'reason', label: 'Reason' },
      { key: 'subtotal', label: 'Subtotal' }, { key: 'total_tax', label: 'Tax' },
      { key: 'total_amount', label: 'Total' }, { key: 'status', label: 'Status' }
    ], 'credit_notes.csv');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =============================================================================
// E-INVOICING (IRN)
// =============================================================================

const { generateEInvoiceJSON, submitToNIC, cancelEInvoice } = require('../shared/einvoice');

app.post('/api/invoices/:id/generate-einvoice-json', (req, res) => {
  try {
    const invoice = get('SELECT i.*, c.name as customer_name, c.gstin as customer_gstin, c.address_line1 as c_addr1, c.city as c_city, c.state as c_state, c.state_code as c_state_code, c.pincode as c_pincode FROM acc_invoices i JOIN acc_customers c ON i.customer_id = c.id WHERE i.id = ?', [req.params.id]);
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });
    const lines = query('SELECT * FROM acc_invoice_lines WHERE invoice_id = ? ORDER BY line_number', [req.params.id]);
    const company = get('SELECT * FROM acc_company_settings WHERE id = ?', ['default']) || {};
    const buyer = { name: invoice.customer_name, gstin: invoice.customer_gstin, address_line1: invoice.c_addr1, city: invoice.c_city, state: invoice.c_state, state_code: invoice.c_state_code, pincode: invoice.c_pincode };

    const payload = generateEInvoiceJSON(invoice, lines, company, buyer);
    run("UPDATE acc_invoices SET einvoice_json = ?, einvoice_status = 'json_generated' WHERE id = ?", [JSON.stringify(payload), req.params.id]);
    res.json({ success: true, data: { invoice_id: req.params.id, payload } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/invoices/:id/submit-einvoice', async (req, res) => {
  try {
    const invoice = get('SELECT * FROM acc_invoices WHERE id = ?', [req.params.id]);
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });
    if (!invoice.einvoice_json) return res.status(400).json({ success: false, error: 'Generate e-invoice JSON first' });

    const settings = get('SELECT * FROM acc_einvoice_settings WHERE id = ?', ['default']);
    if (!settings || settings.mode !== 'api') {
      return res.json({ success: true, data: { mode: 'manual', message: 'Download the JSON and upload to NIC portal manually', payload: JSON.parse(invoice.einvoice_json) } });
    }

    const result = await submitToNIC(JSON.parse(invoice.einvoice_json), settings);
    if (result.success) {
      run("UPDATE acc_invoices SET irn = ?, irn_date = datetime('now'), signed_qr = ?, ack_number = ?, einvoice_status = 'submitted' WHERE id = ?",
        [result.data.irn, result.data.signed_qr || '', result.data.ack_number || '', req.params.id]);
      res.json({ success: true, data: result.data });
    } else {
      run("UPDATE acc_invoices SET einvoice_status = 'failed' WHERE id = ?", [req.params.id]);
      res.status(400).json(result);
    }
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/invoices/:id/einvoice-status', (req, res) => {
  try {
    const inv = get('SELECT id, invoice_number, irn, irn_date, signed_qr, ack_number, einvoice_status, einvoice_json FROM acc_invoices WHERE id = ?', [req.params.id]);
    if (!inv) return res.status(404).json({ success: false, error: 'Invoice not found' });
    res.json({ success: true, data: inv });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/invoices/:id/cancel-einvoice', async (req, res) => {
  try {
    const inv = get('SELECT * FROM acc_invoices WHERE id = ?', [req.params.id]);
    if (!inv || !inv.irn) return res.status(400).json({ success: false, error: 'No IRN found for this invoice' });
    const settings = get('SELECT * FROM acc_einvoice_settings WHERE id = ?', ['default']);
    if (settings && settings.mode === 'api') {
      const result = await cancelEInvoice(inv.irn, req.body.reason, settings);
      if (!result.success) return res.status(400).json(result);
    }
    run("UPDATE acc_invoices SET einvoice_status = 'cancelled' WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/einvoice-settings', (req, res) => {
  try {
    let s = get('SELECT * FROM acc_einvoice_settings WHERE id = ?', ['default']);
    if (!s) { run('INSERT OR IGNORE INTO acc_einvoice_settings (id) VALUES (?)', ['default']); s = get('SELECT * FROM acc_einvoice_settings WHERE id = ?', ['default']); }
    res.json({ success: true, data: s });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/einvoice-settings', (req, res) => {
  try {
    const { mode, gsp_provider, gsp_username, gsp_password_enc, api_base_url, enabled } = req.body;
    run(`INSERT OR REPLACE INTO acc_einvoice_settings (id, mode, gsp_provider, gsp_username, gsp_password_enc, api_base_url, enabled, updated_at)
      VALUES ('default', ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [mode || 'manual', gsp_provider || null, gsp_username || null, gsp_password_enc || null, api_base_url || null, enabled ? 1 : 0]);
    res.json({ success: true, data: get('SELECT * FROM acc_einvoice_settings WHERE id = ?', ['default']) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =============================================================================
// E-WAY BILL
// =============================================================================

const { generateEWayBillJSON } = require('../shared/ewaybill');

app.post('/api/invoices/:id/generate-ewaybill', (req, res) => {
  try {
    const invoice = get('SELECT i.*, c.name as customer_name, c.gstin as customer_gstin, c.address_line1 as c_addr1, c.city as c_city, c.state as c_state, c.state_code as c_state_code, c.pincode as c_pincode FROM acc_invoices i JOIN acc_customers c ON i.customer_id = c.id WHERE i.id = ?', [req.params.id]);
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });
    const lines = query('SELECT * FROM acc_invoice_lines WHERE invoice_id = ? ORDER BY line_number', [req.params.id]);
    const company = get('SELECT * FROM acc_company_settings WHERE id = ?', ['default']) || {};
    const buyer = { name: invoice.customer_name, gstin: invoice.customer_gstin, address_line1: invoice.c_addr1, city: invoice.c_city, state: invoice.c_state, state_code: invoice.c_state_code, pincode: invoice.c_pincode };
    const transport = req.body;

    const payload = generateEWayBillJSON(invoice, lines, company, buyer, transport);
    const id = uuidv4();
    run(`INSERT INTO acc_ewaybills (id, invoice_id, from_place, from_state, from_pincode, to_place, to_state, to_pincode,
      vehicle_number, vehicle_type, transporter_id, transporter_name, transport_mode, distance_km, supply_type,
      doc_type, doc_number, doc_date, total_value, cgst_amount, sgst_amount, igst_amount, status, json_payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'O', 'INV', ?, ?, ?, ?, ?, ?, 'draft', ?)`,
      [id, req.params.id, company.city, company.state, company.pincode, buyer.city, buyer.state, buyer.pincode,
       transport.vehicle_number || '', transport.vehicle_type || 'R', transport.transporter_id || '', transport.transporter_name || '',
       transport.transport_mode || '1', transport.distance_km || 0,
       invoice.invoice_number, invoice.invoice_date, payload.totalValue, payload.cgstValue, payload.sgstValue, payload.igstValue,
       JSON.stringify(payload)]);
    res.status(201).json({ success: true, data: { id, payload, ewb: get('SELECT * FROM acc_ewaybills WHERE id = ?', [id]) } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/ewaybills', (req, res) => {
  try {
    const data = query(`SELECT e.*, i.invoice_number, c.name as customer_name FROM acc_ewaybills e
      LEFT JOIN acc_invoices i ON e.invoice_id = i.id LEFT JOIN acc_customers c ON i.customer_id = c.id
      WHERE e.invoice_id IS NOT NULL ORDER BY e.created_at DESC`);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/ewaybills/:id/update-vehicle', (req, res) => {
  try {
    const { vehicle_number, vehicle_type, transport_mode } = req.body;
    run(`UPDATE acc_ewaybills SET vehicle_number = ?, vehicle_type = COALESCE(?, vehicle_type), transport_mode = COALESCE(?, transport_mode), updated_at = datetime('now') WHERE id = ?`,
      [vehicle_number, vehicle_type, transport_mode, req.params.id]);
    res.json({ success: true, data: get('SELECT * FROM acc_ewaybills WHERE id = ?', [req.params.id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/ewaybills/:id/cancel', (req, res) => {
  try {
    run("UPDATE acc_ewaybills SET status = 'cancelled', cancel_reason = ?, updated_at = datetime('now') WHERE id = ?",
      [req.body.reason || 'Cancelled', req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =============================================================================
// PAYMENT GATEWAY
// =============================================================================

app.post('/api/invoices/:id/create-payment-link', (req, res) => {
  try {
    const invoice = get('SELECT * FROM acc_invoices WHERE id = ?', [req.params.id]);
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });
    const { gateway } = req.body;
    const id = uuidv4();
    const amount = invoice.total_amount - (invoice.amount_received || 0);
    const shortCode = id.substring(0, 8);
    const paymentUrl = `${req.protocol}://${req.get('host')}/pay/${shortCode}`;

    run(`INSERT INTO acc_payment_links (id, invoice_id, gateway, amount, currency, payment_link_url, short_url, status, expires_at)
      VALUES (?, ?, ?, ?, 'INR', ?, ?, 'created', datetime('now', '+7 days'))`,
      [id, req.params.id, gateway || 'upi', amount, paymentUrl, shortCode]);
    res.status(201).json({ success: true, data: get('SELECT * FROM acc_payment_links WHERE id = ?', [id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/payment-links', (req, res) => {
  try {
    const data = query(`SELECT pl.*, i.invoice_number, c.name as customer_name FROM acc_payment_links pl
      LEFT JOIN acc_invoices i ON pl.invoice_id = i.id LEFT JOIN acc_customers c ON i.customer_id = c.id
      ORDER BY pl.created_at DESC`);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/webhooks/razorpay', (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id } = req.body;
    const link = get('SELECT * FROM acc_payment_links WHERE gateway_order_id = ?', [razorpay_order_id]);
    if (link) {
      run("UPDATE acc_payment_links SET status = 'paid', gateway_payment_id = ?, paid_at = datetime('now') WHERE id = ?",
        [razorpay_payment_id, link.id]);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/webhooks/stripe', (req, res) => {
  try {
    const event = req.body;
    if (event.type === 'checkout.session.completed') {
      const sessionId = event.data?.object?.id;
      const link = get('SELECT * FROM acc_payment_links WHERE gateway_order_id = ?', [sessionId]);
      if (link) {
        run("UPDATE acc_payment_links SET status = 'paid', gateway_payment_id = ?, paid_at = datetime('now') WHERE id = ?",
          [event.data?.object?.payment_intent, link.id]);
      }
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================
// BARCODE / QR ON INVOICES
// ============================================

app.get('/api/invoices/:id/qr-code', (req, res) => {
  try {
    const invoice = get('SELECT i.*, c.customer_name FROM acc_invoices i LEFT JOIN acc_customers c ON i.customer_id = c.id WHERE i.id = ?', [req.params.id]);
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });
    const settings = get('SELECT * FROM acc_einvoice_settings WHERE id = \'default\'');
    const upiId = settings?.upi_id || '';
    const payeeName = settings?.business_name || 'Business';
    const upiString = upiId ? `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&am=${invoice.total_amount || invoice.total || 0}&cu=INR&tn=Invoice ${invoice.invoice_number}` : '';
    const invoiceUrl = `${req.protocol}://${req.get('host')}/api/invoices/${req.params.id}`;
    res.json({ success: true, data: { invoice_id: req.params.id, invoice_number: invoice.invoice_number, amount: invoice.total_amount || invoice.total || 0, upi_payment_string: upiString, invoice_url: invoiceUrl, qr_content: upiString || invoiceUrl } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/invoice-settings/qr', (req, res) => {
  try {
    const { upi_id, business_name } = req.body;
    const existing = get('SELECT id FROM acc_einvoice_settings WHERE id = \'default\'');
    if (existing) {
      run('UPDATE acc_einvoice_settings SET upi_id = COALESCE(?, upi_id), business_name = COALESCE(?, business_name) WHERE id = \'default\'', [upi_id, business_name]);
    } else {
      run('INSERT INTO acc_einvoice_settings (id, upi_id, business_name) VALUES (\'default\', ?, ?)', [upi_id || null, business_name || null]);
    }
    res.json({ success: true, data: get('SELECT * FROM acc_einvoice_settings WHERE id = \'default\'') });
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
  app.listen(PORT, () => console.log(`Accounts Receivable (lite) on port ${PORT}`));
}).catch(err => { console.error('Failed to init DB:', err); process.exit(1); });

module.exports = app;
