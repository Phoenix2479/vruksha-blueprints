// Invoice routes - CRUD, posting, receipts, aging, CSV export

const express = require('express');
const { z } = require('zod');
const router = express.Router();
const { getTenantId } = require('../middleware/auth');
const { invoiceService } = require('../services');

// ============================================
// VALIDATION SCHEMAS
// ============================================

const invoiceSchema = z.object({
  customer_id: z.string().uuid(),
  invoice_number: z.string().min(1).max(50),
  invoice_date: z.string(),
  due_date: z.string(),
  reference_number: z.string().max(100).optional().nullable(),
  so_number: z.string().max(50).optional().nullable(),
  currency: z.string().length(3).default('INR'),
  exchange_rate: z.number().positive().default(1),
  revenue_account_id: z.string().uuid().optional().nullable(),
  description: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  terms_conditions: z.string().optional().nullable(),
  is_interstate: z.boolean().default(false),
  place_of_supply: z.string().max(2).optional().nullable()
});

const invoiceLineSchema = z.object({
  description: z.string().min(1),
  account_id: z.string().uuid(),
  quantity: z.number().positive().default(1),
  unit_price: z.number().min(0),
  discount_percent: z.number().min(0).max(100).default(0),
  tax_code_id: z.string().uuid().optional().nullable(),
  hsn_sac_code: z.string().max(8).optional().nullable(),
  cost_center_id: z.string().uuid().optional().nullable()
});

const receiptSchema = z.object({
  invoice_id: z.string().uuid(),
  receipt_date: z.string(),
  amount: z.number().positive(),
  payment_method: z.enum(['cash', 'cheque', 'bank_transfer', 'upi', 'card', 'other']).default('bank_transfer'),
  bank_account_id: z.string().uuid().optional().nullable(),
  reference_number: z.string().max(100).optional().nullable(),
  cheque_number: z.string().max(20).optional().nullable(),
  cheque_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  tds_deducted: z.number().min(0).default(0)
});

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ============================================
// INVOICE ROUTES
// ============================================

// List invoices
router.get('/', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const invoices = await invoiceService.listInvoices(tenantId, req.query);
  res.json({ success: true, data: invoices });
}));

// Export CSV (must be before /:id to avoid matching)
router.get('/export/csv', asyncHandler(async (req, res) => {
  const csvGen = require('../../shared/csv-generator');
  const tenantId = getTenantId(req);
  const rows = await invoiceService.getInvoicesForCSV(tenantId);
  csvGen.sendCSV(res, rows, null, 'invoices.csv');
}));

// Get single invoice with lines
router.get('/:id', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const invoice = await invoiceService.getInvoiceById(tenantId, req.params.id);

  if (!invoice) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Invoice not found' } });
  }

  res.json({ success: true, data: invoice });
}));

// Create invoice with lines
router.post('/', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const { lines, ...invoiceData } = req.body;

  const validation = invoiceSchema.safeParse(invoiceData);
  if (!validation.success) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: validation.error.message } });
  }

  const result = await invoiceService.createInvoice(tenantId, validation.data, lines, invoiceLineSchema);

  if (result.error) {
    return res.status(result.status).json({ success: false, error: result.error });
  }

  res.status(201).json({ success: true, data: result.data });
}));

// Post invoice (create journal entry)
router.post('/:id/post', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const result = await invoiceService.postInvoice(tenantId, req.params.id);

  if (result.error) {
    return res.status(result.status).json({ success: false, error: result.error });
  }

  res.json({ success: true, data: result.data });
}));

// ============================================
// RECEIPT ROUTES (mounted at /receipts from index.js)
// ============================================

const receiptRouter = express.Router();

receiptRouter.post('/', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const validation = receiptSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: validation.error.message } });
  }

  const result = await invoiceService.recordReceipt(tenantId, validation.data);

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
  const data = await invoiceService.getAgingReport(tenantId, as_of_date);
  res.json({ success: true, data });
}));

reportRouter.get('/aging/csv', asyncHandler(async (req, res) => {
  const csvGen = require('../../shared/csv-generator');
  const tenantId = getTenantId(req);
  const rows = await invoiceService.getAgingForCSV(tenantId);
  csvGen.sendCSV(res, rows, null, 'ar-aging.csv');
}));

module.exports = { invoiceRouter: router, receiptRouter, reportRouter };
