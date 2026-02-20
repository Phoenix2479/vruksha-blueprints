const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');
const { notifyAccounting } = require('../shared/accounting-hook');

const app = express();
const PORT = process.env.PORT || 8812;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'billing_engine', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'billing_engine' }));

// List invoices
app.get('/invoices', (req, res) => {
  try {
    const { status, customer_id, from_date, to_date, limit = 200 } = req.query;
    let sql = 'SELECT * FROM invoices WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (customer_id) { sql += ' AND customer_id = ?'; params.push(customer_id); }
    if (from_date) { sql += ' AND issue_date >= ?'; params.push(from_date); }
    if (to_date) { sql += ' AND issue_date <= ?'; params.push(to_date); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    const invoices = query(sql, params);
    res.json({ success: true, invoices });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get invoice by ID
app.get('/invoices/:id', (req, res) => {
  try {
    const invoice = get('SELECT * FROM invoices WHERE id = ?', [req.params.id]);
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });
    const payments = query('SELECT * FROM payments WHERE invoice_id = ? ORDER BY created_at DESC', [req.params.id]);
    res.json({ success: true, invoice: { ...invoice, items: JSON.parse(invoice.items || '[]') }, payments });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Create invoice
app.post('/invoices', (req, res) => {
  try {
    const { customer_id, customer_name, items, currency = 'USD', due_days = 30, notes, terms, due_date } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Items array is required' });
    }
    const id = uuidv4();
    const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const issueDate = new Date().toISOString();
    const effectiveDueDate = due_date || new Date(Date.now() + due_days * 24 * 60 * 60 * 1000).toISOString();
    
    const subtotal = items.reduce((sum, item) => sum + (item.quantity || 1) * (item.unit_price || item.price || 0), 0);
    const tax = items.reduce((sum, item) => sum + ((item.quantity || 1) * (item.unit_price || item.price || 0) * ((item.tax_rate || 0) / 100)), 0);
    const total = subtotal + tax;
    
    run(`INSERT INTO invoices (id, invoice_number, customer_id, customer_name, items, subtotal, tax, discount, total, currency, status, issue_date, due_date, notes, terms) 
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'draft', ?, ?, ?, ?)`,
      [id, invoiceNumber, customer_id, customer_name, JSON.stringify(items), subtotal, tax, total, currency, issueDate, effectiveDueDate, notes, terms]);
    
    notifyAccounting('retail', 'retail.billing.invoice.created', { invoice_id: id, invoice_number: invoiceNumber, customer_id, total_amount: total, tax, items });
    res.json({ success: true, invoice: { id, invoice_number: invoiceNumber, subtotal, tax, total, status: 'draft' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Update invoice status
app.patch('/invoices/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });
    const paidDate = status === 'paid' ? new Date().toISOString() : null;
    run('UPDATE invoices SET status = ?, paid_date = ?, updated_at = ? WHERE id = ?', [status, paidDate, new Date().toISOString(), req.params.id]);
    res.json({ success: true, message: 'Status updated' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Record payment
app.post('/invoices/:id/payments', (req, res) => {
  try {
    const { amount, payment_method, transaction_ref, notes } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ success: false, error: 'Valid amount required' });
    
    const invoice = get('SELECT * FROM invoices WHERE id = ?', [req.params.id]);
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });
    
    const remaining = invoice.total - invoice.amount_paid;
    if (amount > remaining) return res.status(400).json({ success: false, error: 'Amount exceeds balance', remaining });
    
    const paymentId = uuidv4();
    const paymentNumber = `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    run(`INSERT INTO payments (id, payment_number, invoice_id, customer_id, amount, payment_method, transaction_ref, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [paymentId, paymentNumber, req.params.id, invoice.customer_id, amount, payment_method, transaction_ref, notes]);
    
    const newAmountPaid = invoice.amount_paid + amount;
    const newStatus = newAmountPaid >= invoice.total ? 'paid' : invoice.status;
    const paidDate = newStatus === 'paid' ? new Date().toISOString() : null;
    run('UPDATE invoices SET amount_paid = ?, status = ?, paid_date = ?, updated_at = ? WHERE id = ?',
      [newAmountPaid, newStatus, paidDate, new Date().toISOString(), req.params.id]);
    
    notifyAccounting('retail', 'retail.billing.payment.received', { payment_id: paymentId, invoice_id: req.params.id, amount, payment_method, customer_id: invoice.customer_id });
    res.json({ success: true, payment: { id: paymentId, payment_number: paymentNumber, amount }, new_balance: newAmountPaid });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get payments for invoice
app.get('/invoices/:id/payments', (req, res) => {
  try {
    const payments = query('SELECT * FROM payments WHERE invoice_id = ? ORDER BY created_at DESC', [req.params.id]);
    res.json({ success: true, payments });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Tax calculation
app.post('/tax/calculate', (req, res) => {
  try {
    const { items, location } = req.body;
    const taxRates = { 'US-CA': 0.0725, 'US-NY': 0.08875, 'US-TX': 0.0625, 'IN-KA': 0.18, 'IN-MH': 0.18, 'default': 0.10 };
    const taxRate = taxRates[location] || taxRates['default'];
    const itemsWithTax = items.map(item => {
      const subtotal = item.quantity * item.price;
      const tax = subtotal * taxRate;
      return { ...item, tax_rate: taxRate * 100, tax_amount: tax, total: subtotal + tax };
    });
    const subtotal = itemsWithTax.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    const totalTax = itemsWithTax.reduce((sum, item) => sum + item.tax_amount, 0);
    res.json({ success: true, items: itemsWithTax, summary: { subtotal, tax: totalTax, tax_rate: taxRate * 100, total: subtotal + totalTax, location } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Overdue invoices
app.get('/invoices/overdue', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const invoices = query("SELECT * FROM invoices WHERE status NOT IN ('paid', 'cancelled') AND date(due_date) < date(?) ORDER BY due_date ASC", [today]);
    res.json({ success: true, overdue_invoices: invoices, count: invoices.length });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Revenue summary
app.get('/revenue/summary', (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let sql = "SELECT SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END) as total_revenue, SUM(CASE WHEN status NOT IN ('paid', 'cancelled') THEN (total - amount_paid) ELSE 0 END) as pending_amount FROM invoices WHERE 1=1";
    const params = [];
    if (start_date) { sql += ' AND paid_date >= ?'; params.push(start_date); }
    if (end_date) { sql += ' AND paid_date <= ?'; params.push(end_date); }
    const result = get(sql, params);
    res.json({ success: true, revenue_summary: { total_revenue: result?.total_revenue || 0, pending_amount: result?.pending_amount || 0 } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Customer invoices
app.get('/customers/:customer_id/invoices', (req, res) => {
  try {
    const invoices = query('SELECT * FROM invoices WHERE customer_id = ? ORDER BY created_at DESC', [req.params.customer_id]);
    res.json({ success: true, invoices, count: invoices.length });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'billing_engine', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Billing Engine Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
