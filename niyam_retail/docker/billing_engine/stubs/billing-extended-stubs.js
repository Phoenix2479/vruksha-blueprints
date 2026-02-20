/**
 * Billing Engine Extended Feature Stubs
 * 
 * API endpoint stubs for advanced billing features: EMI, quotations, multi-currency.
 * Import and mount these routes in the main service.js when ready.
 * 
 * To activate: Add to service.js:
 *   const billingStubs = require('./stubs/billing-extended-stubs');
 *   app.use(billingStubs);
 */

const express = require('express');
const router = express.Router();

const stubResponse = (feature, data = {}) => ({
  success: true,
  stub: true,
  feature,
  message: `${feature} - stub implementation. Replace with actual logic.`,
  ...data
});

// ============================================
// EMI / INSTALLMENT PLANS
// ============================================

/**
 * GET /emi/plans
 * Get available EMI plans
 */
router.get('/emi/plans', async (req, res) => {
  const { amount, category } = req.query;
  // TODO: Query EMI plans based on amount and category
  res.json(stubResponse('EMI Plans', {
    plans: [
      {
        id: 'emi-3',
        name: '3 Month EMI',
        duration_months: 3,
        interest_rate: 0, // No-cost EMI
        min_amount: 1000,
        max_amount: 100000,
        processing_fee: 0,
        available_banks: ['HDFC', 'ICICI', 'SBI', 'Axis'],
        emi_amount: amount ? Math.ceil(amount / 3) : null
      },
      {
        id: 'emi-6',
        name: '6 Month EMI',
        duration_months: 6,
        interest_rate: 12, // 12% p.a.
        min_amount: 3000,
        max_amount: 200000,
        processing_fee: 99,
        available_banks: ['HDFC', 'ICICI', 'SBI', 'Axis', 'Kotak'],
        emi_amount: amount ? Math.ceil((amount * 1.06) / 6) : null
      },
      {
        id: 'emi-12',
        name: '12 Month EMI',
        duration_months: 12,
        interest_rate: 14,
        min_amount: 5000,
        max_amount: 500000,
        processing_fee: 149,
        available_banks: ['HDFC', 'ICICI', 'SBI'],
        emi_amount: amount ? Math.ceil((amount * 1.14) / 12) : null
      }
    ]
  }));
});

/**
 * POST /emi/calculate
 * Calculate EMI details
 */
router.post('/emi/calculate', async (req, res) => {
  const { amount, plan_id, bank } = req.body;
  // TODO: Calculate exact EMI based on plan and bank
  const plan = { duration_months: 6, interest_rate: 12 }; // Sample
  const interest = amount * (plan.interest_rate / 100) * (plan.duration_months / 12);
  const total = amount + interest;
  const emi_amount = Math.ceil(total / plan.duration_months);
  
  res.json(stubResponse('EMI Calculation', {
    principal: amount,
    interest_rate: plan.interest_rate,
    total_interest: interest,
    total_payable: total,
    duration_months: plan.duration_months,
    emi_amount,
    schedule: Array.from({ length: plan.duration_months }, (_, i) => ({
      installment: i + 1,
      due_date: new Date(Date.now() + (i + 1) * 30 * 86400000).toISOString().split('T')[0],
      principal_component: amount / plan.duration_months,
      interest_component: interest / plan.duration_months,
      amount: emi_amount
    }))
  }));
});

/**
 * POST /emi/apply
 * Apply EMI to transaction
 */
router.post('/emi/apply', async (req, res) => {
  const { transaction_id, plan_id, bank, card_last_4, customer_id } = req.body;
  // TODO: Create EMI record
  // TODO: Process initial payment/authorization
  res.json(stubResponse('Apply EMI', {
    emi_id: `EMI-${Date.now()}`,
    transaction_id,
    plan_id,
    bank,
    card_last_4,
    status: 'approved',
    first_emi_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
  }));
});

/**
 * GET /emi/:emi_id/status
 * Get EMI status and payment history
 */
router.get('/emi/:emi_id/status', async (req, res) => {
  const { emi_id } = req.params;
  // TODO: Query EMI record
  res.json(stubResponse('EMI Status', {
    emi_id,
    status: 'active',
    total_installments: 6,
    paid_installments: 2,
    remaining_installments: 4,
    total_amount: 6000,
    paid_amount: 2000,
    remaining_amount: 4000,
    next_emi: {
      due_date: '2024-02-15',
      amount: 1000
    },
    payment_history: []
  }));
});

// ============================================
// QUOTATIONS / ESTIMATES
// ============================================

/**
 * POST /quotations
 * Create a quotation
 */
router.post('/quotations', async (req, res) => {
  const { customer_id, items, valid_days, notes, terms } = req.body;
  // TODO: Create quotation record
  // TODO: Generate quotation number
  const subtotal = items?.reduce((sum, i) => sum + (i.price * i.quantity), 0) || 0;
  const tax = subtotal * 0.08;
  
  res.json(stubResponse('Create Quotation', {
    quotation_id: `QT-${Date.now()}`,
    quotation_number: `QT-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`,
    customer_id,
    items_count: items?.length || 0,
    subtotal,
    tax,
    total: subtotal + tax,
    valid_until: new Date(Date.now() + (valid_days || 30) * 86400000).toISOString(),
    status: 'draft',
    created_at: new Date().toISOString()
  }));
});

/**
 * GET /quotations
 * List quotations
 */
router.get('/quotations', async (req, res) => {
  const { customer_id, status, from_date, to_date } = req.query;
  // TODO: Query quotations with filters
  res.json(stubResponse('List Quotations', {
    quotations: [],
    total: 0
  }));
});

/**
 * GET /quotations/:quotation_id
 * Get quotation details
 */
router.get('/quotations/:quotation_id', async (req, res) => {
  const { quotation_id } = req.params;
  // TODO: Fetch quotation
  res.json(stubResponse('Quotation Details', {
    quotation_id,
    quotation_number: 'QT-2024-001',
    customer: {},
    items: [],
    subtotal: 0,
    tax: 0,
    total: 0,
    status: 'draft',
    valid_until: null,
    notes: '',
    terms: ''
  }));
});

/**
 * PATCH /quotations/:quotation_id
 * Update quotation
 */
router.patch('/quotations/:quotation_id', async (req, res) => {
  const { quotation_id } = req.params;
  const { items, valid_days, notes, terms, discount } = req.body;
  // TODO: Update quotation
  res.json(stubResponse('Update Quotation', {
    quotation_id,
    updated_at: new Date().toISOString()
  }));
});

/**
 * POST /quotations/:quotation_id/send
 * Send quotation to customer
 */
router.post('/quotations/:quotation_id/send', async (req, res) => {
  const { quotation_id } = req.params;
  const { method, email, phone } = req.body; // method: email, sms, whatsapp
  // TODO: Generate PDF
  // TODO: Send via selected method
  res.json(stubResponse('Send Quotation', {
    quotation_id,
    sent_via: method,
    sent_to: email || phone,
    sent_at: new Date().toISOString()
  }));
});

/**
 * POST /quotations/:quotation_id/convert
 * Convert quotation to order/invoice
 */
router.post('/quotations/:quotation_id/convert', async (req, res) => {
  const { quotation_id } = req.params;
  const { type, session_id } = req.body; // type: order, invoice
  // TODO: Create order/invoice from quotation
  // TODO: Update quotation status to 'converted'
  res.json(stubResponse('Convert Quotation', {
    quotation_id,
    converted_to: type || 'order',
    order_id: `ORD-${Date.now()}`,
    status: 'converted'
  }));
});

/**
 * POST /quotations/:quotation_id/duplicate
 * Duplicate quotation
 */
router.post('/quotations/:quotation_id/duplicate', async (req, res) => {
  const { quotation_id } = req.params;
  // TODO: Create copy of quotation
  res.json(stubResponse('Duplicate Quotation', {
    original_id: quotation_id,
    new_quotation_id: `QT-${Date.now()}`,
    status: 'draft'
  }));
});

// ============================================
// MULTI-CURRENCY
// ============================================

/**
 * GET /currencies
 * Get supported currencies
 */
router.get('/currencies', async (req, res) => {
  res.json(stubResponse('Supported Currencies', {
    base_currency: 'INR',
    supported: [
      { code: 'INR', symbol: '₹', name: 'Indian Rupee', decimal_places: 2 },
      { code: 'USD', symbol: '$', name: 'US Dollar', decimal_places: 2 },
      { code: 'EUR', symbol: '€', name: 'Euro', decimal_places: 2 },
      { code: 'GBP', symbol: '£', name: 'British Pound', decimal_places: 2 },
      { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', decimal_places: 2 },
      { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', decimal_places: 2 }
    ]
  }));
});

/**
 * GET /currencies/rates
 * Get current exchange rates
 */
router.get('/currencies/rates', async (req, res) => {
  const { base } = req.query;
  // TODO: Fetch from exchange rate service or cached rates
  res.json(stubResponse('Exchange Rates', {
    base: base || 'INR',
    updated_at: new Date().toISOString(),
    rates: {
      INR: 1,
      USD: 0.012,
      EUR: 0.011,
      GBP: 0.0095,
      AED: 0.044,
      SGD: 0.016
    }
  }));
});

/**
 * POST /currencies/convert
 * Convert amount between currencies
 */
router.post('/currencies/convert', async (req, res) => {
  const { amount, from_currency, to_currency } = req.body;
  // TODO: Apply exchange rate
  // Sample conversion
  const rate = 0.012; // INR to USD sample
  const converted = amount * rate;
  
  res.json(stubResponse('Currency Conversion', {
    original: { amount, currency: from_currency },
    converted: { amount: converted, currency: to_currency },
    rate,
    rate_timestamp: new Date().toISOString()
  }));
});

/**
 * PATCH /cart/:session_id/currency
 * Change cart currency
 */
router.patch('/cart/:session_id/currency', async (req, res) => {
  const { session_id } = req.params;
  const { currency } = req.body;
  // TODO: Update cart currency
  // TODO: Recalculate all prices
  res.json(stubResponse('Change Cart Currency', {
    session_id,
    new_currency: currency,
    exchange_rate: 1,
    converted: true
  }));
});

// ============================================
// PARTIAL PAYMENTS
// ============================================

/**
 * POST /invoices/:invoice_id/partial-payment
 * Record partial payment on invoice
 */
router.post('/invoices/:invoice_id/partial-payment', async (req, res) => {
  const { invoice_id } = req.params;
  const { amount, payment_method, reference, notes } = req.body;
  // TODO: Validate amount <= balance due
  // TODO: Create payment record
  // TODO: Update invoice balance
  res.json(stubResponse('Record Partial Payment', {
    payment_id: `PAY-${Date.now()}`,
    invoice_id,
    amount,
    payment_method,
    new_balance_due: 0,
    invoice_status: 'partially_paid'
  }));
});

/**
 * GET /invoices/:invoice_id/payments
 * Get payment history for invoice
 */
router.get('/invoices/:invoice_id/payments', async (req, res) => {
  const { invoice_id } = req.params;
  // TODO: Query payments for invoice
  res.json(stubResponse('Invoice Payments', {
    invoice_id,
    total_due: 1000,
    total_paid: 600,
    balance_due: 400,
    payments: [
      { id: 'pay-001', date: '2024-01-01', amount: 300, method: 'cash' },
      { id: 'pay-002', date: '2024-01-15', amount: 300, method: 'card' }
    ]
  }));
});

// ============================================
// CREDIT ACCOUNTS
// ============================================

/**
 * GET /credit-accounts/:customer_id
 * Get customer credit account
 */
router.get('/credit-accounts/:customer_id', async (req, res) => {
  const { customer_id } = req.params;
  // TODO: Query credit account
  res.json(stubResponse('Credit Account', {
    customer_id,
    credit_limit: 50000,
    available_credit: 35000,
    current_balance: 15000,
    payment_terms_days: 30,
    status: 'active',
    overdue_amount: 0,
    last_payment_date: '2024-01-15'
  }));
});

/**
 * POST /credit-accounts/:customer_id/charge
 * Charge to credit account
 */
router.post('/credit-accounts/:customer_id/charge', async (req, res) => {
  const { customer_id } = req.params;
  const { amount, invoice_id, transaction_id } = req.body;
  // TODO: Validate credit available
  // TODO: Create credit charge
  res.json(stubResponse('Charge to Credit', {
    charge_id: `CHG-${Date.now()}`,
    customer_id,
    amount,
    new_balance: 15000 + amount,
    available_credit: 35000 - amount,
    due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
  }));
});

/**
 * POST /credit-accounts/:customer_id/payment
 * Record payment to credit account
 */
router.post('/credit-accounts/:customer_id/payment', async (req, res) => {
  const { customer_id } = req.params;
  const { amount, payment_method, reference } = req.body;
  // TODO: Record payment
  // TODO: Update balance
  res.json(stubResponse('Credit Account Payment', {
    payment_id: `CPAY-${Date.now()}`,
    customer_id,
    amount,
    new_balance: 15000 - amount,
    available_credit: 35000 + amount
  }));
});

/**
 * GET /credit-accounts/:customer_id/statement
 * Get credit account statement
 */
router.get('/credit-accounts/:customer_id/statement', async (req, res) => {
  const { customer_id } = req.params;
  const { from_date, to_date } = req.query;
  // TODO: Generate statement
  res.json(stubResponse('Credit Statement', {
    customer_id,
    period: { from: from_date, to: to_date },
    opening_balance: 10000,
    charges: 8000,
    payments: 3000,
    closing_balance: 15000,
    transactions: []
  }));
});

// ============================================
// TAX CALCULATIONS
// ============================================

/**
 * POST /tax/calculate
 * Calculate taxes for cart items
 */
router.post('/tax/calculate', async (req, res) => {
  const { items, shipping_address, billing_address } = req.body;
  // TODO: Apply tax rules based on location and item categories
  // TODO: Support GST, VAT, Sales Tax
  res.json(stubResponse('Calculate Tax', {
    subtotal: 1000,
    tax_breakdown: [
      { name: 'CGST', rate: 9, amount: 90 },
      { name: 'SGST', rate: 9, amount: 90 }
    ],
    total_tax: 180,
    total: 1180
  }));
});

/**
 * GET /tax/rates
 * Get applicable tax rates
 */
router.get('/tax/rates', async (req, res) => {
  const { category, state } = req.query;
  // TODO: Return tax rates for category/state
  res.json(stubResponse('Tax Rates', {
    rates: [
      { name: 'Standard GST', rate: 18, categories: ['general'] },
      { name: 'Reduced GST', rate: 5, categories: ['food', 'essentials'] },
      { name: 'Zero GST', rate: 0, categories: ['exempt'] }
    ]
  }));
});

module.exports = router;
