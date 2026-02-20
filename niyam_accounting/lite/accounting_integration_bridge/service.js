/**
 * Integration Bridge - Lite Version (SQLite)
 * Port: 8860
 *
 * Receives events from retail/hospitality lite apps via HTTP and
 * auto-creates journal entries - mirrors docker NATS-based bridge.
 *
 * Supported event types:
 * - retail.billing.invoice.created
 * - retail.billing.payment.received
 * - retail.pos.sale.completed
 * - retail.inventory.purchase.received
 * - hospitality.billing.payment_received
 * - hospitality.front_office.checked_out
 * - restaurant.order.paid
 * - hospitality.room_service.charge
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8860;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// =============================================================================
// DEFAULT ACCOUNT MAPPINGS
// =============================================================================

const DEFAULT_ACCOUNT_MAPPINGS = {
  sales_revenue: 'SALES-001',
  service_revenue: 'SERVICE-001',
  room_revenue: 'ROOM-REV-001',
  fnb_revenue: 'FNB-REV-001',
  cash: 'CASH-001',
  bank: 'BANK-001',
  accounts_receivable: 'AR-001',
  guest_ledger: 'GUEST-AR-001',
  inventory: 'INV-001',
  accounts_payable: 'AP-001',
  gst_payable: 'GST-PAY-001',
  cost_of_goods_sold: 'COGS-001',
  purchase_expense: 'PURCH-001',
  fnb_cost: 'FNB-COST-001',
};

function getAccountByCode(code) {
  return get('SELECT id, account_code, account_name FROM acc_accounts WHERE account_code = ? AND is_active = 1', [code]);
}

function getAccountMapping(mappingKey) {
  const mapping = get('SELECT account_id FROM acc_account_mappings WHERE mapping_key = ?', [mappingKey]);
  if (mapping) return mapping.account_id;
  const defaultCode = DEFAULT_ACCOUNT_MAPPINGS[mappingKey];
  if (defaultCode) {
    const account = getAccountByCode(defaultCode);
    return account?.id || null;
  }
  return null;
}

// =============================================================================
// JOURNAL ENTRY CREATION
// =============================================================================

function createJournalEntry(entryData) {
  const count = get('SELECT COUNT(*) as cnt FROM acc_journal_entries');
  const entryNumber = `JE-${String((count?.cnt || 0) + 1).padStart(6, '0')}`;
  const jeId = uuidv4();

  run(`INSERT INTO acc_journal_entries (id, entry_number, entry_date, entry_type, description, reference_type, reference_id, source_system, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
    [jeId, entryNumber, entryData.date || new Date().toISOString().split('T')[0], entryData.entry_type || 'STD',
      entryData.description, entryData.reference_type, entryData.reference_id, entryData.source_system || 'integration_bridge']);

  let totalDebit = 0, totalCredit = 0;

  for (let i = 0; i < entryData.lines.length; i++) {
    const line = entryData.lines[i];
    run(`INSERT INTO acc_journal_lines (id, journal_entry_id, line_number, account_id, description, debit_amount, credit_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), jeId, i + 1, line.account_id, line.description || entryData.description, line.debit_amount || 0, line.credit_amount || 0]);
    totalDebit += (line.debit_amount || 0);
    totalCredit += (line.credit_amount || 0);
  }

  run('UPDATE acc_journal_entries SET total_debit = ?, total_credit = ? WHERE id = ?', [totalDebit, totalCredit, jeId]);

  // Auto-post if balanced
  if (Math.abs(totalDebit - totalCredit) < 0.01 && entryData.auto_post) {
    run("UPDATE acc_journal_entries SET status = 'posted', posted_at = datetime('now') WHERE id = ?", [jeId]);

    // Update ledger
    const lines = query('SELECT * FROM acc_journal_lines WHERE journal_entry_id = ?', [jeId]);
    const entryDate = entryData.date || new Date().toISOString().split('T')[0];
    for (const jl of lines) {
      const account = get('SELECT * FROM acc_accounts WHERE id = ?', [jl.account_id]);
      if (!account) continue;
      const newBal = account.current_balance + (jl.debit_amount || 0) - (jl.credit_amount || 0);
      run(`INSERT INTO acc_ledger_entries (id, account_id, journal_entry_id, entry_date, description, debit_amount, credit_amount, running_balance)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), jl.account_id, jeId, entryDate, jl.description, jl.debit_amount, jl.credit_amount, newBal]);
      run("UPDATE acc_accounts SET current_balance = ?, updated_at = datetime('now') WHERE id = ?", [newBal, jl.account_id]);
    }
  }

  console.log(`[Bridge] Created journal entry ${entryNumber} for ${entryData.reference_type}:${entryData.reference_id}`);
  return { id: jeId, entry_number: entryNumber };
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

function handleInvoiceCreated(payload) {
  const arAccount = getAccountMapping('accounts_receivable');
  const revenueAccount = getAccountMapping('sales_revenue');
  const gstAccount = getAccountMapping('gst_payable');
  if (!arAccount || !revenueAccount) return null;

  const lines = [
    { account_id: arAccount, debit_amount: payload.total_amount, credit_amount: 0, description: `Invoice ${payload.invoice_number}` },
    { account_id: revenueAccount, debit_amount: 0, credit_amount: payload.subtotal || payload.total_amount, description: `Sales - Invoice ${payload.invoice_number}` },
  ];
  if (gstAccount && (payload.tax_amount || 0) > 0) {
    lines.push({ account_id: gstAccount, debit_amount: 0, credit_amount: payload.tax_amount, description: `GST - Invoice ${payload.invoice_number}` });
  }

  return createJournalEntry({
    date: payload.invoice_date, entry_type: 'INV',
    description: `Sales Invoice ${payload.invoice_number} - ${payload.customer_name || 'Customer'}`,
    reference_type: 'invoice', reference_id: payload.invoice_id,
    source_system: 'billing_engine', lines, auto_post: true
  });
}

function handlePaymentReceived(payload) {
  const cashAccount = getAccountMapping(payload.payment_method === 'bank' ? 'bank' : 'cash');
  const arAccount = getAccountMapping('accounts_receivable');
  if (!cashAccount || !arAccount) return null;

  return createJournalEntry({
    date: payload.payment_date || new Date().toISOString().split('T')[0], entry_type: 'PMT',
    description: `Payment received for Invoice ${payload.invoice_number || payload.invoice_id}`,
    reference_type: 'payment', reference_id: payload.payment_id || payload.invoice_id,
    source_system: 'billing_engine',
    lines: [
      { account_id: cashAccount, debit_amount: payload.amount, credit_amount: 0, description: 'Payment received' },
      { account_id: arAccount, debit_amount: 0, credit_amount: payload.amount, description: 'Clear AR' },
    ], auto_post: true
  });
}

function handlePOSSaleCompleted(payload) {
  const cashAccount = getAccountMapping('cash');
  const revenueAccount = getAccountMapping('sales_revenue');
  if (!cashAccount || !revenueAccount) return null;

  const lines = [
    { account_id: cashAccount, debit_amount: payload.total_amount, credit_amount: 0, description: `POS Sale ${payload.transaction_id}` },
    { account_id: revenueAccount, debit_amount: 0, credit_amount: payload.total_amount, description: `Sales - POS ${payload.transaction_id}` },
  ];

  const cogsAccount = getAccountMapping('cost_of_goods_sold');
  const inventoryAccount = getAccountMapping('inventory');
  if (cogsAccount && inventoryAccount && (payload.cost_amount || 0) > 0) {
    lines.push(
      { account_id: cogsAccount, debit_amount: payload.cost_amount, credit_amount: 0, description: 'Cost of goods sold' },
      { account_id: inventoryAccount, debit_amount: 0, credit_amount: payload.cost_amount, description: 'Reduce inventory' }
    );
  }

  return createJournalEntry({
    date: payload.transaction_date || new Date().toISOString().split('T')[0], entry_type: 'POS',
    description: `POS Sale ${payload.transaction_id}`,
    reference_type: 'pos_transaction', reference_id: payload.transaction_id,
    source_system: 'point_of_sale', lines, auto_post: true
  });
}

function handleInventoryPurchase(payload) {
  const inventoryAccount = getAccountMapping('inventory');
  const apAccount = getAccountMapping('accounts_payable');
  if (!inventoryAccount || !apAccount) return null;

  return createJournalEntry({
    date: payload.purchase_date || new Date().toISOString().split('T')[0], entry_type: 'PUR',
    description: `Inventory Purchase ${payload.purchase_order_id} from ${payload.vendor_name || 'Vendor'}`,
    reference_type: 'purchase_order', reference_id: payload.purchase_order_id,
    source_system: 'inventory_management',
    lines: [
      { account_id: inventoryAccount, debit_amount: payload.total_amount, credit_amount: 0, description: 'Inventory received' },
      { account_id: apAccount, debit_amount: 0, credit_amount: payload.total_amount, description: 'Payable to vendor' },
    ], auto_post: true
  });
}

function handleHospitalityPayment(payload) {
  const cashAccount = getAccountMapping(payload.payment_method === 'card' ? 'bank' : 'cash');
  const creditAccount = getAccountMapping('accounts_receivable') || getAccountMapping('room_revenue');
  if (!cashAccount || !creditAccount) return null;

  return createJournalEntry({
    date: payload.payment_date || new Date().toISOString().split('T')[0], entry_type: 'PMT',
    description: `Guest Payment - Booking ${payload.booking_id}`,
    reference_type: 'hospitality_payment', reference_id: payload.booking_id,
    source_system: 'billing_payments',
    lines: [
      { account_id: cashAccount, debit_amount: payload.amount, credit_amount: 0, description: 'Payment received' },
      { account_id: creditAccount, debit_amount: 0, credit_amount: payload.amount, description: 'Guest payment' },
    ], auto_post: true
  });
}

function handleGuestCheckout(payload) {
  if (!payload.outstanding_balance || payload.outstanding_balance <= 0) return null;
  const arAccount = getAccountMapping('accounts_receivable');
  const revenueAccount = getAccountMapping('room_revenue');
  if (!arAccount || !revenueAccount) return null;

  return createJournalEntry({
    date: payload.checkout_date || new Date().toISOString().split('T')[0], entry_type: 'INV',
    description: `Guest Folio - Checkout ${payload.booking_id}`,
    reference_type: 'guest_folio', reference_id: payload.booking_id,
    source_system: 'front_office',
    lines: [
      { account_id: arAccount, debit_amount: payload.outstanding_balance, credit_amount: 0, description: 'Guest balance due' },
      { account_id: revenueAccount, debit_amount: 0, credit_amount: payload.outstanding_balance, description: 'Room revenue' },
    ], auto_post: true
  });
}

function handleRestaurantOrderPaid(payload) {
  const amount = payload.total || payload.amount || 0;
  if (amount <= 0) return null;

  let debitType = 'cash';
  if (payload.payment_method === 'card' || payload.payment_method === 'upi') debitType = 'bank';
  else if (payload.payment_method === 'room_charge') debitType = 'guest_ledger';

  const debitAccount = getAccountMapping(debitType);
  const fnbRevenueAccount = getAccountMapping('fnb_revenue');
  if (!debitAccount || !fnbRevenueAccount) return null;

  return createJournalEntry({
    date: new Date().toISOString().split('T')[0], entry_type: 'POS',
    description: `Restaurant Order ${payload.order_id} - Table ${payload.table_number || payload.table_id || 'N/A'}`,
    reference_type: 'restaurant_order', reference_id: payload.order_id,
    source_system: 'restaurant_pos',
    lines: [
      { account_id: debitAccount, debit_amount: amount, credit_amount: 0, description: `F&B Sale - ${payload.payment_method}` },
      { account_id: fnbRevenueAccount, debit_amount: 0, credit_amount: amount, description: 'F&B Revenue' },
    ], auto_post: true
  });
}

function handleRoomServiceCharge(payload) {
  const amount = payload.total || payload.amount || 0;
  if (amount <= 0) return null;
  const arAccount = getAccountMapping('guest_ledger');
  const fnbRevenueAccount = getAccountMapping('fnb_revenue');
  if (!arAccount || !fnbRevenueAccount) return null;

  return createJournalEntry({
    date: new Date().toISOString().split('T')[0], entry_type: 'CHG',
    description: `Room Service - Room ${payload.room_number || payload.room_id}`,
    reference_type: 'room_service', reference_id: payload.charge_id || payload.order_id,
    source_system: 'room_service_dining',
    lines: [
      { account_id: arAccount, debit_amount: amount, credit_amount: 0, description: 'Charge to guest folio' },
      { account_id: fnbRevenueAccount, debit_amount: 0, credit_amount: amount, description: 'Room Service Revenue' },
    ], auto_post: true
  });
}

const EVENT_HANDLERS = {
  'retail.billing.invoice.created': handleInvoiceCreated,
  'retail.billing.invoice.created.v1': handleInvoiceCreated,
  'retail.billing.payment.received': handlePaymentReceived,
  'retail.billing.payment.received.v1': handlePaymentReceived,
  'retail.pos.sale.completed': handlePOSSaleCompleted,
  'retail.pos.sale.completed.v1': handlePOSSaleCompleted,
  'retail.inventory.purchase.received': handleInventoryPurchase,
  'retail.inventory.purchase.received.v1': handleInventoryPurchase,
  'hospitality.billing.payment_received': handleHospitalityPayment,
  'hospitality.billing.payment_received.v1': handleHospitalityPayment,
  'hospitality.front_office.checked_out': handleGuestCheckout,
  'hospitality.front_office.checked_out.v1': handleGuestCheckout,
  'restaurant.order.paid': handleRestaurantOrderPaid,
  'restaurant.order.paid.v1': handleRestaurantOrderPaid,
  'hospitality.room_service.charge': handleRoomServiceCharge,
  'hospitality.room_service.charge.v1': handleRoomServiceCharge,
};

// =============================================================================
// REST API
// =============================================================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'accounting_integration_bridge', mode: 'lite' });
});

// Receive and process event (auto-creates JE if handler exists)
app.post('/api/events', (req, res) => {
  try {
    const { source, event_type, payload } = req.body;
    if (!source || !event_type) {
      return res.status(400).json({ success: false, error: 'source and event_type required' });
    }

    const id = uuidv4();
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);

    run('INSERT INTO acc_integration_events (id, source, event_type, payload) VALUES (?, ?, ?, ?)',
      [id, source, event_type, payloadStr]);

    // Try to process immediately
    const handler = EVENT_HANDLERS[event_type];
    if (handler && payload) {
      try {
        const payloadObj = typeof payload === 'string' ? JSON.parse(payload) : payload;
        const result = handler(payloadObj);
        if (result) {
          run("UPDATE acc_integration_events SET status = 'processed', processed_at = datetime('now'), journal_entry_id = ? WHERE id = ?", [result.id, id]);
          return res.status(201).json({ success: true, data: get('SELECT * FROM acc_integration_events WHERE id = ?', [id]), journal_entry: result });
        }
      } catch (processErr) {
        run("UPDATE acc_integration_events SET status = 'failed', error = ? WHERE id = ?", [processErr.message, id]);
        console.error(`[Bridge] Failed to process ${event_type}:`, processErr.message);
      }
    }

    res.status(201).json({ success: true, data: get('SELECT * FROM acc_integration_events WHERE id = ?', [id]) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// List events
app.get('/api/events', (req, res) => {
  try {
    const { source, status, limit } = req.query;
    let sql = 'SELECT * FROM acc_integration_events WHERE 1=1';
    const params = [];
    if (source) { sql += ' AND source = ?'; params.push(source); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY created_at DESC';
    if (limit) { sql += ' LIMIT ?'; params.push(parseInt(limit)); }
    res.json({ success: true, data: query(sql, params) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reprocess a pending/failed event
app.post('/api/events/:id/process', (req, res) => {
  try {
    const event = get('SELECT * FROM acc_integration_events WHERE id = ?', [req.params.id]);
    if (!event) return res.status(404).json({ success: false, error: 'Event not found' });

    const handler = EVENT_HANDLERS[event.event_type];
    if (!handler) {
      run("UPDATE acc_integration_events SET status = 'processed', processed_at = datetime('now') WHERE id = ?", [req.params.id]);
      return res.json({ success: true, data: get('SELECT * FROM acc_integration_events WHERE id = ?', [req.params.id]), message: 'No handler, marked as processed' });
    }

    try {
      const payload = event.payload ? JSON.parse(event.payload) : {};
      const result = handler(payload);
      if (result) {
        run("UPDATE acc_integration_events SET status = 'processed', processed_at = datetime('now'), journal_entry_id = ?, error = NULL WHERE id = ?", [result.id, req.params.id]);
        return res.json({ success: true, data: get('SELECT * FROM acc_integration_events WHERE id = ?', [req.params.id]), journal_entry: result });
      }
      run("UPDATE acc_integration_events SET status = 'processed', processed_at = datetime('now') WHERE id = ?", [req.params.id]);
    } catch (processErr) {
      run("UPDATE acc_integration_events SET status = 'failed', error = ? WHERE id = ?", [processErr.message, req.params.id]);
      return res.status(500).json({ success: false, error: processErr.message });
    }

    res.json({ success: true, data: get('SELECT * FROM acc_integration_events WHERE id = ?', [req.params.id]) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Mark event as failed
app.post('/api/events/:id/fail', (req, res) => {
  try {
    const { error } = req.body;
    run("UPDATE acc_integration_events SET status = 'failed', error = ? WHERE id = ?", [error || 'Unknown error', req.params.id]);
    res.json({ success: true, data: get('SELECT * FROM acc_integration_events WHERE id = ?', [req.params.id]) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Manual trigger endpoints (mirrors docker)
app.post('/api/trigger/invoice', (req, res) => {
  try {
    const result = handleInvoiceCreated(req.body);
    if (!result) return res.status(400).json({ success: false, error: 'Missing account mappings' });
    res.json({ success: true, message: 'Invoice journal entry created', journal_entry: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/trigger/payment', (req, res) => {
  try {
    const result = handlePaymentReceived(req.body);
    if (!result) return res.status(400).json({ success: false, error: 'Missing account mappings' });
    res.json({ success: true, message: 'Payment journal entry created', journal_entry: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/trigger/pos-sale', (req, res) => {
  try {
    const result = handlePOSSaleCompleted(req.body);
    if (!result) return res.status(400).json({ success: false, error: 'Missing account mappings' });
    res.json({ success: true, message: 'POS sale journal entry created', journal_entry: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Account mappings
app.get('/api/mappings', (req, res) => {
  try {
    const mappings = {};
    for (const key of Object.keys(DEFAULT_ACCOUNT_MAPPINGS)) {
      const accountId = getAccountMapping(key);
      let accountInfo = null;
      if (accountId) accountInfo = get('SELECT account_code, account_name FROM acc_accounts WHERE id = ?', [accountId]);
      mappings[key] = {
        default_code: DEFAULT_ACCOUNT_MAPPINGS[key],
        account_id: accountId,
        account_code: accountInfo?.account_code,
        account_name: accountInfo?.account_name
      };
    }
    res.json({ success: true, data: mappings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/mappings', (req, res) => {
  try {
    const { mapping_key, account_id } = req.body;
    if (!mapping_key || !account_id) return res.status(400).json({ success: false, error: 'mapping_key and account_id required' });
    const existing = get('SELECT id FROM acc_account_mappings WHERE mapping_key = ?', [mapping_key]);
    if (existing) {
      run('UPDATE acc_account_mappings SET account_id = ? WHERE mapping_key = ?', [account_id, mapping_key]);
    } else {
      run('INSERT INTO acc_account_mappings (id, mapping_key, account_id) VALUES (?, ?, ?)', [uuidv4(), mapping_key, account_id]);
    }
    res.json({ success: true, message: 'Mapping updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Integration stats
app.get('/api/stats', (req, res) => {
  try {
    const stats = get(`
      SELECT COUNT(*) as total_events,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'processed' THEN 1 ELSE 0 END) as processed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM acc_integration_events
    `);
    const sources = query('SELECT source, COUNT(*) as count FROM acc_integration_events GROUP BY source ORDER BY count DESC');
    res.json({ success: true, data: { ...stats, sources } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Integration Bridge (lite) on port ${PORT}`);
    console.log('[Bridge] HTTP event endpoints ready');
    console.log('[Bridge] Supported events:');
    console.log('  RETAIL: invoice.created, payment.received, pos.sale.completed, inventory.purchase.received');
    console.log('  HOSPITALITY: billing.payment_received, front_office.checked_out, restaurant.order.paid, room_service.charge');
  });
}).catch(err => { console.error('Failed to init DB:', err); process.exit(1); });

module.exports = app;
