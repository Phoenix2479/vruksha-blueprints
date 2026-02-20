// Bill routes - CRUD, posting, payments, aging, CSV export

const express = require('express');
const { z } = require('zod');
const router = express.Router();
const { getTenantId } = require('../middleware/auth');
const { billService } = require('../services');

// ============================================
// VALIDATION SCHEMAS
// ============================================

const billSchema = z.object({
  vendor_id: z.string().uuid(),
  bill_number: z.string().min(1).max(50),
  bill_date: z.string(),
  due_date: z.string(),
  reference_number: z.string().max(100).optional().nullable(),
  po_number: z.string().max(50).optional().nullable(),
  currency: z.string().length(3).default('INR'),
  exchange_rate: z.number().positive().default(1),
  expense_account_id: z.string().uuid().optional().nullable(),
  description: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  is_interstate: z.boolean().default(false),
  itc_eligible: z.boolean().default(true)
});

const billLineSchema = z.object({
  description: z.string().min(1),
  account_id: z.string().uuid(),
  quantity: z.number().positive().default(1),
  unit_price: z.number().min(0),
  discount_percent: z.number().min(0).max(100).default(0),
  tax_code_id: z.string().uuid().optional().nullable(),
  hsn_sac_code: z.string().max(8).optional().nullable(),
  cost_center_id: z.string().uuid().optional().nullable()
});

const paymentSchema = z.object({
  bill_id: z.string().uuid(),
  payment_date: z.string(),
  amount: z.number().positive(),
  payment_method: z.enum(['cash', 'cheque', 'bank_transfer', 'upi', 'card', 'other']).default('bank_transfer'),
  bank_account_id: z.string().uuid().optional().nullable(),
  reference_number: z.string().max(100).optional().nullable(),
  cheque_number: z.string().max(20).optional().nullable(),
  cheque_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  tds_amount: z.number().min(0).default(0),
  tds_section: z.string().max(10).optional().nullable()
});

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ============================================
// BILL ROUTES
// ============================================

// List bills
router.get('/', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const bills = await billService.listBills(tenantId, req.query);
  res.json({ success: true, data: bills });
}));

// Export CSV (must be before /:id to avoid matching)
router.get('/export/csv', asyncHandler(async (req, res) => {
  const csvGen = require('../../shared/csv-generator');
  const tenantId = getTenantId(req);
  const rows = await billService.getBillsForCSV(tenantId);
  csvGen.sendCSV(res, rows, null, 'bills.csv');
}));

// Get single bill with lines
router.get('/:id', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const bill = await billService.getBillById(tenantId, req.params.id);

  if (!bill) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Bill not found' } });
  }

  res.json({ success: true, data: bill });
}));

// Create bill with lines
router.post('/', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const { lines, ...billData } = req.body;

  const validation = billSchema.safeParse(billData);
  if (!validation.success) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: validation.error.message } });
  }

  const result = await billService.createBill(tenantId, validation.data, lines, billLineSchema);

  if (result.error) {
    return res.status(result.status).json({ success: false, error: result.error });
  }

  res.status(201).json({ success: true, data: result.data });
}));

// Post bill (create journal entry)
router.post('/:id/post', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await billService.postBill(tenantId, req.params.id);

  if (result.error) {
    return res.status(result.status).json({ success: false, error: result.error });
  }

  res.json({ success: true, data: result.data });
}));

// ============================================
// PAYMENT ROUTES (mounted at /payments from index.js)
// ============================================

// Record payment (this will be mounted at /payments)
const paymentRouter = express.Router();

paymentRouter.post('/', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const validation = paymentSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: validation.error.message } });
  }

  const result = await billService.recordPayment(tenantId, validation.data);

  if (result.error) {
    return res.status(result.status).json({ success: false, error: result.error });
  }

  res.status(201).json({ success: true, data: result.data });
}));

// ============================================
// REPORT ROUTES (mounted at /reports from index.js)
// ============================================

const reportRouter = express.Router();

reportRouter.get('/aging', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const { as_of_date } = req.query;
  const data = await billService.getAgingReport(tenantId, as_of_date);
  res.json({ success: true, data });
}));

reportRouter.get('/aging/csv', asyncHandler(async (req, res) => {
  const csvGen = require('../../shared/csv-generator');
  const tenantId = getTenantId(req);
  const rows = await billService.getAgingForCSV(tenantId);
  csvGen.sendCSV(res, rows, null, 'ap-aging.csv');
}));

module.exports = { billRouter: router, paymentRouter, reportRouter };
