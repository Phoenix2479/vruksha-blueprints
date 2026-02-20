/**
 * POS Extended Feature Stubs
 * 
 * These are API endpoint stubs for advanced POS features.
 * Import and mount these routes in the main service.js when ready to activate.
 * 
 * To activate: Add to service.js:
 *   const posStubs = require('./stubs/pos-extended-stubs');
 *   app.use(posStubs);
 */

const express = require('express');
const router = express.Router();

// Helper for stub responses
const stubResponse = (feature, data = {}) => ({
  success: true,
  stub: true,
  feature,
  message: `${feature} - stub implementation. Replace with actual logic.`,
  ...data
});

// ============================================
// RETURNS & EXCHANGES
// ============================================

/**
 * POST /returns/lookup
 * Look up original transaction for return
 */
router.post('/returns/lookup', async (req, res) => {
  const { receipt_number, transaction_id } = req.body;
  // TODO: Query pos_transactions table by receipt_number or id
  // TODO: Return original items with quantities
  res.json(stubResponse('Returns Lookup', {
    original_transaction: {
      id: transaction_id || 'TXN-SAMPLE',
      receipt_number: receipt_number || 'RCP-001',
      date: new Date().toISOString(),
      items: [
        { sku: 'SKU-001', name: 'Sample Product', quantity: 2, price: 29.99, returnable: true },
        { sku: 'SKU-002', name: 'Final Sale Item', quantity: 1, price: 19.99, returnable: false }
      ],
      total: 79.97,
      return_policy_days: 30
    }
  }));
});

/**
 * POST /returns/process
 * Process a return or exchange
 */
router.post('/returns/process', async (req, res) => {
  const { original_transaction_id, items, reason_code, refund_method, exchange_items } = req.body;
  // TODO: Validate return policy window
  // TODO: Calculate refund amount (minus restocking fees if applicable)
  // TODO: Update inventory (add returned items back)
  // TODO: Create return transaction record
  // TODO: Process refund or exchange
  // TODO: Publish retail.pos.return.processed.v1 event
  res.json(stubResponse('Process Return', {
    return_id: `RTN-${Date.now()}`,
    original_transaction_id,
    items_returned: items?.length || 0,
    refund_amount: 0, // Calculate based on items
    refund_method: refund_method || 'original',
    exchange_items: exchange_items || [],
    reason_code,
    status: 'completed'
  }));
});

/**
 * GET /returns/reasons
 * Get list of return reason codes
 */
router.get('/returns/reasons', (req, res) => {
  res.json(stubResponse('Return Reasons', {
    reasons: [
      { code: 'DEFECTIVE', label: 'Defective/Damaged', requires_approval: false },
      { code: 'WRONG_ITEM', label: 'Wrong Item Received', requires_approval: false },
      { code: 'NOT_AS_DESCRIBED', label: 'Not as Described', requires_approval: false },
      { code: 'CHANGED_MIND', label: 'Changed Mind', requires_approval: false },
      { code: 'SIZE_ISSUE', label: 'Size/Fit Issue', requires_approval: false },
      { code: 'QUALITY', label: 'Quality Not Satisfactory', requires_approval: true },
      { code: 'OTHER', label: 'Other', requires_approval: true }
    ]
  }));
});

// ============================================
// ORDER NOTES & SPECIAL INSTRUCTIONS
// ============================================

/**
 * POST /cart/:session_id/notes
 * Add notes to current cart/order
 */
router.post('/cart/:session_id/notes', async (req, res) => {
  const { session_id } = req.params;
  const { notes } = req.body; // Array of { type, content, item_id? }
  // TODO: Store notes in cart cache or order record
  // TODO: Support types: general, gift, delivery, fulfillment, internal
  res.json(stubResponse('Order Notes', {
    session_id,
    notes_saved: notes?.length || 0,
    notes
  }));
});

/**
 * GET /cart/:session_id/notes
 * Get notes for current cart
 */
router.get('/cart/:session_id/notes', async (req, res) => {
  const { session_id } = req.params;
  res.json(stubResponse('Get Order Notes', {
    session_id,
    notes: []
  }));
});

// ============================================
// TIPS
// ============================================

/**
 * POST /cart/:session_id/tip
 * Add tip to transaction
 */
router.post('/cart/:session_id/tip', async (req, res) => {
  const { session_id } = req.params;
  const { amount, distribution } = req.body; // distribution: [{ staff_id, amount }]
  // TODO: Add tip to cart totals
  // TODO: Store tip distribution for reporting
  res.json(stubResponse('Add Tip', {
    session_id,
    tip_amount: amount || 0,
    distribution: distribution || 'equal'
  }));
});

// ============================================
// DEPOSITS & PARTIAL PAYMENTS
// ============================================

/**
 * POST /orders/:order_id/deposit
 * Collect deposit for order
 */
router.post('/orders/:order_id/deposit', async (req, res) => {
  const { order_id } = req.params;
  const { amount, is_refundable, payment_method } = req.body;
  // TODO: Create deposit record
  // TODO: Update order status
  // TODO: Generate deposit receipt
  res.json(stubResponse('Collect Deposit', {
    deposit_id: `DEP-${Date.now()}`,
    order_id,
    amount,
    is_refundable: is_refundable !== false,
    payment_method,
    receipt_number: `DRCP-${Date.now()}`
  }));
});

/**
 * GET /orders/:order_id/payments
 * Get payment history for order (deposits + partial payments)
 */
router.get('/orders/:order_id/payments', async (req, res) => {
  const { order_id } = req.params;
  // TODO: Query payments table for order
  res.json(stubResponse('Order Payments', {
    order_id,
    payments: [],
    total_paid: 0,
    balance_due: 0
  }));
});

/**
 * POST /orders/:order_id/partial-payment
 * Record partial payment
 */
router.post('/orders/:order_id/partial-payment', async (req, res) => {
  const { order_id } = req.params;
  const { amount, payment_method, reference } = req.body;
  // TODO: Validate amount doesn't exceed balance
  // TODO: Create payment record
  // TODO: Update order paid amount
  res.json(stubResponse('Partial Payment', {
    payment_id: `PAY-${Date.now()}`,
    order_id,
    amount,
    payment_method,
    new_balance_due: 0
  }));
});

// ============================================
// HELD TRANSACTIONS (SERVER-SIDE)
// ============================================

/**
 * POST /held-transactions
 * Hold current cart on server
 */
router.post('/held-transactions', async (req, res) => {
  const { session_id, cart, customer_id, note } = req.body;
  // TODO: Store held transaction in database
  // TODO: Associate with session and optional customer
  res.json(stubResponse('Hold Transaction', {
    held_id: `HOLD-${Date.now()}`,
    session_id,
    customer_id,
    note,
    held_at: new Date().toISOString()
  }));
});

/**
 * GET /held-transactions
 * List held transactions for session/store
 */
router.get('/held-transactions', async (req, res) => {
  const { session_id, store_id } = req.query;
  // TODO: Query held transactions from database
  res.json(stubResponse('List Held Transactions', {
    held_transactions: []
  }));
});

/**
 * POST /held-transactions/:held_id/recall
 * Recall a held transaction
 */
router.post('/held-transactions/:held_id/recall', async (req, res) => {
  const { held_id } = req.params;
  // TODO: Retrieve held transaction
  // TODO: Restore to current cart
  // TODO: Delete held record
  res.json(stubResponse('Recall Held Transaction', {
    held_id,
    cart: { items: [] }
  }));
});

// ============================================
// CUSTOM ITEMS / MISC CHARGES
// ============================================

/**
 * POST /cart/:session_id/custom-item
 * Add custom/misc item to cart
 */
router.post('/cart/:session_id/custom-item', async (req, res) => {
  const { session_id } = req.params;
  const { description, price, quantity, category, taxable } = req.body;
  // TODO: Add custom item to cart with generated SKU
  // TODO: Mark as non-inventory item
  res.json(stubResponse('Add Custom Item', {
    session_id,
    item: {
      sku: `MISC-${Date.now()}`,
      description,
      price,
      quantity: quantity || 1,
      category: category || 'misc',
      taxable: taxable !== false,
      is_custom: true
    }
  }));
});

// ============================================
// TABLE/SEAT MANAGEMENT (F&B)
// ============================================

/**
 * GET /tables
 * Get all tables with status
 */
router.get('/tables', async (req, res) => {
  const { store_id, section } = req.query;
  // TODO: Query tables from database with current status
  res.json(stubResponse('List Tables', {
    tables: [
      { id: '1', number: 'T1', capacity: 4, status: 'available', section: 'main' },
      { id: '2', number: 'T2', capacity: 2, status: 'occupied', section: 'main', order_id: 'ORD-001' },
      { id: '3', number: 'B1', capacity: 4, status: 'available', section: 'bar' }
    ]
  }));
});

/**
 * POST /tables/:table_id/open
 * Open a table (seat guests)
 */
router.post('/tables/:table_id/open', async (req, res) => {
  const { table_id } = req.params;
  const { guest_count, server_id } = req.body;
  // TODO: Create order for table
  // TODO: Update table status to occupied
  res.json(stubResponse('Open Table', {
    table_id,
    order_id: `ORD-${Date.now()}`,
    guest_count,
    server_id,
    opened_at: new Date().toISOString()
  }));
});

/**
 * POST /tables/:table_id/close
 * Close a table
 */
router.post('/tables/:table_id/close', async (req, res) => {
  const { table_id } = req.params;
  // TODO: Verify order is paid
  // TODO: Update table status
  res.json(stubResponse('Close Table', {
    table_id,
    closed_at: new Date().toISOString()
  }));
});

/**
 * POST /tables/merge
 * Merge multiple tables
 */
router.post('/tables/merge', async (req, res) => {
  const { table_ids, primary_table_id } = req.body;
  // TODO: Combine orders from all tables
  // TODO: Update table statuses
  res.json(stubResponse('Merge Tables', {
    merged_table_id: primary_table_id,
    source_tables: table_ids,
    combined_order_id: `ORD-${Date.now()}`
  }));
});

/**
 * POST /tables/transfer
 * Transfer order between tables
 */
router.post('/tables/transfer', async (req, res) => {
  const { from_table_id, to_table_id } = req.body;
  // TODO: Move order to new table
  // TODO: Update both table statuses
  res.json(stubResponse('Transfer Table', {
    from_table_id,
    to_table_id,
    order_id: 'ORD-001'
  }));
});

// ============================================
// PRE-ORDERS / BACKORDERS
// ============================================

/**
 * POST /pre-orders
 * Create a pre-order
 */
router.post('/pre-orders', async (req, res) => {
  const { customer_id, items, expected_date, deposit_amount, notes } = req.body;
  // TODO: Create pre-order record
  // TODO: Reserve inventory if available
  // TODO: Collect deposit if specified
  res.json(stubResponse('Create Pre-Order', {
    pre_order_id: `PO-${Date.now()}`,
    order_number: `PO-${Date.now().toString(36).toUpperCase()}`,
    customer_id,
    items_count: items?.length || 0,
    expected_date,
    deposit_amount: deposit_amount || 0,
    status: 'pending'
  }));
});

/**
 * GET /pre-orders
 * List pre-orders
 */
router.get('/pre-orders', async (req, res) => {
  const { status, customer_id } = req.query;
  // TODO: Query pre-orders with filters
  res.json(stubResponse('List Pre-Orders', {
    pre_orders: []
  }));
});

/**
 * PATCH /pre-orders/:id/status
 * Update pre-order status
 */
router.patch('/pre-orders/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // pending, ready, notified, completed, cancelled
  // TODO: Update status
  // TODO: Send notification if status = ready
  res.json(stubResponse('Update Pre-Order Status', {
    pre_order_id: id,
    status,
    updated_at: new Date().toISOString()
  }));
});

/**
 * POST /pre-orders/:id/convert
 * Convert pre-order to sale
 */
router.post('/pre-orders/:id/convert', async (req, res) => {
  const { id } = req.params;
  const { session_id } = req.body;
  // TODO: Create POS transaction from pre-order
  // TODO: Apply deposit as payment
  // TODO: Update pre-order status to completed
  res.json(stubResponse('Convert Pre-Order', {
    pre_order_id: id,
    transaction_id: `TXN-${Date.now()}`,
    deposit_applied: 0,
    balance_due: 0
  }));
});

// ============================================
// AGE VERIFICATION
// ============================================

/**
 * POST /age-verification
 * Record age verification
 */
router.post('/age-verification', async (req, res) => {
  const { session_id, product_sku, verification_method, birth_date, verified } = req.body;
  // TODO: Log verification attempt
  // TODO: Block sale if not verified
  res.json(stubResponse('Age Verification', {
    verification_id: `AGE-${Date.now()}`,
    session_id,
    product_sku,
    verification_method, // visual, dob, id_scan
    verified: verified || false,
    verified_at: new Date().toISOString()
  }));
});

/**
 * GET /products/:sku/age-restriction
 * Check if product requires age verification
 */
router.get('/products/:sku/age-restriction', async (req, res) => {
  const { sku } = req.params;
  // TODO: Check product category for age restriction
  res.json(stubResponse('Age Restriction Check', {
    sku,
    requires_verification: false,
    minimum_age: null
  }));
});

// ============================================
// RECEIPTS & PRINTING
// ============================================

/**
 * POST /receipts/generate
 * Generate receipt for transaction
 */
router.post('/receipts/generate', async (req, res) => {
  const { transaction_id, format, include_barcode, include_qr } = req.body;
  // TODO: Fetch transaction details
  // TODO: Generate receipt in requested format
  res.json(stubResponse('Generate Receipt', {
    transaction_id,
    receipt_data: {
      format: format || 'thermal',
      content: '--- Receipt Content ---',
      barcode: include_barcode ? 'BARCODE_DATA' : null,
      qr_code: include_qr ? 'QR_DATA' : null
    }
  }));
});

/**
 * POST /receipts/reprint
 * Reprint existing receipt
 */
router.post('/receipts/reprint', async (req, res) => {
  const { transaction_id, receipt_number } = req.body;
  // TODO: Fetch original receipt
  // TODO: Send to printer
  res.json(stubResponse('Reprint Receipt', {
    transaction_id,
    receipt_number,
    reprinted_at: new Date().toISOString()
  }));
});

/**
 * POST /receipts/email
 * Email receipt to customer
 */
router.post('/receipts/email', async (req, res) => {
  const { transaction_id, email } = req.body;
  // TODO: Generate PDF receipt
  // TODO: Send via email service
  res.json(stubResponse('Email Receipt', {
    transaction_id,
    email,
    sent: true,
    sent_at: new Date().toISOString()
  }));
});

/**
 * POST /receipts/sms
 * Send receipt summary via SMS
 */
router.post('/receipts/sms', async (req, res) => {
  const { transaction_id, phone } = req.body;
  // TODO: Generate SMS content
  // TODO: Send via SMS gateway
  res.json(stubResponse('SMS Receipt', {
    transaction_id,
    phone,
    sent: true,
    sent_at: new Date().toISOString()
  }));
});

// ============================================
// HARDWARE INTEGRATION
// ============================================

/**
 * GET /hardware/status
 * Get connected hardware status
 */
router.get('/hardware/status', async (req, res) => {
  res.json(stubResponse('Hardware Status', {
    devices: [
      { type: 'receipt_printer', name: 'Main Printer', status: 'connected', connection: 'usb' },
      { type: 'cash_drawer', name: 'Cash Drawer', status: 'connected', connection: 'serial' },
      { type: 'barcode_scanner', name: 'Scanner', status: 'connected', connection: 'usb' },
      { type: 'card_terminal', name: 'Card Reader', status: 'disconnected', connection: 'network' },
      { type: 'customer_display', name: 'Pole Display', status: 'disconnected', connection: 'serial' },
      { type: 'scale', name: 'Weight Scale', status: 'disconnected', connection: 'serial' }
    ]
  }));
});

/**
 * POST /hardware/cash-drawer/open
 * Open cash drawer
 */
router.post('/hardware/cash-drawer/open', async (req, res) => {
  // TODO: Send open command to cash drawer
  res.json(stubResponse('Open Cash Drawer', {
    opened: true,
    opened_at: new Date().toISOString()
  }));
});

/**
 * POST /hardware/customer-display/show
 * Show message on customer display
 */
router.post('/hardware/customer-display/show', async (req, res) => {
  const { line1, line2 } = req.body;
  // TODO: Send to customer display
  res.json(stubResponse('Customer Display', {
    displayed: true,
    line1,
    line2
  }));
});

/**
 * GET /hardware/scale/read
 * Read weight from scale
 */
router.get('/hardware/scale/read', async (req, res) => {
  // TODO: Read from connected scale
  res.json(stubResponse('Scale Reading', {
    weight: 0,
    unit: 'kg',
    stable: true
  }));
});

/**
 * POST /hardware/card-terminal/payment
 * Initiate card payment on terminal
 */
router.post('/hardware/card-terminal/payment', async (req, res) => {
  const { amount, transaction_id } = req.body;
  // TODO: Send payment request to terminal
  // TODO: Wait for response
  res.json(stubResponse('Card Terminal Payment', {
    status: 'pending',
    amount,
    transaction_id,
    terminal_ref: `TERM-${Date.now()}`
  }));
});

// ============================================
// QUICK REPORTS (AT POS)
// ============================================

/**
 * GET /reports/daily-summary
 * Get quick daily summary for current session/store
 */
router.get('/reports/daily-summary', async (req, res) => {
  const { store_id, date } = req.query;
  // TODO: Aggregate sales data for the day
  res.json(stubResponse('Daily Summary', {
    date: date || new Date().toISOString().split('T')[0],
    store_id,
    summary: {
      total_sales: 0,
      transaction_count: 0,
      average_transaction: 0,
      items_sold: 0,
      returns_amount: 0,
      compared_to_yesterday: 0
    },
    hourly_sales: [],
    top_products: [],
    payment_breakdown: []
  }));
});

/**
 * GET /reports/x-report
 * Generate X-Report (mid-day, non-clearing)
 */
router.get('/reports/x-report', async (req, res) => {
  const { session_id } = req.query;
  // TODO: Generate comprehensive mid-day report
  res.json(stubResponse('X-Report', {
    report_type: 'X',
    session_id,
    generated_at: new Date().toISOString(),
    sales_summary: {},
    payment_summary: {},
    tax_summary: {},
    transaction_stats: {}
  }));
});

/**
 * POST /reports/z-report
 * Generate Z-Report (end of day, clearing)
 */
router.post('/reports/z-report', async (req, res) => {
  const { session_id, actual_cash } = req.body;
  // TODO: Generate end-of-day report
  // TODO: Close out daily totals
  // TODO: Calculate cash variance
  res.json(stubResponse('Z-Report', {
    report_type: 'Z',
    session_id,
    generated_at: new Date().toISOString(),
    sales_summary: {},
    payment_summary: {},
    tax_summary: {},
    cash_reconciliation: {
      expected: 0,
      actual: actual_cash || 0,
      variance: 0
    },
    cleared: true
  }));
});

module.exports = router;
