// Transaction routes

const express = require('express');
const { z } = require('zod');
const { getTenantId } = require('../middleware');
const { transactionService } = require('../services');

const router = express.Router();

// Validation schemas
const AuthorizeSchema = z.object({
  order_id: z.string().uuid().optional(),
  gateway_id: z.string().uuid().optional(),
  amount: z.number().positive(),
  currency: z.string().length(3).optional().default('USD'),
  payment_method: z.string().optional().default('card'),
  metadata: z.record(z.unknown()).optional().default({})
});

const RefundSchema = z.object({
  amount: z.number().positive().optional(),
  reason: z.string().optional()
});

// List transactions
router.get('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { order_id, status, type, gateway_id, limit, offset } = req.query;
    const transactions = await transactionService.listTransactions(tenantId, {
      order_id, status, type, gateway_id, limit, offset
    });
    res.json({ success: true, data: transactions });
  } catch (error) {
    next(error);
  }
});

// Get single transaction
router.get('/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const transaction = await transactionService.getTransaction(req.params.id, tenantId);
    if (!transaction) {
      return res.status(404).json({ success: false, error: { code: 'TXN_NOT_FOUND', message: 'Transaction not found' } });
    }
    res.json({ success: true, data: transaction });
  } catch (error) {
    next(error);
  }
});

// Authorize a payment
router.post('/authorize', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = AuthorizeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parsed.error.issues } });
    }
    const transaction = await transactionService.authorize(tenantId, parsed.data);
    res.status(201).json({ success: true, data: transaction });
  } catch (error) {
    next(error);
  }
});

// Capture an authorized payment
router.post('/:id/capture', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const result = await transactionService.capture(req.params.id, tenantId);
    if (result.error) {
      return res.status(result.status).json({ success: false, error: { code: 'CAPTURE_FAILED', message: result.error } });
    }
    res.json({ success: true, data: result.transaction });
  } catch (error) {
    next(error);
  }
});

// Refund a captured payment (full or partial)
router.post('/:id/refund', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = RefundSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parsed.error.issues } });
    }
    const result = await transactionService.refund(req.params.id, tenantId, parsed.data);
    if (result.error) {
      return res.status(result.status).json({ success: false, error: { code: 'REFUND_FAILED', message: result.error } });
    }
    res.json({ success: true, data: { refund: result.transaction, original_status: result.original_status } });
  } catch (error) {
    next(error);
  }
});

// Void a pending/authorized payment
router.post('/:id/void', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const result = await transactionService.voidTransaction(req.params.id, tenantId);
    if (result.error) {
      return res.status(result.status).json({ success: false, error: { code: 'VOID_FAILED', message: result.error } });
    }
    res.json({ success: true, data: result.transaction });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
