// Account Types routes

const express = require('express');
const { z } = require('zod');
const router = express.Router();
const { getTenantId } = require('../middleware/auth');
const { accountTypeService } = require('../services');

// ============================================
// VALIDATION SCHEMAS
// ============================================

const AccountTypeSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  category: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
  normal_balance: z.enum(['debit', 'credit']),
  description: z.string().optional(),
  display_order: z.number().int().optional(),
});

// ============================================
// ROUTES
// ============================================

// List account types
router.get('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const accountTypes = await accountTypeService.listAccountTypes(tenantId);
    res.json({ success: true, account_types: accountTypes });
  } catch (error) {
    next(error);
  }
});

// Create account type
router.post('/', async (req, res, next) => {
  try {
    const parsed = AccountTypeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors });
    }

    const tenantId = getTenantId(req);
    const accountType = await accountTypeService.createAccountType(tenantId, parsed.data);
    res.status(201).json({ success: true, account_type: accountType });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Account type code already exists' });
    }
    next(error);
  }
});

module.exports = router;
