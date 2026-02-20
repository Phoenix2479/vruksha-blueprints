// Bridge Service - NATS subscriptions, event handlers, journal entry creation
// This service contains ALL business logic for the integration bridge

const { connect, StringCodec } = require('nats');

let db;
try {
  db = require('../../../../../db/postgres');
} catch (_) {
  db = require('@vruksha/platform/db/postgres');
}

const { query, getClient } = db;

const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';
const RETAIL_NATS_URL = process.env.RETAIL_NATS_URL || null;
const ECOMMERCE_NATS_URL = process.env.ECOMMERCE_NATS_URL || null;
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

let natsConnection = null;
let retailNatsConnection = null;
let ecommerceNatsConnection = null;
const sc = StringCodec();

// ============================================
// DEFAULT ACCOUNT MAPPINGS
// These should be configurable per tenant
// ============================================

const DEFAULT_ACCOUNT_MAPPINGS = {
  // Revenue accounts - Retail
  sales_revenue: 'SALES-001',
  service_revenue: 'SERVICE-001',

  // Revenue accounts - Hospitality
  room_revenue: 'ROOM-REV-001',
  fnb_revenue: 'FNB-REV-001',
  spa_revenue: 'SPA-REV-001',
  misc_revenue: 'MISC-REV-001',

  // Asset accounts
  cash: 'CASH-001',
  bank: 'BANK-001',
  accounts_receivable: 'AR-001',
  guest_ledger: 'GUEST-AR-001',
  inventory: 'INV-001',

  // Liability accounts
  accounts_payable: 'AP-001',
  gst_payable: 'GST-PAY-001',
  tds_payable: 'TDS-PAY-001',
  advance_deposits: 'ADV-DEP-001',

  // Expense accounts
  cost_of_goods_sold: 'COGS-001',
  purchase_expense: 'PURCH-001',
  fnb_cost: 'FNB-COST-001',

  // Ecommerce accounts
  ecommerce_revenue: 'ECOM-REV-001',
  ecommerce_receivable: 'ECOM-AR-001',
  ecommerce_refunds: 'ECOM-REF-001',
  ecommerce_cogs: 'ECOM-COGS-001',
};

// ============================================
// ACCOUNT LOOKUP HELPERS
// ============================================

async function getAccountByCode(tenantId, code) {
  const result = await query(
    'SELECT id, account_code, account_name FROM acc_accounts WHERE tenant_id = $1 AND account_code = $2 AND is_active = true',
    [tenantId, code]
  );
  return result.rows[0] || null;
}

async function getAccountMapping(tenantId, mappingKey) {
  // First try tenant-specific mapping
  const mapping = await query(
    'SELECT account_id FROM acc_account_mappings WHERE tenant_id = $1 AND mapping_key = $2',
    [tenantId, mappingKey]
  );

  if (mapping.rows[0]) {
    return mapping.rows[0].account_id;
  }

  // Fall back to default code
  const defaultCode = DEFAULT_ACCOUNT_MAPPINGS[mappingKey];
  if (defaultCode) {
    const account = await getAccountByCode(tenantId, defaultCode);
    return account?.id || null;
  }

  return null;
}

// ============================================
// JOURNAL ENTRY CREATION
// ============================================

async function createJournalEntry(tenantId, entryData) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Generate entry number
    const seqResult = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(entry_number FROM 4) AS INTEGER)), 0) + 1 as next_num
       FROM acc_journal_entries WHERE tenant_id = $1 AND entry_number LIKE 'JE-%'`,
      [tenantId]
    );
    const entryNumber = `JE-${String(seqResult.rows[0].next_num).padStart(6, '0')}`;

    // Create journal entry header
    const entryResult = await client.query(`
      INSERT INTO acc_journal_entries (
        tenant_id, entry_number, entry_date, entry_type, description,
        reference_type, reference_id, source_system, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft')
      RETURNING *
    `, [
      tenantId,
      entryNumber,
      entryData.date || new Date().toISOString().split('T')[0],
      entryData.entry_type || 'STD',
      entryData.description,
      entryData.reference_type,
      entryData.reference_id,
      entryData.source_system || 'integration_bridge'
    ]);

    const entry = entryResult.rows[0];
    let totalDebit = 0;
    let totalCredit = 0;

    // Create journal entry lines
    for (let i = 0; i < entryData.lines.length; i++) {
      const line = entryData.lines[i];
      await client.query(`
        INSERT INTO acc_journal_entry_lines (
          tenant_id, journal_entry_id, line_number, account_id,
          description, debit_amount, credit_amount
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        tenantId,
        entry.id,
        i + 1,
        line.account_id,
        line.description || entryData.description,
        line.debit_amount || 0,
        line.credit_amount || 0
      ]);

      totalDebit += parseFloat(line.debit_amount || 0);
      totalCredit += parseFloat(line.credit_amount || 0);
    }

    // Update totals
    await client.query(`
      UPDATE acc_journal_entries
      SET total_debit = $2, total_credit = $3, is_balanced = $4
      WHERE id = $1
    `, [entry.id, totalDebit, totalCredit, Math.abs(totalDebit - totalCredit) < 0.01]);

    // Auto-post if balanced and configured
    if (Math.abs(totalDebit - totalCredit) < 0.01 && entryData.auto_post) {
      await client.query(`
        UPDATE acc_journal_entries SET status = 'posted', posted_at = NOW() WHERE id = $1
      `, [entry.id]);

      // Update account balances
      for (const line of entryData.lines) {
        const netAmount = (line.debit_amount || 0) - (line.credit_amount || 0);
        await client.query(`
          UPDATE acc_accounts SET current_balance = current_balance + $2 WHERE id = $1
        `, [line.account_id, netAmount]);
      }
    }

    await client.query('COMMIT');

    console.log(`[Bridge] Created journal entry ${entryNumber} for ${entryData.reference_type}:${entryData.reference_id}`);
    return entry;

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Bridge] Failed to create journal entry:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// ============================================
// EVENT HANDLERS
// ============================================

async function handleInvoiceCreated(envelope) {
  const { tenantId, payload } = envelope;
  const tid = tenantId || DEFAULT_TENANT_ID;

  console.log(`[Bridge] Processing invoice.created: ${payload.invoice_number}`);

  try {
    const arAccount = await getAccountMapping(tid, 'accounts_receivable');
    const revenueAccount = await getAccountMapping(tid, 'sales_revenue');
    const gstAccount = await getAccountMapping(tid, 'gst_payable');

    if (!arAccount || !revenueAccount) {
      console.warn('[Bridge] Missing account mappings for invoice');
      return;
    }

    const lines = [
      { account_id: arAccount, debit_amount: payload.total_amount, credit_amount: 0, description: `Invoice ${payload.invoice_number}` },
      { account_id: revenueAccount, debit_amount: 0, credit_amount: payload.subtotal || payload.total_amount, description: `Sales - Invoice ${payload.invoice_number}` },
    ];

    if (gstAccount && payload.tax_amount > 0) {
      lines.push({ account_id: gstAccount, debit_amount: 0, credit_amount: payload.tax_amount, description: `GST - Invoice ${payload.invoice_number}` });
    }

    await createJournalEntry(tid, {
      date: payload.invoice_date,
      entry_type: 'INV',
      description: `Sales Invoice ${payload.invoice_number} - ${payload.customer_name || 'Customer'}`,
      reference_type: 'invoice',
      reference_id: payload.invoice_id,
      source_system: 'billing_engine',
      lines,
      auto_post: true
    });

  } catch (error) {
    console.error('[Bridge] Failed to process invoice:', error.message);
  }
}

async function handlePaymentReceived(envelope) {
  const { tenantId, payload } = envelope;
  const tid = tenantId || DEFAULT_TENANT_ID;

  console.log(`[Bridge] Processing payment.received: ${payload.amount}`);

  try {
    const cashAccount = await getAccountMapping(tid, payload.payment_method === 'bank' ? 'bank' : 'cash');
    const arAccount = await getAccountMapping(tid, 'accounts_receivable');

    if (!cashAccount || !arAccount) {
      console.warn('[Bridge] Missing account mappings for payment');
      return;
    }

    await createJournalEntry(tid, {
      date: payload.payment_date || new Date().toISOString().split('T')[0],
      entry_type: 'PMT',
      description: `Payment received for Invoice ${payload.invoice_number || payload.invoice_id}`,
      reference_type: 'payment',
      reference_id: payload.payment_id || payload.invoice_id,
      source_system: 'billing_engine',
      lines: [
        { account_id: cashAccount, debit_amount: payload.amount, credit_amount: 0, description: 'Payment received' },
        { account_id: arAccount, debit_amount: 0, credit_amount: payload.amount, description: 'Clear AR' },
      ],
      auto_post: true
    });

  } catch (error) {
    console.error('[Bridge] Failed to process payment:', error.message);
  }
}

async function handlePOSSaleCompleted(envelope) {
  const { tenantId, payload } = envelope;
  const tid = tenantId || DEFAULT_TENANT_ID;

  console.log(`[Bridge] Processing POS sale: ${payload.transaction_id}`);

  try {
    const cashAccount = await getAccountMapping(tid, 'cash');
    const revenueAccount = await getAccountMapping(tid, 'sales_revenue');
    const cogsAccount = await getAccountMapping(tid, 'cost_of_goods_sold');
    const inventoryAccount = await getAccountMapping(tid, 'inventory');

    if (!cashAccount || !revenueAccount) {
      console.warn('[Bridge] Missing account mappings for POS sale');
      return;
    }

    const lines = [
      { account_id: cashAccount, debit_amount: payload.total_amount, credit_amount: 0, description: `POS Sale ${payload.transaction_id}` },
      { account_id: revenueAccount, debit_amount: 0, credit_amount: payload.total_amount, description: `Sales - POS ${payload.transaction_id}` },
    ];

    if (cogsAccount && inventoryAccount && payload.cost_amount > 0) {
      lines.push(
        { account_id: cogsAccount, debit_amount: payload.cost_amount, credit_amount: 0, description: 'Cost of goods sold' },
        { account_id: inventoryAccount, debit_amount: 0, credit_amount: payload.cost_amount, description: 'Reduce inventory' }
      );
    }

    await createJournalEntry(tid, {
      date: payload.transaction_date || new Date().toISOString().split('T')[0],
      entry_type: 'POS',
      description: `POS Sale ${payload.transaction_id}`,
      reference_type: 'pos_transaction',
      reference_id: payload.transaction_id,
      source_system: 'point_of_sale',
      lines,
      auto_post: true
    });

  } catch (error) {
    console.error('[Bridge] Failed to process POS sale:', error.message);
  }
}

async function handleInventoryPurchase(envelope) {
  const { tenantId, payload } = envelope;
  const tid = tenantId || DEFAULT_TENANT_ID;

  console.log(`[Bridge] Processing inventory purchase: ${payload.purchase_order_id}`);

  try {
    const inventoryAccount = await getAccountMapping(tid, 'inventory');
    const apAccount = await getAccountMapping(tid, 'accounts_payable');

    if (!inventoryAccount || !apAccount) {
      console.warn('[Bridge] Missing account mappings for purchase');
      return;
    }

    await createJournalEntry(tid, {
      date: payload.purchase_date || new Date().toISOString().split('T')[0],
      entry_type: 'PUR',
      description: `Inventory Purchase ${payload.purchase_order_id} from ${payload.vendor_name || 'Vendor'}`,
      reference_type: 'purchase_order',
      reference_id: payload.purchase_order_id,
      source_system: 'inventory_management',
      lines: [
        { account_id: inventoryAccount, debit_amount: payload.total_amount, credit_amount: 0, description: 'Inventory received' },
        { account_id: apAccount, debit_amount: 0, credit_amount: payload.total_amount, description: 'Payable to vendor' },
      ],
      auto_post: true
    });

  } catch (error) {
    console.error('[Bridge] Failed to process purchase:', error.message);
  }
}

// ============================================
// HOSPITALITY EVENT HANDLERS
// ============================================

async function handleHospitalityPayment(envelope) {
  const { tenantId, payload } = envelope;
  const tid = tenantId || DEFAULT_TENANT_ID;

  console.log(`[Bridge] Processing hospitality payment: booking ${payload.booking_id}`);

  try {
    const cashAccount = await getAccountMapping(tid, payload.payment_method === 'card' ? 'bank' : 'cash');
    const revenueAccount = await getAccountMapping(tid, 'room_revenue');
    const arAccount = await getAccountMapping(tid, 'accounts_receivable');

    if (!cashAccount) {
      console.warn('[Bridge] Missing cash/bank account mapping');
      return;
    }

    const creditAccount = arAccount || revenueAccount;
    if (!creditAccount) {
      console.warn('[Bridge] Missing revenue/AR account mapping');
      return;
    }

    await createJournalEntry(tid, {
      date: payload.payment_date || new Date().toISOString().split('T')[0],
      entry_type: 'PMT',
      description: `Guest Payment - Booking ${payload.booking_id}`,
      reference_type: 'hospitality_payment',
      reference_id: payload.booking_id,
      source_system: 'billing_payments',
      lines: [
        { account_id: cashAccount, debit_amount: payload.amount, credit_amount: 0, description: 'Payment received' },
        { account_id: creditAccount, debit_amount: 0, credit_amount: payload.amount, description: 'Guest payment' },
      ],
      auto_post: true
    });

  } catch (error) {
    console.error('[Bridge] Failed to process hospitality payment:', error.message);
  }
}

async function handleGuestCheckout(envelope) {
  const { tenantId, payload } = envelope;
  const tid = tenantId || DEFAULT_TENANT_ID;

  console.log(`[Bridge] Processing checkout: booking ${payload.booking_id}`);

  try {
    if (payload.outstanding_balance && payload.outstanding_balance > 0) {
      const arAccount = await getAccountMapping(tid, 'accounts_receivable');
      const revenueAccount = await getAccountMapping(tid, 'room_revenue');

      if (arAccount && revenueAccount) {
        await createJournalEntry(tid, {
          date: payload.checkout_date || new Date().toISOString().split('T')[0],
          entry_type: 'INV',
          description: `Guest Folio - Checkout ${payload.booking_id}`,
          reference_type: 'guest_folio',
          reference_id: payload.booking_id,
          source_system: 'front_office',
          lines: [
            { account_id: arAccount, debit_amount: payload.outstanding_balance, credit_amount: 0, description: 'Guest balance due' },
            { account_id: revenueAccount, debit_amount: 0, credit_amount: payload.outstanding_balance, description: 'Room revenue' },
          ],
          auto_post: true
        });
      }
    }

  } catch (error) {
    console.error('[Bridge] Failed to process checkout:', error.message);
  }
}

async function handleRestaurantOrder(envelope) {
  const { tenantId, payload } = envelope;
  console.log(`[Bridge] Restaurant order created: ${payload.order_id}, total: ${payload.total || 0}`);
}

async function handleRestaurantOrderPaid(envelope) {
  const { tenantId, payload } = envelope;
  const tid = tenantId || DEFAULT_TENANT_ID;

  console.log(`[Bridge] Processing restaurant payment: order ${payload.order_id}`);

  try {
    const amount = payload.total || payload.amount || 0;
    if (amount <= 0) return;

    let debitAccountType = 'cash';
    if (payload.payment_method === 'card' || payload.payment_method === 'upi') {
      debitAccountType = 'bank';
    } else if (payload.payment_method === 'room_charge') {
      debitAccountType = 'guest_ledger';
    }

    const debitAccount = await getAccountMapping(tid, debitAccountType);
    const fnbRevenueAccount = await getAccountMapping(tid, 'fnb_revenue');

    if (!debitAccount || !fnbRevenueAccount) {
      console.warn('[Bridge] Missing F&B account mappings');
      return;
    }

    const lines = [
      { account_id: debitAccount, debit_amount: amount, credit_amount: 0, description: `F&B Sale - ${payload.payment_method}` },
      { account_id: fnbRevenueAccount, debit_amount: 0, credit_amount: amount, description: 'F&B Revenue' },
    ];

    await createJournalEntry(tid, {
      date: new Date().toISOString().split('T')[0],
      entry_type: 'POS',
      description: `Restaurant Order ${payload.order_id} - Table ${payload.table_number || payload.table_id || 'N/A'}`,
      reference_type: 'restaurant_order',
      reference_id: payload.order_id,
      source_system: 'restaurant_pos',
      lines,
      auto_post: true
    });

  } catch (error) {
    console.error('[Bridge] Failed to process restaurant payment:', error.message);
  }
}

async function handleRoomServiceCharge(envelope) {
  const { tenantId, payload } = envelope;
  const tid = tenantId || DEFAULT_TENANT_ID;

  console.log(`[Bridge] Processing room service charge: ${payload.charge_id || payload.order_id}`);

  try {
    const arAccount = await getAccountMapping(tid, 'guest_ledger');
    const fnbRevenueAccount = await getAccountMapping(tid, 'fnb_revenue');

    if (!arAccount || !fnbRevenueAccount) {
      console.warn('[Bridge] Missing room service account mappings');
      return;
    }

    const amount = payload.total || payload.amount || 0;
    if (amount <= 0) return;

    await createJournalEntry(tid, {
      date: new Date().toISOString().split('T')[0],
      entry_type: 'CHG',
      description: `Room Service - Room ${payload.room_number || payload.room_id}`,
      reference_type: 'room_service',
      reference_id: payload.charge_id || payload.order_id,
      source_system: 'room_service_dining',
      lines: [
        { account_id: arAccount, debit_amount: amount, credit_amount: 0, description: 'Charge to guest folio' },
        { account_id: fnbRevenueAccount, debit_amount: 0, credit_amount: amount, description: 'Room Service Revenue' },
      ],
      auto_post: true
    });

  } catch (error) {
    console.error('[Bridge] Failed to process room service:', error.message);
  }
}

// ============================================
// ECOMMERCE EVENT HANDLERS
// ============================================

async function handleEcommerceOrderCreated(envelope) {
  const { tenantId, payload } = envelope;
  const tid = tenantId || payload?.tenant_id || DEFAULT_TENANT_ID;

  console.log(`[Bridge] Processing ecommerce order.created: ${payload.order_id}`);

  try {
    const arAccount = await getAccountMapping(tid, 'ecommerce_receivable') || await getAccountMapping(tid, 'accounts_receivable');
    const revenueAccount = await getAccountMapping(tid, 'ecommerce_revenue') || await getAccountMapping(tid, 'sales_revenue');

    if (!arAccount || !revenueAccount) {
      console.warn('[Bridge] Missing ecommerce account mappings for order');
      return;
    }

    const total = parseFloat(payload.total) || 0;
    if (total <= 0) return;

    await createJournalEntry(tid, {
      date: new Date().toISOString().split('T')[0],
      entry_type: 'INV',
      description: `E-commerce Order ${payload.order_id}`,
      reference_type: 'ecommerce_order',
      reference_id: payload.order_id,
      source_system: 'niyam_ecommerce',
      lines: [
        { account_id: arAccount, debit_amount: total, credit_amount: 0, description: `Order ${payload.order_id} receivable` },
        { account_id: revenueAccount, debit_amount: 0, credit_amount: total, description: `E-commerce revenue` },
      ],
      auto_post: true
    });

  } catch (error) {
    console.error('[Bridge] Failed to process ecommerce order:', error.message);
  }
}

async function handleEcommercePaymentCaptured(envelope) {
  const { tenantId, payload } = envelope;
  const tid = tenantId || payload?.tenant_id || DEFAULT_TENANT_ID;

  console.log(`[Bridge] Processing ecommerce payment.captured: ${payload.payment_id || payload.order_id}`);

  try {
    const bankAccount = await getAccountMapping(tid, 'bank');
    const arAccount = await getAccountMapping(tid, 'ecommerce_receivable') || await getAccountMapping(tid, 'accounts_receivable');

    if (!bankAccount || !arAccount) {
      console.warn('[Bridge] Missing ecommerce account mappings for payment');
      return;
    }

    const amount = parseFloat(payload.amount) || 0;
    if (amount <= 0) return;

    await createJournalEntry(tid, {
      date: new Date().toISOString().split('T')[0],
      entry_type: 'PMT',
      description: `E-commerce Payment - Order ${payload.order_id || 'N/A'}`,
      reference_type: 'ecommerce_payment',
      reference_id: payload.payment_id || payload.order_id,
      source_system: 'niyam_ecommerce',
      lines: [
        { account_id: bankAccount, debit_amount: amount, credit_amount: 0, description: 'Payment captured' },
        { account_id: arAccount, debit_amount: 0, credit_amount: amount, description: 'Clear ecommerce AR' },
      ],
      auto_post: true
    });

  } catch (error) {
    console.error('[Bridge] Failed to process ecommerce payment:', error.message);
  }
}

async function handleEcommerceRefund(envelope) {
  const { tenantId, payload } = envelope;
  const tid = tenantId || payload?.tenant_id || DEFAULT_TENANT_ID;

  console.log(`[Bridge] Processing ecommerce return.completed: ${payload.return_id}`);

  try {
    const refundAccount = await getAccountMapping(tid, 'ecommerce_refunds') || await getAccountMapping(tid, 'sales_revenue');
    const bankAccount = await getAccountMapping(tid, 'bank');

    if (!refundAccount || !bankAccount) {
      console.warn('[Bridge] Missing ecommerce account mappings for refund');
      return;
    }

    const amount = parseFloat(payload.refund_amount || payload.amount) || 0;
    if (amount <= 0) return;

    await createJournalEntry(tid, {
      date: new Date().toISOString().split('T')[0],
      entry_type: 'REF',
      description: `E-commerce Refund - Return ${payload.return_id}`,
      reference_type: 'ecommerce_refund',
      reference_id: payload.return_id,
      source_system: 'niyam_ecommerce',
      lines: [
        { account_id: refundAccount, debit_amount: amount, credit_amount: 0, description: 'Refund issued' },
        { account_id: bankAccount, debit_amount: 0, credit_amount: amount, description: 'Bank disbursement' },
      ],
      auto_post: true
    });

  } catch (error) {
    console.error('[Bridge] Failed to process ecommerce refund:', error.message);
  }
}

// ============================================
// NATS SUBSCRIPTION SETUP
// ============================================

async function setupEcommerceSubscriptions(nc, label) {
  const ecomOrderSub = nc.subscribe('ecommerce.order.created.v1');
  (async () => {
    for await (const msg of ecomOrderSub) {
      try {
        const envelope = JSON.parse(sc.decode(msg.data));
        await handleEcommerceOrderCreated(envelope);
      } catch (e) {
        console.error(`[Bridge/${label}] Error processing ecommerce order:`, e.message);
      }
    }
  })();

  const ecomPaymentSub = nc.subscribe('ecommerce.payment.captured.v1');
  (async () => {
    for await (const msg of ecomPaymentSub) {
      try {
        const envelope = JSON.parse(sc.decode(msg.data));
        await handleEcommercePaymentCaptured(envelope);
      } catch (e) {
        console.error(`[Bridge/${label}] Error processing ecommerce payment:`, e.message);
      }
    }
  })();

  const ecomRefundSub = nc.subscribe('ecommerce.return.completed.v1');
  (async () => {
    for await (const msg of ecomRefundSub) {
      try {
        const envelope = JSON.parse(sc.decode(msg.data));
        await handleEcommerceRefund(envelope);
      } catch (e) {
        console.error(`[Bridge/${label}] Error processing ecommerce refund:`, e.message);
      }
    }
  })();
}

async function setupSubscriptionsOnConnection(nc, label) {
  // Subscribe to retail billing events
  const billingInvoiceSub = nc.subscribe('retail.billing.invoice.created.v1');
  (async () => {
    for await (const msg of billingInvoiceSub) {
      try {
        const envelope = JSON.parse(sc.decode(msg.data));
        await handleInvoiceCreated(envelope);
      } catch (e) {
        console.error(`[Bridge/${label}] Error processing invoice event:`, e.message);
      }
    }
  })();

  const billingPaymentSub = nc.subscribe('retail.billing.payment.received.v1');
  (async () => {
    for await (const msg of billingPaymentSub) {
      try {
        const envelope = JSON.parse(sc.decode(msg.data));
        await handlePaymentReceived(envelope);
      } catch (e) {
        console.error(`[Bridge/${label}] Error processing payment event:`, e.message);
      }
    }
  })();

  // Subscribe to POS events
  const posSaleSub = nc.subscribe('retail.pos.sale.completed.v1');
  (async () => {
    for await (const msg of posSaleSub) {
      try {
        const envelope = JSON.parse(sc.decode(msg.data));
        await handlePOSSaleCompleted(envelope);
      } catch (e) {
        console.error(`[Bridge/${label}] Error processing POS sale:`, e.message);
      }
    }
  })();

  // Subscribe to inventory events
  const inventoryPurchaseSub = nc.subscribe('retail.inventory.purchase.received.v1');
  (async () => {
    for await (const msg of inventoryPurchaseSub) {
      try {
        const envelope = JSON.parse(sc.decode(msg.data));
        await handleInventoryPurchase(envelope);
      } catch (e) {
        console.error(`[Bridge/${label}] Error processing inventory purchase:`, e.message);
      }
    }
  })();

  // HOSPITALITY EVENT SUBSCRIPTIONS
  const hospitalityPaymentSub = nc.subscribe('hospitality.billing.payment_received.v1');
  (async () => {
    for await (const msg of hospitalityPaymentSub) {
      try {
        const envelope = JSON.parse(sc.decode(msg.data));
        await handleHospitalityPayment(envelope);
      } catch (e) {
        console.error(`[Bridge/${label}] Error processing hospitality payment:`, e.message);
      }
    }
  })();

  const checkoutSub = nc.subscribe('hospitality.front_office.checked_out.v1');
  (async () => {
    for await (const msg of checkoutSub) {
      try {
        const envelope = JSON.parse(sc.decode(msg.data));
        await handleGuestCheckout(envelope);
      } catch (e) {
        console.error(`[Bridge/${label}] Error processing checkout:`, e.message);
      }
    }
  })();

  const restaurantOrderSub = nc.subscribe('restaurant.order.created.v1');
  (async () => {
    for await (const msg of restaurantOrderSub) {
      try {
        const envelope = JSON.parse(sc.decode(msg.data));
        await handleRestaurantOrder(envelope);
      } catch (e) {
        console.error(`[Bridge/${label}] Error processing restaurant order:`, e.message);
      }
    }
  })();

  const restaurantOrderPaidSub = nc.subscribe('restaurant.order.paid.v1');
  (async () => {
    for await (const msg of restaurantOrderPaidSub) {
      try {
        const envelope = JSON.parse(sc.decode(msg.data));
        await handleRestaurantOrderPaid(envelope);
      } catch (e) {
        console.error(`[Bridge/${label}] Error processing restaurant payment:`, e.message);
      }
    }
  })();

  const roomServiceSub = nc.subscribe('hospitality.room_service.charge.v1');
  (async () => {
    for await (const msg of roomServiceSub) {
      try {
        const envelope = JSON.parse(sc.decode(msg.data));
        await handleRoomServiceCharge(envelope);
      } catch (e) {
        console.error(`[Bridge/${label}] Error processing room service:`, e.message);
      }
    }
  })();
}

async function setupNatsSubscriptions() {
  // Connect to primary NATS (accounting-nats - always required)
  try {
    natsConnection = await connect({ servers: NATS_URL });
    console.log(`[Bridge] Connected to primary NATS at ${NATS_URL}`);
    await setupSubscriptionsOnConnection(natsConnection, 'primary');

    console.log('[Bridge] Subscribed to events on primary NATS');

  } catch (error) {
    console.error('[Bridge] Failed to connect to primary NATS:', error.message);
    // Retry after 5 seconds
    setTimeout(setupNatsSubscriptions, 5000);
    return;
  }

  // Try to connect to retail NATS for cross-stack integration (optional)
  if (RETAIL_NATS_URL && RETAIL_NATS_URL !== NATS_URL) {
    try {
      retailNatsConnection = await connect({ servers: RETAIL_NATS_URL });
      console.log(`[Bridge] Connected to retail NATS at ${RETAIL_NATS_URL}`);
      await setupSubscriptionsOnConnection(retailNatsConnection, 'retail');
      console.log('[Bridge] Subscribed to events on retail NATS (cross-stack integration enabled)');
    } catch (error) {
      console.log(`[Bridge] Retail NATS not available (${error.message}) - running in standalone mode`);
      retailNatsConnection = null;
    }
  } else {
    console.log('[Bridge] Running in standalone mode (no RETAIL_NATS_URL configured)');
  }

  // Try to connect to ecommerce NATS for ecommerce integration (optional)
  if (ECOMMERCE_NATS_URL && ECOMMERCE_NATS_URL !== NATS_URL) {
    try {
      ecommerceNatsConnection = await connect({ servers: ECOMMERCE_NATS_URL });
      console.log(`[Bridge] Connected to ecommerce NATS at ${ECOMMERCE_NATS_URL}`);
      await setupEcommerceSubscriptions(ecommerceNatsConnection, 'ecommerce');
      console.log('[Bridge] Subscribed to events on ecommerce NATS (cross-stack integration enabled)');
    } catch (error) {
      console.log(`[Bridge] Ecommerce NATS not available (${error.message}) - ecommerce integration disabled`);
      ecommerceNatsConnection = null;
    }
  } else if (natsConnection) {
    // If no separate ecommerce NATS, subscribe on primary for testing/standalone
    await setupEcommerceSubscriptions(natsConnection, 'primary');
    console.log('[Bridge] Ecommerce subscriptions added on primary NATS');
  }

  console.log('[Bridge] Event subscriptions:');
  console.log('  RETAIL:');
  console.log('    - retail.billing.invoice.created.v1');
  console.log('    - retail.billing.payment.received.v1');
  console.log('    - retail.pos.sale.completed.v1');
  console.log('    - retail.inventory.purchase.received.v1');
  console.log('  HOSPITALITY:');
  console.log('    - hospitality.billing.payment_received.v1');
  console.log('    - hospitality.front_office.checked_out.v1');
  console.log('    - restaurant.order.created.v1 (logged)');
  console.log('    - restaurant.order.paid.v1 (journal entry)');
  console.log('    - hospitality.room_service.charge.v1');
  console.log('  ECOMMERCE:');
  console.log('    - ecommerce.order.created.v1');
  console.log('    - ecommerce.payment.captured.v1');
  console.log('    - ecommerce.return.completed.v1');
}

async function shutdownNats() {
  console.log('[Bridge] Shutting down NATS connections...');
  if (natsConnection) {
    await natsConnection.drain();
  }
  if (retailNatsConnection) {
    await retailNatsConnection.drain();
  }
  if (ecommerceNatsConnection) {
    await ecommerceNatsConnection.drain();
  }
}

// ============================================
// MAPPINGS QUERY (for REST endpoint)
// ============================================

async function getAccountMappings(tenantId) {
  const mappings = {};
  for (const key of Object.keys(DEFAULT_ACCOUNT_MAPPINGS)) {
    const accountId = await getAccountMapping(tenantId, key);
    const account = accountId ? await query('SELECT account_code, account_name FROM acc_accounts WHERE id = $1', [accountId]) : null;
    mappings[key] = {
      default_code: DEFAULT_ACCOUNT_MAPPINGS[key],
      account_id: accountId,
      account_code: account?.rows[0]?.account_code,
      account_name: account?.rows[0]?.account_name
    };
  }
  return mappings;
}

// ============================================
// GETTERS for connection state (used by health routes)
// ============================================

function getNatsConnection() { return natsConnection; }
function getRetailNatsConnection() { return retailNatsConnection; }
function getEcommerceNatsConnection() { return ecommerceNatsConnection; }

module.exports = {
  setupNatsSubscriptions,
  shutdownNats,
  getAccountMappings,
  getNatsConnection,
  getRetailNatsConnection,
  getEcommerceNatsConnection,
  // Expose event handlers for manual trigger endpoints
  handleInvoiceCreated,
  handlePaymentReceived,
  handlePOSSaleCompleted,
  DEFAULT_TENANT_ID
};
