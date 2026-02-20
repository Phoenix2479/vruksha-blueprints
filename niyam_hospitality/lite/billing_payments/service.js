/**
 * Billing & Payments Service - Niyam Hospitality (Max Lite)
 * Handles invoices, payments, folios, and financial transactions
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');
const { notifyAccounting } = require('../shared/accounting-hook');

const app = express();
const PORT = process.env.PORT || 8914;
const SERVICE_NAME = 'billing_payments';

app.use(cors());
app.use(express.json());

// Serve UI
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) {
  app.use(express.static(uiPath));
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: SERVICE_NAME, mode: 'lite' });
});

// ============================================
// INVOICES
// ============================================

app.get('/api/invoices', (req, res) => {
  try {
    const { status, guest_id, from_date, to_date } = req.query;
    let sql = `
      SELECT i.*, g.first_name, g.last_name, g.email,
        r.confirmation_number, rm.room_number
      FROM invoices i
      LEFT JOIN guests g ON i.guest_id = g.id
      LEFT JOIN reservations r ON i.reservation_id = r.id
      LEFT JOIN rooms rm ON r.room_id = rm.id
      WHERE 1=1
    `;
    const params = [];
    
    if (status) {
      sql += ` AND i.status = ?`;
      params.push(status);
    }
    if (guest_id) {
      sql += ` AND i.guest_id = ?`;
      params.push(guest_id);
    }
    if (from_date) {
      sql += ` AND DATE(i.created_at) >= ?`;
      params.push(from_date);
    }
    if (to_date) {
      sql += ` AND DATE(i.created_at) <= ?`;
      params.push(to_date);
    }
    
    sql += ` ORDER BY i.created_at DESC`;
    
    const invoices = query(sql, params);
    res.json({ success: true, invoices });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/invoices/:id', (req, res) => {
  try {
    const invoice = get(`
      SELECT i.*, g.first_name, g.last_name, g.email, g.phone, g.address,
        r.confirmation_number, r.check_in_date, r.check_out_date,
        rm.room_number, rt.name as room_type
      FROM invoices i
      LEFT JOIN guests g ON i.guest_id = g.id
      LEFT JOIN reservations r ON i.reservation_id = r.id
      LEFT JOIN rooms rm ON r.room_id = rm.id
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      WHERE i.id = ?
    `, [req.params.id]);
    
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    
    // Parse items
    invoice.items = JSON.parse(invoice.items || '[]');
    
    // Get payments
    const payments = query(`SELECT * FROM payments WHERE invoice_id = ? ORDER BY created_at DESC`, [req.params.id]);
    
    res.json({ success: true, invoice, payments });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/invoices', (req, res) => {
  try {
    const { reservation_id, guest_id, items, due_date, notes } = req.body;
    const id = generateId();
    const invoice_number = `INV-${Date.now().toString(36).toUpperCase()}`;
    
    // Calculate totals
    const parsedItems = items || [];
    const subtotal = parsedItems.reduce((sum, item) => sum + (item.amount || 0), 0);
    const tax = subtotal * 0.18; // 18% GST
    const total = subtotal + tax;
    
    run(`
      INSERT INTO invoices (
        id, reservation_id, guest_id, invoice_number, items,
        subtotal, tax, total, status, due_date, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `, [id, reservation_id, guest_id, invoice_number, JSON.stringify(parsedItems), subtotal, tax, total, due_date, notes, timestamp()]);
    
    res.json({ success: true, invoice: { id, invoice_number, total } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/invoices/from-folio/:reservation_id', (req, res) => {
  try {
    const reservation_id = req.params.reservation_id;
    
    // Get reservation details
    const reservation = get(`
      SELECT r.*, g.id as guest_id, g.first_name, g.last_name
      FROM reservations r
      LEFT JOIN guests g ON r.guest_id = g.id
      WHERE r.id = ?
    `, [reservation_id]);
    
    if (!reservation) {
      return res.status(404).json({ success: false, error: 'Reservation not found' });
    }
    
    // Get folio items
    const folioItems = query(`SELECT * FROM guest_folios WHERE reservation_id = ?`, [reservation_id]);
    
    // Create invoice items from folio
    const items = folioItems.map(f => ({
      description: f.description,
      department: f.department,
      quantity: f.quantity,
      unit_price: f.unit_price,
      amount: f.total_amount
    }));
    
    // Add room charges if not already in folio
    const roomChargeExists = folioItems.some(f => f.item_type === 'room');
    if (!roomChargeExists && reservation.room_rate > 0) {
      const nights = Math.ceil((new Date(reservation.check_out_date) - new Date(reservation.check_in_date)) / (1000 * 60 * 60 * 24));
      items.unshift({
        description: `Room Charges (${nights} nights)`,
        department: 'rooms',
        quantity: nights,
        unit_price: reservation.room_rate,
        amount: nights * reservation.room_rate
      });
    }
    
    const id = generateId();
    const invoice_number = `INV-${Date.now().toString(36).toUpperCase()}`;
    const subtotal = items.reduce((sum, item) => sum + (item.amount || 0), 0);
    const tax = subtotal * 0.18;
    const total = subtotal + tax;
    
    run(`
      INSERT INTO invoices (
        id, reservation_id, guest_id, invoice_number, items,
        subtotal, tax, total, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `, [id, reservation_id, reservation.guest_id, invoice_number, JSON.stringify(items), subtotal, tax, total, timestamp()]);
    
    res.json({ success: true, invoice: { id, invoice_number, total } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// PAYMENTS
// ============================================

app.get('/api/payments', (req, res) => {
  try {
    const { from_date, to_date, payment_method } = req.query;
    let sql = `
      SELECT p.*, g.first_name, g.last_name, i.invoice_number
      FROM payments p
      LEFT JOIN guests g ON p.guest_id = g.id
      LEFT JOIN invoices i ON p.invoice_id = i.id
      WHERE 1=1
    `;
    const params = [];
    
    if (from_date) {
      sql += ` AND DATE(p.created_at) >= ?`;
      params.push(from_date);
    }
    if (to_date) {
      sql += ` AND DATE(p.created_at) <= ?`;
      params.push(to_date);
    }
    if (payment_method) {
      sql += ` AND p.payment_method = ?`;
      params.push(payment_method);
    }
    
    sql += ` ORDER BY p.created_at DESC`;
    
    const payments = query(sql, params);
    res.json({ success: true, payments });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/payments', (req, res) => {
  try {
    const { invoice_id, reservation_id, guest_id, amount, payment_method, reference_number, notes } = req.body;
    const id = generateId();
    
    run(`
      INSERT INTO payments (
        id, invoice_id, reservation_id, guest_id, amount, 
        payment_method, reference_number, status, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)
    `, [id, invoice_id, reservation_id, guest_id, amount, payment_method, reference_number, notes, timestamp()]);
    
    // Update invoice status if fully paid
    if (invoice_id) {
      const invoice = get(`SELECT total FROM invoices WHERE id = ?`, [invoice_id]);
      const totalPaid = get(`SELECT SUM(amount) as paid FROM payments WHERE invoice_id = ?`, [invoice_id]);
      
      if (totalPaid?.paid >= invoice?.total) {
        run(`UPDATE invoices SET status = 'paid', paid_at = ? WHERE id = ?`, [timestamp(), invoice_id]);
      } else {
        run(`UPDATE invoices SET status = 'partial' WHERE id = ?`, [invoice_id]);
      }
    }
    
    // Update reservation balance if applicable
    if (reservation_id) {
      run(`
        UPDATE reservations SET balance_due = balance_due - ?, updated_at = ? WHERE id = ?
      `, [amount, timestamp(), reservation_id]);
    }
    
    notifyAccounting('hospitality', 'hospitality.billing.payment_received', { payment_id: id, invoice_id, reservation_id, guest_id, amount, payment_method });
    res.json({ success: true, payment: { id, amount } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/payments/:id/refund', (req, res) => {
  try {
    const { amount, reason } = req.body;
    
    const original = get(`SELECT * FROM payments WHERE id = ?`, [req.params.id]);
    if (!original) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }
    
    const refundAmount = amount || original.amount;
    const id = generateId();
    
    // Create refund record (negative payment)
    run(`
      INSERT INTO payments (
        id, invoice_id, reservation_id, guest_id, amount, 
        payment_method, status, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'refund', ?, ?)
    `, [id, original.invoice_id, original.reservation_id, original.guest_id, -refundAmount, original.payment_method, reason, timestamp()]);
    
    // Update original payment status
    run(`UPDATE payments SET status = 'refunded', notes = COALESCE(notes || ' | ', '') || ? WHERE id = ?`, 
      [`Refunded: ${reason}`, req.params.id]);
    
    // Update invoice status
    if (original.invoice_id) {
      run(`UPDATE invoices SET status = 'refunded' WHERE id = ?`, [original.invoice_id]);
    }
    
    res.json({ success: true, refund: { id, amount: refundAmount } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// FOLIO MANAGEMENT
// ============================================

app.get('/api/folios/:reservation_id', (req, res) => {
  try {
    const items = query(`
      SELECT * FROM guest_folios WHERE reservation_id = ? ORDER BY posted_at DESC
    `, [req.params.reservation_id]);
    
    const summary = get(`
      SELECT 
        SUM(CASE WHEN total_amount > 0 THEN total_amount ELSE 0 END) as charges,
        SUM(CASE WHEN total_amount < 0 THEN ABS(total_amount) ELSE 0 END) as credits,
        SUM(total_amount) as net_total
      FROM guest_folios WHERE reservation_id = ?
    `, [req.params.reservation_id]);
    
    const payments = query(`
      SELECT * FROM payments WHERE reservation_id = ? ORDER BY created_at DESC
    `, [req.params.reservation_id]);
    
    const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    
    res.json({ 
      success: true, 
      items, 
      summary: {
        ...summary,
        total_paid: totalPaid,
        balance: (summary?.net_total || 0) - totalPaid
      },
      payments 
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/folios/:reservation_id/charge', (req, res) => {
  try {
    const { item_type, description, quantity, unit_price, department } = req.body;
    const id = generateId();
    const total_amount = (quantity || 1) * (unit_price || 0);
    
    // Get guest_id from reservation
    const reservation = get(`SELECT guest_id FROM reservations WHERE id = ?`, [req.params.reservation_id]);
    
    run(`
      INSERT INTO guest_folios (
        id, reservation_id, guest_id, item_type, description,
        quantity, unit_price, total_amount, department, posted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, req.params.reservation_id, reservation?.guest_id, item_type, description, quantity || 1, unit_price || 0, total_amount, department, timestamp()]);
    
    // Update reservation balance
    run(`
      UPDATE reservations SET balance_due = balance_due + ?, updated_at = ? WHERE id = ?
    `, [total_amount, timestamp(), req.params.reservation_id]);
    
    res.json({ success: true, charge: { id, total_amount } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/folios/:reservation_id/credit', (req, res) => {
  try {
    const { description, amount, reason } = req.body;
    const id = generateId();
    const total_amount = -(amount || 0); // Negative for credit
    
    const reservation = get(`SELECT guest_id FROM reservations WHERE id = ?`, [req.params.reservation_id]);
    
    run(`
      INSERT INTO guest_folios (
        id, reservation_id, guest_id, item_type, description,
        quantity, unit_price, total_amount, department, posted_at
      ) VALUES (?, ?, ?, 'credit', ?, 1, ?, ?, 'adjustments', ?)
    `, [id, req.params.reservation_id, reservation?.guest_id, `${description} (${reason})`, total_amount, total_amount, timestamp()]);
    
    // Update reservation balance
    run(`
      UPDATE reservations SET balance_due = balance_due + ?, updated_at = ? WHERE id = ?
    `, [total_amount, timestamp(), req.params.reservation_id]);
    
    res.json({ success: true, credit: { id, amount } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// DAILY REPORTS
// ============================================

app.get('/api/reports/daily', (req, res) => {
  try {
    const { date } = req.query;
    const reportDate = date || new Date().toISOString().split('T')[0];
    
    // Revenue by department
    const departmentRevenue = query(`
      SELECT department, SUM(total_amount) as revenue, COUNT(*) as transactions
      FROM guest_folios
      WHERE DATE(posted_at) = ? AND total_amount > 0
      GROUP BY department
    `, [reportDate]);
    
    // Payments by method
    const paymentsByMethod = query(`
      SELECT payment_method, SUM(amount) as total, COUNT(*) as count
      FROM payments
      WHERE DATE(created_at) = ? AND status = 'completed'
      GROUP BY payment_method
    `, [reportDate]);
    
    // Totals
    const totals = get(`
      SELECT 
        (SELECT SUM(total_amount) FROM guest_folios WHERE DATE(posted_at) = ? AND total_amount > 0) as total_charges,
        (SELECT SUM(amount) FROM payments WHERE DATE(created_at) = ? AND status = 'completed') as total_payments
    `, [reportDate, reportDate]);
    
    res.json({
      success: true,
      date: reportDate,
      department_revenue: departmentRevenue,
      payments_by_method: paymentsByMethod,
      totals
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// DASHBOARD STATS
// ============================================

app.get('/api/dashboard/stats', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const pendingInvoices = get(`SELECT COUNT(*) as count, SUM(total) as amount FROM invoices WHERE status = 'pending'`);
    const todayPayments = get(`SELECT COUNT(*) as count, SUM(amount) as amount FROM payments WHERE DATE(created_at) = ? AND status = 'completed'`, [today]);
    const todayCharges = get(`SELECT SUM(total_amount) as amount FROM guest_folios WHERE DATE(posted_at) = ? AND total_amount > 0`, [today]);
    const outstandingBalance = get(`SELECT SUM(balance_due) as amount FROM reservations WHERE balance_due > 0 AND status = 'checked_in'`);
    
    res.json({
      success: true,
      stats: {
        pending_invoices: pendingInvoices?.count || 0,
        pending_amount: pendingInvoices?.amount || 0,
        today_payments: todayPayments?.count || 0,
        today_payment_amount: todayPayments?.amount || 0,
        today_charges: todayCharges?.amount || 0,
        outstanding_balance: outstandingBalance?.amount || 0
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({ service: SERVICE_NAME, status: 'running', mode: 'lite' });
  }
});

// Start server
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[${SERVICE_NAME}] Lite service running on http://localhost:${PORT}`);
    });
  })
  .catch(e => {
    console.error(`[${SERVICE_NAME}] Failed to start:`, e);
    process.exit(1);
  });
