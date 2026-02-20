/**
 * Accounts Payable - Lite Version (SQLite)
 * Port: 8856
 *
 * Handles vendor/supplier management and accounts payable:
 * - Vendor CRUD with GSTIN/PAN/TDS fields
 * - Bill entry with GST line-level calculation
 * - Bill posting with auto journal entry creation
 * - Payment processing with auto JE + TDS entries
 * - Aging reports, vendor statements
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
const PORT = process.env.PORT || 8856;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'accounting_accounts_payable', mode: 'lite' });
});

// =============================================================================
// VENDORS
// =============================================================================

app.get('/api/vendors', (req, res) => {
  try {
    const { search, is_active, vendor_type, limit = 100, offset = 0 } = req.query;
    let sql = `
      SELECT v.*, v.code as vendor_code, v.name as vendor_name,
        (SELECT COALESCE(SUM(b.balance_due), 0) FROM acc_bills b WHERE b.vendor_id = v.id AND b.status NOT IN ('paid','void')) as outstanding_balance,
        (SELECT COALESCE(SUM(b.balance_due), 0) FROM acc_bills b WHERE b.vendor_id = v.id AND b.status NOT IN ('paid','void')) as current_balance,
        (SELECT COUNT(*) FROM acc_bills b WHERE b.vendor_id = v.id) as bill_count
      FROM acc_vendors v WHERE 1=1
    `;
    const params = [];
    if (search) { sql += ' AND (v.name LIKE ? OR v.code LIKE ? OR v.gstin LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (is_active !== undefined) { sql += ' AND v.is_active = ?'; params.push(is_active === 'true' ? 1 : 0); }
    if (vendor_type) { sql += ' AND v.vendor_type = ?'; params.push(vendor_type); }
    sql += ' ORDER BY v.name LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const data = query(sql, params);
    const total = get('SELECT COUNT(*) as total FROM acc_vendors');
    res.json({ success: true, data, pagination: { limit: parseInt(limit), offset: parseInt(offset), total: total?.total || 0 } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/vendors/:id', (req, res) => {
  try {
    const vendor = get(`
      SELECT v.*, v.code as vendor_code, v.name as vendor_name,
        (SELECT COALESCE(SUM(b.balance_due), 0) FROM acc_bills b WHERE b.vendor_id = v.id AND b.status NOT IN ('paid','void')) as outstanding_balance,
        (SELECT COALESCE(SUM(b.balance_due), 0) FROM acc_bills b WHERE b.vendor_id = v.id AND b.status NOT IN ('paid','void')) as current_balance,
        (SELECT COUNT(*) FROM acc_bills b WHERE b.vendor_id = v.id) as bill_count,
        (SELECT MAX(b.bill_date) FROM acc_bills b WHERE b.vendor_id = v.id) as last_bill_date
      FROM acc_vendors v WHERE v.id = ?
    `, [req.params.id]);
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor not found' });
    res.json({ success: true, data: vendor });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/vendors', (req, res) => {
  try {
    const d = req.body;
    if (d.vendor_code && !d.code) d.code = d.vendor_code;
    if (d.vendor_name && !d.name) d.name = d.vendor_name;
    if (!d.code || !d.name) return res.status(400).json({ success: false, error: 'code and name required' });
    const existing = get('SELECT id FROM acc_vendors WHERE code = ?', [d.code]);
    if (existing) return res.status(400).json({ success: false, error: 'Vendor code already exists' });

    if (d.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(d.gstin)) {
      return res.status(400).json({ success: false, error: 'Invalid GSTIN format' });
    }
    if (d.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(d.pan)) {
      return res.status(400).json({ success: false, error: 'Invalid PAN format' });
    }

    const id = uuidv4();
    run(`INSERT INTO acc_vendors (id, code, name, display_name, vendor_type, gstin, pan, tan, contact_person, email, phone, mobile, address_line1, address_line2, city, state, state_code, postal_code, pincode, country, payment_terms, credit_limit, tds_applicable, tds_section, default_expense_account_id, bank_name, bank_account_number, bank_ifsc, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, d.code, d.name, d.display_name || d.name, d.vendor_type || 'supplier', d.gstin || null, d.pan || null, d.tan || null,
        d.contact_person || null, d.email || null, d.phone || null, d.mobile || null,
        d.address_line1 || null, d.address_line2 || null, d.city || null, d.state || null, d.state_code || null, d.postal_code || null, d.pincode || null,
        d.country || 'India', d.payment_terms || d.payment_terms_days || 30, d.credit_limit || 0,
        d.tds_applicable ? 1 : 0, d.tds_section || null, d.default_expense_account_id || null,
        d.bank_name || null, d.bank_account_number || null, d.bank_ifsc || null, d.notes || null]);
    res.status(201).json({ success: true, data: get('SELECT *, code as vendor_code, name as vendor_name FROM acc_vendors WHERE id = ?', [id]) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/vendors/:id', (req, res) => {
  try {
    const existing = get('SELECT * FROM acc_vendors WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Vendor not found' });

    const fields = ['name', 'display_name', 'vendor_type', 'gstin', 'pan', 'tan', 'contact_person', 'email', 'phone', 'mobile',
      'address_line1', 'address_line2', 'city', 'state', 'state_code', 'postal_code', 'pincode', 'country',
      'payment_terms', 'credit_limit', 'tds_applicable', 'tds_section', 'default_expense_account_id',
      'bank_name', 'bank_account_number', 'bank_ifsc', 'is_active', 'notes'];
    const updates = [], params = [];
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        params.push((f === 'is_active' || f === 'tds_applicable') ? (req.body[f] ? 1 : 0) : req.body[f]);
      }
    }
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    updates.push("updated_at = datetime('now')");
    params.push(req.params.id);
    run(`UPDATE acc_vendors SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ success: true, data: get('SELECT * FROM acc_vendors WHERE id = ?', [req.params.id]) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// BILLS
// =============================================================================

app.get('/api/bills', (req, res) => {
  try {
    const { vendor_id, status, start_date, end_date, overdue, limit = 100, offset = 0 } = req.query;
    let sql = 'SELECT b.*, v.name as vendor_name, v.code as vendor_code FROM acc_bills b JOIN acc_vendors v ON b.vendor_id = v.id WHERE 1=1';
    const params = [];
    if (vendor_id) { sql += ' AND b.vendor_id = ?'; params.push(vendor_id); }
    if (status) { sql += ' AND b.status = ?'; params.push(status); }
    if (start_date) { sql += ' AND b.bill_date >= ?'; params.push(start_date); }
    if (end_date) { sql += ' AND b.bill_date <= ?'; params.push(end_date); }
    if (overdue === 'true') { sql += " AND b.due_date < date('now') AND b.balance_due > 0"; }
    sql += ' ORDER BY b.bill_date DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    res.json({ success: true, data: query(sql, params) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/bills/:id', (req, res) => {
  try {
    const bill = get('SELECT b.*, v.name as vendor_name, v.code as vendor_code, v.gstin as vendor_gstin FROM acc_bills b JOIN acc_vendors v ON b.vendor_id = v.id WHERE b.id = ?', [req.params.id]);
    if (!bill) return res.status(404).json({ success: false, error: 'Bill not found' });
    const lines = query('SELECT bl.*, a.account_code, a.account_name, tc.code as tax_code, tc.rate as tax_rate FROM acc_bill_lines bl JOIN acc_accounts a ON bl.account_id = a.id LEFT JOIN acc_tax_codes tc ON bl.tax_code_id = tc.id WHERE bl.bill_id = ? ORDER BY bl.line_number', [req.params.id]);
    const payments = query('SELECT * FROM acc_bill_payments WHERE bill_id = ? ORDER BY payment_date DESC', [req.params.id]);
    res.json({ success: true, data: { ...bill, lines, payments } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/bills', (req, res) => {
  try {
    const { vendor_id, bill_number, bill_date, due_date, lines, notes, reference_number, po_number, is_interstate, itc_eligible, description } = req.body;
    if (!vendor_id || !bill_number || !bill_date || !due_date || !lines?.length) {
      return res.status(400).json({ success: false, error: 'vendor_id, bill_number, bill_date, due_date, lines required' });
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

    run(`INSERT INTO acc_bills (id, vendor_id, bill_number, bill_date, due_date, reference_number, po_number, description, notes, is_interstate, itc_eligible, subtotal, taxable_amount, cgst_amount, sgst_amount, igst_amount, cess_amount, total_tax, tax_amount, total_amount, balance_due, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
      [id, vendor_id, bill_number, bill_date, due_date, reference_number || null, po_number || null, description || null, notes || null, interstate, itc_eligible !== false ? 1 : 0, subtotal, subtotal, totalCgst, totalSgst, totalIgst, totalCess, totalTax, totalTax, totalAmount, totalAmount]);

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
      run(`INSERT INTO acc_bill_lines (id, bill_id, line_number, account_id, description, quantity, unit_price, amount, discount_percent, discount_amount, net_amount, tax_code_id, tax_amount, hsn_sac_code, cgst_amount, sgst_amount, igst_amount, cess_amount, total_amount, cost_center_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), id, i + 1, l.account_id, l.description || null, qty, price, gross, disc, discAmt, net, l.tax_code_id || null, lcgst + lsgst + ligst + lcess, l.hsn_sac_code || null, lcgst, lsgst, ligst, lcess, lineTotal, l.cost_center_id || null]);
    }

    res.status(201).json({ success: true, data: get('SELECT * FROM acc_bills WHERE id = ?', [id]) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Post bill -> creates journal entry
app.post('/api/bills/:id/post', (req, res) => {
  try {
    const bill = get('SELECT b.*, v.name as vendor_name FROM acc_bills b JOIN acc_vendors v ON b.vendor_id = v.id WHERE b.id = ?', [req.params.id]);
    if (!bill) return res.status(404).json({ success: false, error: 'Bill not found' });
    if (bill.status !== 'draft') return res.status(400).json({ success: false, error: 'Bill is already posted' });

    const apAccount = get("SELECT id FROM acc_accounts WHERE account_code = '2100'");
    if (!apAccount) return res.status(400).json({ success: false, error: 'Accounts Payable account (2100) not configured' });

    const lines = query('SELECT * FROM acc_bill_lines WHERE bill_id = ?', [req.params.id]);
    const jeId = uuidv4();
    const count = get('SELECT COUNT(*) as cnt FROM acc_journal_entries');
    const entryNumber = `JE-BILL-${bill.bill_number}`;

    run(`INSERT INTO acc_journal_entries (id, entry_number, entry_date, entry_type, description, reference_type, reference_id, source_document, total_debit, total_credit, status) VALUES (?, ?, ?, 'AP', ?, 'bill', ?, ?, ?, ?, 'posted')`,
      [jeId, entryNumber, bill.bill_date, `Bill from ${bill.vendor_name}: ${bill.bill_number}`, req.params.id, bill.bill_number, bill.total_amount, bill.total_amount]);

    let lineNum = 1;
    for (const line of lines) {
      run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount, cost_center_id) VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
        [uuidv4(), jeId, lineNum++, line.account_id, line.description, line.net_amount || line.amount, line.cost_center_id || null]);

      // Input tax entries
      if ((line.cgst_amount || 0) > 0) {
        const acc = get("SELECT id FROM acc_accounts WHERE account_code = '1500'");
        if (acc) run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount) VALUES (?, ?, ?, ?, 'Input CGST', ?, 0)`, [uuidv4(), jeId, lineNum++, acc.id, line.cgst_amount]);
      }
      if ((line.sgst_amount || 0) > 0) {
        const acc = get("SELECT id FROM acc_accounts WHERE account_code = '1501'");
        if (acc) run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount) VALUES (?, ?, ?, ?, 'Input SGST', ?, 0)`, [uuidv4(), jeId, lineNum++, acc.id, line.sgst_amount]);
      }
      if ((line.igst_amount || 0) > 0) {
        const acc = get("SELECT id FROM acc_accounts WHERE account_code = '1502'");
        if (acc) run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount) VALUES (?, ?, ?, ?, 'Input IGST', ?, 0)`, [uuidv4(), jeId, lineNum++, acc.id, line.igst_amount]);
      }
    }

    // Credit AP
    run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount) VALUES (?, ?, ?, ?, ?, 0, ?)`,
      [uuidv4(), jeId, lineNum, apAccount.id, `Payable to ${bill.vendor_name}`, bill.total_amount]);

    // Post JE -> update ledger
    const jeLines = query('SELECT * FROM acc_journal_lines WHERE journal_entry_id = ?', [jeId]);
    for (const jl of jeLines) {
      const account = get('SELECT * FROM acc_accounts WHERE id = ?', [jl.account_id]);
      if (!account) continue;
      const newBal = account.current_balance + (jl.debit_amount || 0) - (jl.credit_amount || 0);
      run(`INSERT INTO acc_ledger_entries (id, account_id, journal_entry_id, entry_date, description, debit_amount, credit_amount, running_balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), jl.account_id, jeId, bill.bill_date, jl.description, jl.debit_amount, jl.credit_amount, newBal]);
      run("UPDATE acc_accounts SET current_balance = ?, updated_at = datetime('now') WHERE id = ?", [newBal, jl.account_id]);
    }

    run("UPDATE acc_journal_entries SET posted_at = datetime('now') WHERE id = ?", [jeId]);
    run("UPDATE acc_bills SET status = 'approved', journal_entry_id = ?, posted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", [jeId, req.params.id]);

    res.json({ success: true, data: { bill_id: req.params.id, journal_entry_id: jeId, status: 'posted' } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// PAYMENTS
// =============================================================================

app.post('/api/payments', (req, res) => {
  try {
    const d = req.body;
    if (!d.bill_id || !d.payment_date || !d.amount) {
      return res.status(400).json({ success: false, error: 'bill_id, payment_date, amount required' });
    }

    const bill = get('SELECT b.*, v.name as vendor_name FROM acc_bills b JOIN acc_vendors v ON b.vendor_id = v.id WHERE b.id = ?', [d.bill_id]);
    if (!bill) return res.status(404).json({ success: false, error: 'Bill not found' });
    if (bill.status === 'draft') return res.status(400).json({ success: false, error: 'Bill must be posted before payment' });
    if (d.amount > bill.balance_due) return res.status(400).json({ success: false, error: 'Payment exceeds balance due' });

    const paymentId = uuidv4();
    run(`INSERT INTO acc_bill_payments (id, bill_id, payment_date, amount, payment_method, bank_account_id, reference, cheque_number, cheque_date, notes, tds_amount, tds_section, journal_entry_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [paymentId, d.bill_id, d.payment_date, d.amount, d.payment_method || 'bank_transfer', d.bank_account_id || null, d.reference_number || d.reference || null, d.cheque_number || null, d.cheque_date || null, d.notes || null, d.tds_amount || 0, d.tds_section || null]);

    const newBalance = bill.balance_due - d.amount;
    const newStatus = newBalance <= 0 ? 'paid' : 'partial';
    run("UPDATE acc_bills SET balance_due = ?, amount_paid = COALESCE(amount_paid, 0) + ?, status = ?, updated_at = datetime('now') WHERE id = ?",
      [Math.max(0, newBalance), d.amount, newStatus, d.bill_id]);

    // Auto journal entry for payment
    const apAccount = get("SELECT id FROM acc_accounts WHERE account_code = '2100'");
    if (apAccount && d.bank_account_id) {
      const bankAcc = get('SELECT account_id FROM acc_bank_accounts WHERE id = ?', [d.bank_account_id]);
      if (bankAcc && bankAcc.account_id) {
        const jeId = uuidv4();
        const entryNumber = `JE-PMT-${paymentId.slice(0, 8)}`;
        run(`INSERT INTO acc_journal_entries (id, entry_number, entry_date, entry_type, description, reference_type, reference_id, total_debit, total_credit, status, posted_at) VALUES (?, ?, ?, 'PMT', ?, 'payment', ?, ?, ?, 'posted', datetime('now'))`,
          [jeId, entryNumber, d.payment_date, `Payment to ${bill.vendor_name} for bill ${bill.bill_number}`, paymentId, d.amount, d.amount]);

        // Debit AP
        run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount) VALUES (?, ?, 1, ?, ?, ?, 0)`,
          [uuidv4(), jeId, apAccount.id, `Payment to ${bill.vendor_name}`, d.amount]);
        // Credit Bank
        const netPay = d.amount - (d.tds_amount || 0);
        run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount) VALUES (?, ?, 2, ?, ?, 0, ?)`,
          [uuidv4(), jeId, bankAcc.account_id, `Payment for bill ${bill.bill_number}`, netPay]);

        // TDS entry
        if ((d.tds_amount || 0) > 0) {
          const tdsAcc = get("SELECT id FROM acc_accounts WHERE account_code = '2310'");
          if (tdsAcc) {
            run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount) VALUES (?, ?, 3, ?, 'TDS Payable', 0, ?)`,
              [uuidv4(), jeId, tdsAcc.id, d.tds_amount]);
          }
        }

        // Update ledger
        const jeLines = query('SELECT * FROM acc_journal_lines WHERE journal_entry_id = ?', [jeId]);
        for (const jl of jeLines) {
          const account = get('SELECT * FROM acc_accounts WHERE id = ?', [jl.account_id]);
          if (!account) continue;
          const newBal = account.current_balance + (jl.debit_amount || 0) - (jl.credit_amount || 0);
          run(`INSERT INTO acc_ledger_entries (id, account_id, journal_entry_id, entry_date, description, debit_amount, credit_amount, running_balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [uuidv4(), jl.account_id, jeId, d.payment_date, jl.description, jl.debit_amount, jl.credit_amount, newBal]);
          run("UPDATE acc_accounts SET current_balance = ?, updated_at = datetime('now') WHERE id = ?", [newBal, jl.account_id]);
        }

        run('UPDATE acc_bill_payments SET journal_entry_id = ? WHERE id = ?', [jeId, paymentId]);
      }
    }

    res.status(201).json({ success: true, data: get('SELECT * FROM acc_bill_payments WHERE id = ?', [paymentId]) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Legacy endpoint
app.post('/api/bills/:id/pay', (req, res) => {
  req.body.bill_id = req.params.id;
  return app.handle({ ...req, url: '/api/payments', method: 'POST' }, res);
});

// =============================================================================
// AGING REPORT
// =============================================================================

app.get('/api/aging', (req, res) => {
  try {
    const asOf = req.query.as_of_date || new Date().toISOString().split('T')[0];
    const aging = query(`
      SELECT v.id as vendor_id, v.code as vendor_code, v.name as vendor_name, COUNT(b.id) as bill_count,
        SUM(CASE WHEN julianday(?) - julianday(b.due_date) <= 0 THEN b.balance_due ELSE 0 END) as current_amount,
        SUM(CASE WHEN julianday(?) - julianday(b.due_date) BETWEEN 1 AND 30 THEN b.balance_due ELSE 0 END) as days_1_30,
        SUM(CASE WHEN julianday(?) - julianday(b.due_date) BETWEEN 31 AND 60 THEN b.balance_due ELSE 0 END) as days_31_60,
        SUM(CASE WHEN julianday(?) - julianday(b.due_date) BETWEEN 61 AND 90 THEN b.balance_due ELSE 0 END) as days_61_90,
        SUM(CASE WHEN julianday(?) - julianday(b.due_date) > 90 THEN b.balance_due ELSE 0 END) as over_90,
        SUM(b.balance_due) as total_outstanding
      FROM acc_vendors v LEFT JOIN acc_bills b ON v.id = b.vendor_id AND b.balance_due > 0 AND b.status NOT IN ('draft','void')
      WHERE 1=1 GROUP BY v.id, v.code, v.name HAVING SUM(b.balance_due) > 0 ORDER BY total_outstanding DESC
    `, [asOf, asOf, asOf, asOf, asOf]);

    const totals = aging.reduce((a, r) => ({
      current_amount: a.current_amount + (r.current_amount || 0), days_1_30: a.days_1_30 + (r.days_1_30 || 0),
      days_31_60: a.days_31_60 + (r.days_31_60 || 0), days_61_90: a.days_61_90 + (r.days_61_90 || 0),
      over_90: a.over_90 + (r.over_90 || 0), total_outstanding: a.total_outstanding + (r.total_outstanding || 0)
    }), { current_amount: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, over_90: 0, total_outstanding: 0 });

    res.json({ success: true, data: { as_of_date: asOf, vendors: aging, totals } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// VENDOR STATEMENT
// =============================================================================

app.get('/api/vendors/:id/statement', (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const vendor = get('SELECT * FROM acc_vendors WHERE id = ?', [req.params.id]);
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor not found' });

    let dateFilterBill = '', dateFilterPay = '';
    const params = [req.params.id];
    if (start_date) { dateFilterBill += ' AND b.bill_date >= ?'; dateFilterPay += ' AND p.payment_date >= ?'; params.push(start_date); }
    if (end_date) { dateFilterBill += ' AND b.bill_date <= ?'; dateFilterPay += ' AND p.payment_date <= ?'; params.push(end_date); }

    // Build params for each query separately
    const billParams = [req.params.id];
    const payParams = [req.params.id];
    if (start_date) { billParams.push(start_date); payParams.push(start_date); }
    if (end_date) { billParams.push(end_date); payParams.push(end_date); }

    const bills = query(`SELECT 'bill' as type, b.bill_date as transaction_date, b.bill_number as reference, b.description, b.total_amount as debit, 0 as credit FROM acc_bills b WHERE b.vendor_id = ? AND b.status NOT IN ('draft','void') ${dateFilterBill} ORDER BY b.bill_date`, billParams);
    const payments = query(`SELECT 'payment' as type, p.payment_date as transaction_date, p.reference as reference, 'Payment' as description, 0 as debit, p.amount as credit FROM acc_bill_payments p JOIN acc_bills b ON p.bill_id = b.id WHERE b.vendor_id = ? ${dateFilterPay} ORDER BY p.payment_date`, payParams);

    const transactions = [...bills, ...payments].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
    let runningBalance = 0;
    const statement = transactions.map(t => {
      runningBalance += (t.debit || 0) - (t.credit || 0);
      return { ...t, running_balance: runningBalance };
    });

    res.json({ success: true, data: { vendor, transactions: statement, closing_balance: runningBalance } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// DEBIT NOTES
// =============================================================================

app.get('/api/debit-notes', (req, res) => {
  try {
    const { vendor_id, status, limit = 100, offset = 0 } = req.query;
    let sql = 'SELECT dn.*, v.name as vendor_name, v.code as vendor_code FROM acc_debit_notes dn JOIN acc_vendors v ON dn.vendor_id = v.id WHERE 1=1';
    const params = [];
    if (vendor_id) { sql += ' AND dn.vendor_id = ?'; params.push(vendor_id); }
    if (status) { sql += ' AND dn.status = ?'; params.push(status); }
    sql += ' ORDER BY dn.debit_note_date DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    res.json({ success: true, data: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/debit-notes/:id', (req, res) => {
  try {
    const dn = get('SELECT dn.*, v.name as vendor_name FROM acc_debit_notes dn JOIN acc_vendors v ON dn.vendor_id = v.id WHERE dn.id = ?', [req.params.id]);
    if (!dn) return res.status(404).json({ success: false, error: 'Debit note not found' });
    const lines = query('SELECT dl.*, a.account_code, a.account_name FROM acc_debit_note_lines dl JOIN acc_accounts a ON dl.account_id = a.id WHERE dl.debit_note_id = ? ORDER BY dl.line_number', [req.params.id]);
    res.json({ success: true, data: { ...dn, lines } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/debit-notes', (req, res) => {
  try {
    const { vendor_id, debit_note_number, debit_note_date, original_bill_id, reason, reason_detail, lines, notes } = req.body;
    if (!vendor_id || !debit_note_number || !debit_note_date || !lines?.length) {
      return res.status(400).json({ success: false, error: 'vendor_id, debit_note_number, debit_note_date, lines required' });
    }
    const id = uuidv4();
    let subtotal = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0;
    for (const l of lines) {
      const amt = (l.quantity || 1) * (l.unit_price || 0);
      subtotal += amt;
      totalCgst += (l.cgst_amount || 0); totalSgst += (l.sgst_amount || 0); totalIgst += (l.igst_amount || 0);
    }
    const totalTax = totalCgst + totalSgst + totalIgst;
    run(`INSERT INTO acc_debit_notes (id, debit_note_number, vendor_id, original_bill_id, debit_note_date, reason, reason_detail, subtotal, cgst_amount, sgst_amount, igst_amount, total_tax, total_amount, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, debit_note_number, vendor_id, original_bill_id || null, debit_note_date, reason || 'return', reason_detail || null, subtotal, totalCgst, totalSgst, totalIgst, totalTax, subtotal + totalTax, notes || null]);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      run(`INSERT INTO acc_debit_note_lines (id, debit_note_id, line_number, account_id, description, hsn_code, quantity, unit_price, amount, tax_code_id, cgst_amount, sgst_amount, igst_amount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [uuidv4(), id, i + 1, l.account_id, l.description || null, l.hsn_code || null, l.quantity || 1, l.unit_price || 0, (l.quantity || 1) * (l.unit_price || 0), l.tax_code_id || null, l.cgst_amount || 0, l.sgst_amount || 0, l.igst_amount || 0]);
    }
    res.status(201).json({ success: true, data: get('SELECT * FROM acc_debit_notes WHERE id = ?', [id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/debit-notes/:id/post', (req, res) => {
  try {
    const dn = get('SELECT dn.*, v.name as vendor_name FROM acc_debit_notes dn JOIN acc_vendors v ON dn.vendor_id = v.id WHERE dn.id = ?', [req.params.id]);
    if (!dn) return res.status(404).json({ success: false, error: 'Not found' });
    if (dn.status !== 'draft') return res.status(400).json({ success: false, error: 'Already posted' });

    const apAccount = get("SELECT id FROM acc_accounts WHERE account_code = '2100'");
    if (!apAccount) return res.status(400).json({ success: false, error: 'AP account (2100) not configured' });

    const lines = query('SELECT * FROM acc_debit_note_lines WHERE debit_note_id = ?', [req.params.id]);
    const jeId = uuidv4();
    run(`INSERT INTO acc_journal_entries (id, entry_number, entry_date, entry_type, description, reference_type, reference_id, total_debit, total_credit, status, posted_at) VALUES (?,?,?,'DN',?,?,?,?,?,'posted',datetime('now'))`,
      [jeId, `JE-DN-${dn.debit_note_number}`, dn.debit_note_date, `Debit Note ${dn.debit_note_number} to ${dn.vendor_name}`, 'debit_note', req.params.id, dn.total_amount, dn.total_amount]);

    let lineNum = 1;
    // Dr AP
    run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount) VALUES (?,?,?,?,?,?,0)`,
      [uuidv4(), jeId, lineNum++, apAccount.id, `Debit Note to ${dn.vendor_name}`, dn.total_amount]);
    // Cr expense/purchase returns
    for (const l of lines) {
      run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount) VALUES (?,?,?,?,?,0,?)`,
        [uuidv4(), jeId, lineNum++, l.account_id, l.description || 'Purchase return', l.amount]);
    }
    // Cr Input GST reversal
    const gstReversalAcc = (code) => get(`SELECT id FROM acc_accounts WHERE account_code = ?`, [code]);
    if (dn.cgst_amount > 0) { const a = gstReversalAcc('1500'); if (a) run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount) VALUES (?,?,?,?,'Reverse Input CGST',0,?)`, [uuidv4(), jeId, lineNum++, a.id, dn.cgst_amount]); }
    if (dn.sgst_amount > 0) { const a = gstReversalAcc('1501'); if (a) run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount) VALUES (?,?,?,?,'Reverse Input SGST',0,?)`, [uuidv4(), jeId, lineNum++, a.id, dn.sgst_amount]); }
    if (dn.igst_amount > 0) { const a = gstReversalAcc('1502'); if (a) run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount) VALUES (?,?,?,?,'Reverse Input IGST',0,?)`, [uuidv4(), jeId, lineNum++, a.id, dn.igst_amount]); }

    // Update ledger
    const jeLines = query('SELECT * FROM acc_journal_lines WHERE journal_entry_id = ?', [jeId]);
    for (const jl of jeLines) {
      const account = get('SELECT * FROM acc_accounts WHERE id = ?', [jl.account_id]);
      if (!account) continue;
      const newBal = account.current_balance + (jl.debit_amount || 0) - (jl.credit_amount || 0);
      run(`INSERT INTO acc_ledger_entries (id, account_id, journal_entry_id, entry_date, description, debit_amount, credit_amount, running_balance) VALUES (?,?,?,?,?,?,?,?)`,
        [uuidv4(), jl.account_id, jeId, dn.debit_note_date, jl.description, jl.debit_amount, jl.credit_amount, newBal]);
      run("UPDATE acc_accounts SET current_balance = ?, updated_at = datetime('now') WHERE id = ?", [newBal, jl.account_id]);
    }

    run("UPDATE acc_debit_notes SET status = 'posted', journal_entry_id = ?, updated_at = datetime('now') WHERE id = ?", [jeId, req.params.id]);
    res.json({ success: true, data: get('SELECT * FROM acc_debit_notes WHERE id = ?', [req.params.id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/debit-notes/:id/apply', (req, res) => {
  try {
    const { bill_id } = req.body;
    if (!bill_id) return res.status(400).json({ success: false, error: 'bill_id required' });
    const dn = get('SELECT * FROM acc_debit_notes WHERE id = ? AND status = ?', [req.params.id, 'posted']);
    if (!dn) return res.status(404).json({ success: false, error: 'Debit note not found or not posted' });
    const bill = get('SELECT * FROM acc_bills WHERE id = ?', [bill_id]);
    if (!bill) return res.status(404).json({ success: false, error: 'Bill not found' });

    const applyAmt = Math.min(dn.total_amount, bill.balance_due);
    const newBalance = bill.balance_due - applyAmt;
    run("UPDATE acc_bills SET balance_due = ?, status = ?, updated_at = datetime('now') WHERE id = ?",
      [newBalance, newBalance <= 0 ? 'paid' : 'partial', bill_id]);
    run("UPDATE acc_debit_notes SET status = 'applied', applied_to_bill_id = ?, updated_at = datetime('now') WHERE id = ?", [bill_id, req.params.id]);
    res.json({ success: true, data: { applied_amount: applyAmt, new_balance_due: newBalance } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =============================================================================
// EXPORT
// =============================================================================

app.get('/api/bills/export/csv', (req, res) => {
  try {
    const data = query('SELECT b.bill_number, v.name as vendor_name, b.bill_date, b.due_date, b.subtotal, b.total_tax, b.total_amount, b.balance_due, b.status FROM acc_bills b JOIN acc_vendors v ON b.vendor_id = v.id ORDER BY b.bill_date DESC');
    sendCSV(res, data, [
      { key: 'bill_number', label: 'Bill #' }, { key: 'vendor_name', label: 'Vendor' },
      { key: 'bill_date', label: 'Date' }, { key: 'due_date', label: 'Due Date' },
      { key: 'subtotal', label: 'Subtotal' }, { key: 'total_tax', label: 'Tax' },
      { key: 'total_amount', label: 'Total' }, { key: 'balance_due', label: 'Balance Due' },
      { key: 'status', label: 'Status' }
    ], 'bills.csv');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/vendors/export/csv', (req, res) => {
  try {
    const data = query("SELECT v.code, v.name, v.gstin, v.pan, v.email, v.phone, v.city, v.state, CASE WHEN v.is_active THEN 'Active' ELSE 'Inactive' END as status FROM acc_vendors v ORDER BY v.name");
    sendCSV(res, data, [
      { key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'gstin', label: 'GSTIN' },
      { key: 'pan', label: 'PAN' }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' },
      { key: 'city', label: 'City' }, { key: 'state', label: 'State' }, { key: 'status', label: 'Status' }
    ], 'vendors.csv');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/aging/export/csv', (req, res) => {
  try {
    const asOf = req.query.as_of_date || new Date().toISOString().split('T')[0];
    const data = query(`SELECT v.code as vendor_code, v.name as vendor_name,
      SUM(CASE WHEN julianday(?) - julianday(b.due_date) <= 0 THEN b.balance_due ELSE 0 END) as current_amount,
      SUM(CASE WHEN julianday(?) - julianday(b.due_date) BETWEEN 1 AND 30 THEN b.balance_due ELSE 0 END) as days_1_30,
      SUM(CASE WHEN julianday(?) - julianday(b.due_date) BETWEEN 31 AND 60 THEN b.balance_due ELSE 0 END) as days_31_60,
      SUM(CASE WHEN julianday(?) - julianday(b.due_date) BETWEEN 61 AND 90 THEN b.balance_due ELSE 0 END) as days_61_90,
      SUM(CASE WHEN julianday(?) - julianday(b.due_date) > 90 THEN b.balance_due ELSE 0 END) as over_90,
      SUM(b.balance_due) as total
      FROM acc_vendors v LEFT JOIN acc_bills b ON v.id = b.vendor_id AND b.balance_due > 0 AND b.status NOT IN ('draft','void')
      GROUP BY v.id HAVING SUM(b.balance_due) > 0 ORDER BY total DESC`, [asOf, asOf, asOf, asOf, asOf]);
    sendCSV(res, data, [
      { key: 'vendor_code', label: 'Code' }, { key: 'vendor_name', label: 'Vendor' },
      { key: 'current_amount', label: 'Current' }, { key: 'days_1_30', label: '1-30' },
      { key: 'days_31_60', label: '31-60' }, { key: 'days_61_90', label: '61-90' },
      { key: 'over_90', label: '90+' }, { key: 'total', label: 'Total' }
    ], 'ap_aging.csv');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/aging/export/pdf', (req, res) => {
  try {
    const asOf = req.query.as_of_date || new Date().toISOString().split('T')[0];
    const data = query(`SELECT v.code as vendor_code, v.name as vendor_name,
      SUM(CASE WHEN julianday(?) - julianday(b.due_date) <= 0 THEN b.balance_due ELSE 0 END) as current_amount,
      SUM(CASE WHEN julianday(?) - julianday(b.due_date) BETWEEN 1 AND 30 THEN b.balance_due ELSE 0 END) as days_1_30,
      SUM(CASE WHEN julianday(?) - julianday(b.due_date) BETWEEN 31 AND 60 THEN b.balance_due ELSE 0 END) as days_31_60,
      SUM(CASE WHEN julianday(?) - julianday(b.due_date) BETWEEN 61 AND 90 THEN b.balance_due ELSE 0 END) as days_61_90,
      SUM(CASE WHEN julianday(?) - julianday(b.due_date) > 90 THEN b.balance_due ELSE 0 END) as over_90,
      SUM(b.balance_due) as total
      FROM acc_vendors v LEFT JOIN acc_bills b ON v.id = b.vendor_id AND b.balance_due > 0 AND b.status NOT IN ('draft','void')
      GROUP BY v.id HAVING SUM(b.balance_due) > 0 ORDER BY total DESC`, [asOf, asOf, asOf, asOf, asOf]);
    sendLandscapePDF(res, (doc) => {
      addHeader(doc, 'Accounts Payable Aging', `As of ${fmtDate(asOf)}`);
      addTable(doc, [
        { key: 'vendor_code', label: 'Code', width: 0.8 }, { key: 'vendor_name', label: 'Vendor', width: 2 },
        { key: 'current_amount', label: 'Current', width: 1, align: 'right', formatter: fmtCurrency },
        { key: 'days_1_30', label: '1-30', width: 1, align: 'right', formatter: fmtCurrency },
        { key: 'days_31_60', label: '31-60', width: 1, align: 'right', formatter: fmtCurrency },
        { key: 'days_61_90', label: '61-90', width: 1, align: 'right', formatter: fmtCurrency },
        { key: 'over_90', label: '90+', width: 1, align: 'right', formatter: fmtCurrency },
        { key: 'total', label: 'Total', width: 1.2, align: 'right', formatter: fmtCurrency }
      ], data);
    }, 'ap_aging.pdf');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/debit-notes/export/csv', (req, res) => {
  try {
    const data = query('SELECT dn.debit_note_number, v.name as vendor_name, dn.debit_note_date, dn.reason, dn.subtotal, dn.total_tax, dn.total_amount, dn.status FROM acc_debit_notes dn JOIN acc_vendors v ON dn.vendor_id = v.id ORDER BY dn.debit_note_date DESC');
    sendCSV(res, data, [
      { key: 'debit_note_number', label: 'DN #' }, { key: 'vendor_name', label: 'Vendor' },
      { key: 'debit_note_date', label: 'Date' }, { key: 'reason', label: 'Reason' },
      { key: 'subtotal', label: 'Subtotal' }, { key: 'total_tax', label: 'Tax' },
      { key: 'total_amount', label: 'Total' }, { key: 'status', label: 'Status' }
    ], 'debit_notes.csv');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =============================================================================
// E-WAY BILL (Inward)
// =============================================================================

const { generateEWayBillJSON } = require('../shared/ewaybill');

app.post('/api/bills/:id/generate-ewaybill', (req, res) => {
  try {
    const bill = get('SELECT b.*, v.name as vendor_name, v.gstin as vendor_gstin, v.address_line1 as v_addr1, v.city as v_city, v.state as v_state, v.state_code as v_state_code, v.pincode as v_pincode FROM acc_bills b JOIN acc_vendors v ON b.vendor_id = v.id WHERE b.id = ?', [req.params.id]);
    if (!bill) return res.status(404).json({ success: false, error: 'Bill not found' });
    const lines = query('SELECT * FROM acc_bill_lines WHERE bill_id = ? ORDER BY line_number', [req.params.id]);
    const company = get('SELECT * FROM acc_company_settings WHERE id = ?', ['default']) || {};
    const vendor = { name: bill.vendor_name, gstin: bill.vendor_gstin, address_line1: bill.v_addr1, city: bill.v_city, state: bill.v_state, state_code: bill.v_state_code, pincode: bill.v_pincode };
    const transport = req.body;

    const payload = generateEWayBillJSON(bill, lines, vendor, company, transport);
    const id = uuidv4();
    run(`INSERT INTO acc_ewaybills (id, bill_id, from_place, from_state, from_pincode, to_place, to_state, to_pincode,
      vehicle_number, transporter_id, transporter_name, transport_mode, distance_km, supply_type,
      doc_type, doc_number, doc_date, total_value, status, json_payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'I', 'BIL', ?, ?, ?, 'draft', ?)`,
      [id, req.params.id, vendor.city, vendor.state, vendor.pincode, company.city, company.state, company.pincode,
       transport.vehicle_number || '', transport.transporter_id || '', transport.transporter_name || '',
       transport.transport_mode || '1', transport.distance_km || 0,
       bill.bill_number, bill.bill_date, payload.totInvValue, JSON.stringify(payload)]);
    res.status(201).json({ success: true, data: { id, payload } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/ewaybills', (req, res) => {
  try {
    const data = query(`SELECT e.*, b.bill_number, v.name as vendor_name FROM acc_ewaybills e
      LEFT JOIN acc_bills b ON e.bill_id = b.id LEFT JOIN acc_vendors v ON b.vendor_id = v.id
      WHERE e.bill_id IS NOT NULL ORDER BY e.created_at DESC`);
    res.json({ success: true, data });
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
  app.listen(PORT, () => console.log(`Accounts Payable (lite) on port ${PORT}`));
}).catch(err => { console.error('Failed to init DB:', err); process.exit(1); });

module.exports = app;
