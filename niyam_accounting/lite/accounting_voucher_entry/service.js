/**
 * Voucher Entry - Lite Version (SQLite)
 * Port: 8861
 *
 * Tally-style unified voucher entry:
 * - Sales, Purchase, Payment, Receipt, Contra, Journal vouchers
 * - Auto journal entry creation on post
 * - Recurring transaction templates
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
const PORT = process.env.PORT || 8861;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'accounting_voucher_entry', mode: 'lite' });
});

// =============================================================================
// VOUCHER TYPES
// =============================================================================

const VOUCHER_TYPES = [
  { type: 'sales', label: 'Sales', shortcut: 'F8', description: 'Record sales to customers', dr: 'AR/Cash', cr: 'Revenue + GST' },
  { type: 'purchase', label: 'Purchase', shortcut: 'F9', description: 'Record purchases from vendors', dr: 'Expense + GST ITC', cr: 'AP/Cash' },
  { type: 'payment', label: 'Payment', shortcut: 'F5', description: 'Record payments made', dr: 'Expense/AP', cr: 'Cash/Bank' },
  { type: 'receipt', label: 'Receipt', shortcut: 'F6', description: 'Record money received', dr: 'Cash/Bank', cr: 'Revenue/AR' },
  { type: 'contra', label: 'Contra', shortcut: 'F4', description: 'Transfer between cash/bank accounts', dr: 'Cash/Bank', cr: 'Bank/Cash' },
  { type: 'journal', label: 'Journal', shortcut: 'F7', description: 'Manual journal entry', dr: 'Custom', cr: 'Custom' }
];

app.get('/api/voucher-types', (req, res) => {
  res.json({ success: true, data: VOUCHER_TYPES });
});

// =============================================================================
// VOUCHERS
// =============================================================================

app.get('/api/vouchers', (req, res) => {
  try {
    const { voucher_type, status, start_date, end_date, party_id, limit = 100, offset = 0 } = req.query;
    let sql = 'SELECT * FROM acc_vouchers WHERE 1=1';
    const params = [];
    if (voucher_type) { sql += ' AND voucher_type = ?'; params.push(voucher_type); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (start_date) { sql += ' AND voucher_date >= ?'; params.push(start_date); }
    if (end_date) { sql += ' AND voucher_date <= ?'; params.push(end_date); }
    if (party_id) { sql += ' AND party_id = ?'; params.push(party_id); }
    sql += ' ORDER BY voucher_date DESC, created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const data = query(sql, params);
    const total = get('SELECT COUNT(*) as total FROM acc_vouchers');
    res.json({ success: true, data, pagination: { limit: parseInt(limit), offset: parseInt(offset), total: total?.total || 0 } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/vouchers/:id', (req, res) => {
  try {
    const voucher = get('SELECT * FROM acc_vouchers WHERE id = ?', [req.params.id]);
    if (!voucher) return res.status(404).json({ success: false, error: 'Voucher not found' });
    const lines = query(`SELECT vl.*, a.account_code, a.account_name FROM acc_voucher_lines vl JOIN acc_accounts a ON vl.account_id = a.id WHERE vl.voucher_id = ? ORDER BY vl.line_number`, [req.params.id]);
    res.json({ success: true, data: { ...voucher, lines } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/vouchers', (req, res) => {
  try {
    const { voucher_type, voucher_date, party_id, party_type, amount, narration, reference, lines } = req.body;
    if (!voucher_type || !voucher_date || !lines?.length) {
      return res.status(400).json({ success: false, error: 'voucher_type, voucher_date, lines required' });
    }
    if (!VOUCHER_TYPES.find(t => t.type === voucher_type)) {
      return res.status(400).json({ success: false, error: 'Invalid voucher type' });
    }

    // Validate balanced
    let totalDr = 0, totalCr = 0;
    for (const l of lines) {
      if (l.dr_cr === 'dr') totalDr += (l.amount || 0);
      else totalCr += (l.amount || 0);
    }
    if (Math.abs(totalDr - totalCr) > 0.01) {
      return res.status(400).json({ success: false, error: `Voucher not balanced: Dr=${totalDr}, Cr=${totalCr}` });
    }

    const id = uuidv4();
    const prefix = { sales: 'SV', purchase: 'PV', payment: 'PMT', receipt: 'RCT', contra: 'CTR', journal: 'JV' }[voucher_type] || 'VCH';
    const count = get('SELECT COUNT(*) as cnt FROM acc_vouchers WHERE voucher_type = ?', [voucher_type]);
    const voucherNumber = `${prefix}-${String((count?.cnt || 0) + 1).padStart(5, '0')}`;

    run(`INSERT INTO acc_vouchers (id, voucher_number, voucher_type, voucher_date, party_id, party_type, amount, narration, reference)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, voucherNumber, voucher_type, voucher_date, party_id || null, party_type || null, amount || totalDr, narration || null, reference || null]);

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      run(`INSERT INTO acc_voucher_lines (id, voucher_id, line_number, account_id, amount, dr_cr, description, hsn_code, tax_code_id, tax_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), id, i + 1, l.account_id, l.amount || 0, l.dr_cr, l.description || null, l.hsn_code || null, l.tax_code_id || null, l.tax_amount || 0]);
    }

    const created = get('SELECT * FROM acc_vouchers WHERE id = ?', [id]);
    const createdLines = query('SELECT vl.*, a.account_code, a.account_name FROM acc_voucher_lines vl JOIN acc_accounts a ON vl.account_id = a.id WHERE vl.voucher_id = ? ORDER BY vl.line_number', [id]);
    res.status(201).json({ success: true, data: { ...created, lines: createdLines } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Post voucher -> create journal entry
app.post('/api/vouchers/:id/post', (req, res) => {
  try {
    const voucher = get('SELECT * FROM acc_vouchers WHERE id = ?', [req.params.id]);
    if (!voucher) return res.status(404).json({ success: false, error: 'Not found' });
    if (voucher.status === 'posted') return res.status(400).json({ success: false, error: 'Already posted' });

    const lines = query('SELECT * FROM acc_voucher_lines WHERE voucher_id = ?', [req.params.id]);

    // Create journal entry
    const jeId = uuidv4();
    const entryType = { sales: 'SV', purchase: 'PV', payment: 'PMT', receipt: 'RCT', contra: 'CTR', journal: 'JV' }[voucher.voucher_type] || 'STD';
    let totalDebit = 0, totalCredit = 0;
    for (const l of lines) {
      if (l.dr_cr === 'dr') totalDebit += l.amount;
      else totalCredit += l.amount;
    }

    run(`INSERT INTO acc_journal_entries (id, entry_number, entry_date, entry_type, description, reference_type, reference_id, source_document, total_debit, total_credit, status, posted_at)
      VALUES (?, ?, ?, ?, ?, 'voucher', ?, ?, ?, ?, 'posted', datetime('now'))`,
      [jeId, `JE-${voucher.voucher_number}`, voucher.voucher_date, entryType, voucher.narration || `${voucher.voucher_type} voucher`, req.params.id, voucher.voucher_number, totalDebit, totalCredit]);

    // Create journal lines + update ledger
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const debit = l.dr_cr === 'dr' ? l.amount : 0;
      const credit = l.dr_cr === 'cr' ? l.amount : 0;

      run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), jeId, i + 1, l.account_id, l.description || voucher.narration, debit, credit]);

      // Update ledger + account balance
      const account = get('SELECT * FROM acc_accounts WHERE id = ?', [l.account_id]);
      if (account) {
        const newBal = account.current_balance + debit - credit;
        run(`INSERT INTO acc_ledger_entries (id, account_id, journal_entry_id, entry_date, description, debit_amount, credit_amount, running_balance)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), l.account_id, jeId, voucher.voucher_date, l.description || voucher.narration, debit, credit, newBal]);
        run("UPDATE acc_accounts SET current_balance = ?, updated_at = datetime('now') WHERE id = ?", [newBal, l.account_id]);
      }
    }

    run("UPDATE acc_vouchers SET status = 'posted', journal_entry_id = ?, updated_at = datetime('now') WHERE id = ?", [jeId, req.params.id]);
    res.json({ success: true, data: { voucher_id: req.params.id, journal_entry_id: jeId, status: 'posted' } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/vouchers/:id/void', (req, res) => {
  try {
    const voucher = get('SELECT * FROM acc_vouchers WHERE id = ?', [req.params.id]);
    if (!voucher) return res.status(404).json({ success: false, error: 'Not found' });
    run("UPDATE acc_vouchers SET status = 'void', updated_at = datetime('now') WHERE id = ?", [req.params.id]);
    res.json({ success: true, message: 'Voucher voided' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// RECURRING TEMPLATES
// =============================================================================

app.get('/api/recurring', (req, res) => {
  try {
    const { is_active } = req.query;
    let sql = 'SELECT * FROM acc_recurring_templates WHERE 1=1';
    const params = [];
    if (is_active !== undefined) { sql += ' AND is_active = ?'; params.push(is_active === 'true' ? 1 : 0); }
    sql += ' ORDER BY next_run_date ASC';
    res.json({ success: true, data: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/recurring/:id', (req, res) => {
  try {
    const tmpl = get('SELECT * FROM acc_recurring_templates WHERE id = ?', [req.params.id]);
    if (!tmpl) return res.status(404).json({ success: false, error: 'Not found' });
    const lines = query('SELECT rl.*, a.account_code, a.account_name FROM acc_recurring_template_lines rl JOIN acc_accounts a ON rl.account_id = a.id WHERE rl.template_id = ? ORDER BY rl.line_number', [req.params.id]);
    res.json({ success: true, data: { ...tmpl, lines } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/recurring', (req, res) => {
  try {
    const { name, voucher_type, frequency, day_of_month, day_of_week, start_date, end_date, party_id, party_type, amount, narration, auto_post, lines } = req.body;
    if (!name || !voucher_type || !frequency || !start_date || !lines?.length) {
      return res.status(400).json({ success: false, error: 'name, voucher_type, frequency, start_date, lines required' });
    }
    const id = uuidv4();
    run(`INSERT INTO acc_recurring_templates (id, name, voucher_type, frequency, day_of_month, day_of_week, start_date, end_date, next_run_date, party_id, party_type, amount, narration, auto_post)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, voucher_type, frequency, day_of_month || null, day_of_week || null, start_date, end_date || null, start_date, party_id || null, party_type || null, amount || 0, narration || null, auto_post ? 1 : 0]);

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      run(`INSERT INTO acc_recurring_template_lines (id, template_id, line_number, account_id, amount, dr_cr, description)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), id, i + 1, l.account_id, l.amount || 0, l.dr_cr, l.description || null]);
    }
    res.status(201).json({ success: true, data: get('SELECT * FROM acc_recurring_templates WHERE id = ?', [id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/recurring/:id', (req, res) => {
  try {
    const existing = get('SELECT * FROM acc_recurring_templates WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Not found' });
    const fields = ['name', 'frequency', 'day_of_month', 'day_of_week', 'end_date', 'amount', 'narration', 'auto_post', 'is_active'];
    const updates = [], params = [];
    for (const f of fields) {
      if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push((f === 'auto_post' || f === 'is_active') ? (req.body[f] ? 1 : 0) : req.body[f]); }
    }
    if (updates.length > 0) { updates.push("updated_at = datetime('now')"); params.push(req.params.id); run(`UPDATE acc_recurring_templates SET ${updates.join(', ')} WHERE id = ?`, params); }
    res.json({ success: true, data: get('SELECT * FROM acc_recurring_templates WHERE id = ?', [req.params.id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/recurring/:id', (req, res) => {
  try {
    run('DELETE FROM acc_recurring_template_lines WHERE template_id = ?', [req.params.id]);
    run('DELETE FROM acc_recurring_templates WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/recurring/:id/pause', (req, res) => {
  try {
    const tmpl = get('SELECT * FROM acc_recurring_templates WHERE id = ?', [req.params.id]);
    if (!tmpl) return res.status(404).json({ success: false, error: 'Not found' });
    const newActive = tmpl.is_active ? 0 : 1;
    run("UPDATE acc_recurring_templates SET is_active = ?, updated_at = datetime('now') WHERE id = ?", [newActive, req.params.id]);
    res.json({ success: true, data: get('SELECT * FROM acc_recurring_templates WHERE id = ?', [req.params.id]) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Generate due recurring transactions
app.post('/api/recurring/run', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const due = query('SELECT * FROM acc_recurring_templates WHERE is_active = 1 AND next_run_date <= ? AND (end_date IS NULL OR end_date >= ?)', [today, today]);

    const generated = [];
    for (const tmpl of due) {
      const lines = query('SELECT * FROM acc_recurring_template_lines WHERE template_id = ? ORDER BY line_number', [tmpl.id]);
      if (lines.length === 0) continue;

      // Create voucher
      const voucherId = uuidv4();
      const prefix = { sales: 'SV', purchase: 'PV', payment: 'PMT', receipt: 'RCT', contra: 'CTR', journal: 'JV' }[tmpl.voucher_type] || 'VCH';
      const count = get('SELECT COUNT(*) as cnt FROM acc_vouchers WHERE voucher_type = ?', [tmpl.voucher_type]);
      const vNum = `${prefix}-${String((count?.cnt || 0) + 1).padStart(5, '0')}`;

      let totalAmt = 0;
      for (const l of lines) { if (l.dr_cr === 'dr') totalAmt += l.amount; }

      run(`INSERT INTO acc_vouchers (id, voucher_number, voucher_type, voucher_date, party_id, party_type, amount, narration, reference, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [voucherId, vNum, tmpl.voucher_type, tmpl.next_run_date, tmpl.party_id, tmpl.party_type, totalAmt, tmpl.narration, `Recurring: ${tmpl.name}`, tmpl.auto_post ? 'draft' : 'draft']);

      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        run(`INSERT INTO acc_voucher_lines (id, voucher_id, line_number, account_id, amount, dr_cr, description)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), voucherId, i + 1, l.account_id, l.amount, l.dr_cr, l.description || tmpl.narration]);
      }

      // Log
      run(`INSERT INTO acc_recurring_log (id, template_id, generated_voucher_id, generated_date, status)
        VALUES (?, ?, ?, ?, 'success')`,
        [uuidv4(), tmpl.id, voucherId, today]);

      // Calculate next run date
      const nextDate = calculateNextRunDate(tmpl.next_run_date, tmpl.frequency, tmpl.day_of_month, tmpl.day_of_week);
      run("UPDATE acc_recurring_templates SET next_run_date = ?, last_run_date = ?, run_count = run_count + 1, updated_at = datetime('now') WHERE id = ?",
        [nextDate, today, tmpl.id]);

      generated.push({ template_id: tmpl.id, template_name: tmpl.name, voucher_id: voucherId, voucher_number: vNum });
    }

    res.json({ success: true, data: { generated_count: generated.length, vouchers: generated } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

function calculateNextRunDate(currentDate, frequency, dayOfMonth, dayOfWeek) {
  const d = new Date(currentDate);
  switch (frequency) {
    case 'daily': d.setDate(d.getDate() + 1); break;
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      if (dayOfMonth) d.setDate(Math.min(dayOfMonth, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
      break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toISOString().split('T')[0];
}

app.get('/api/recurring/:id/history', (req, res) => {
  try {
    const logs = query('SELECT rl.*, v.voucher_number, v.status as voucher_status FROM acc_recurring_log rl LEFT JOIN acc_vouchers v ON rl.generated_voucher_id = v.id WHERE rl.template_id = ? ORDER BY rl.generated_date DESC', [req.params.id]);
    res.json({ success: true, data: logs });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =============================================================================
// LOOKUP HELPERS (for the UI)
// =============================================================================

app.get('/api/accounts', (req, res) => {
  try {
    const { category, search } = req.query;
    let sql = 'SELECT a.id, a.account_code, a.account_name, at.category FROM acc_accounts a LEFT JOIN acc_account_types at ON a.account_type_id = at.id WHERE a.is_active = 1';
    const params = [];
    if (category) { sql += ' AND at.category = ?'; params.push(category); }
    if (search) { sql += ' AND (a.account_name LIKE ? OR a.account_code LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    sql += ' ORDER BY a.account_code';
    res.json({ success: true, data: query(sql, params) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/parties', (req, res) => {
  try {
    const customers = query("SELECT id, code, name, 'customer' as party_type FROM acc_customers WHERE is_active = 1 ORDER BY name");
    const vendors = query("SELECT id, code, name, 'vendor' as party_type FROM acc_vendors WHERE is_active = 1 ORDER BY name");
    res.json({ success: true, data: [...customers, ...vendors] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// =============================================================================
// EXPORT
// =============================================================================

app.get('/api/vouchers/export/csv', (req, res) => {
  try {
    const { voucher_type, start_date, end_date } = req.query;
    let sql = 'SELECT voucher_number, voucher_type, voucher_date, amount, narration, reference, status FROM acc_vouchers WHERE 1=1';
    const params = [];
    if (voucher_type) { sql += ' AND voucher_type = ?'; params.push(voucher_type); }
    if (start_date) { sql += ' AND voucher_date >= ?'; params.push(start_date); }
    if (end_date) { sql += ' AND voucher_date <= ?'; params.push(end_date); }
    sql += ' ORDER BY voucher_date DESC';
    sendCSV(res, query(sql, params), [
      { key: 'voucher_number', label: 'Voucher #' }, { key: 'voucher_type', label: 'Type' },
      { key: 'voucher_date', label: 'Date' }, { key: 'amount', label: 'Amount' },
      { key: 'narration', label: 'Narration' }, { key: 'reference', label: 'Reference' },
      { key: 'status', label: 'Status' }
    ], 'vouchers.csv');
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/vouchers/export/pdf', (req, res) => {
  try {
    const data = query('SELECT voucher_number, voucher_type, voucher_date, amount, narration, status FROM acc_vouchers ORDER BY voucher_date DESC');
    sendLandscapePDF(res, (doc) => {
      addHeader(doc, 'Voucher Register', `Generated ${new Date().toLocaleDateString('en-IN')}`);
      addTable(doc, [
        { key: 'voucher_number', label: 'Voucher #', width: 1.5 },
        { key: 'voucher_type', label: 'Type', width: 1 },
        { key: 'voucher_date', label: 'Date', width: 1, formatter: fmtDate },
        { key: 'amount', label: 'Amount', width: 1.5, align: 'right', formatter: fmtCurrency },
        { key: 'narration', label: 'Narration', width: 3 },
        { key: 'status', label: 'Status', width: 0.8 }
      ], data);
    }, 'voucher_register.pdf');
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
  app.listen(PORT, () => console.log(`Voucher Entry (lite) on port ${PORT}`));
}).catch(err => { console.error('Failed to init DB:', err); process.exit(1); });

module.exports = app;
