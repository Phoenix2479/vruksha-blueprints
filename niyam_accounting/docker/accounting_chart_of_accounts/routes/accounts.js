// Account routes - CRUD, balance, trial balance, search, import/export

const express = require('express');
const { z } = require('zod');
const router = express.Router();
const { getTenantId } = require('../middleware/auth');
const { accountService } = require('../services');

// ============================================
// VALIDATION SCHEMAS
// ============================================

const AccountSchema = z.object({
  account_code: z.string().min(1).max(20),
  account_name: z.string().min(1).max(200),
  account_type_id: z.string().uuid().optional(),
  parent_account_id: z.string().uuid().optional().nullable(),
  description: z.string().optional(),
  is_active: z.boolean().optional(),
  is_header: z.boolean().optional(),
  is_bank_account: z.boolean().optional(),
  is_control_account: z.boolean().optional(),
  currency: z.string().length(3).optional(),
  default_tax_code: z.string().optional(),
  is_tax_applicable: z.boolean().optional(),
  opening_balance: z.number().optional(),
  opening_balance_date: z.string().optional(),
});

const AccountUpdateSchema = AccountSchema.partial();

// ============================================
// ACCOUNT CRUD
// ============================================

// List all accounts (with hierarchy)
router.get('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { type, active_only, flat } = req.query;
    const result = await accountService.listAccounts(tenantId, { type, active_only, flat });
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

// Get single account
router.get('/:account_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const account = await accountService.getAccountById(tenantId, req.params.account_id);

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({ success: true, account });
  } catch (error) {
    next(error);
  }
});

// Get account by code
router.get('/code/:account_code', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const account = await accountService.getAccountByCode(tenantId, req.params.account_code);

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({ success: true, account });
  } catch (error) {
    next(error);
  }
});

// Create account
router.post('/', async (req, res, next) => {
  try {
    const parsed = AccountSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors });
    }

    const tenantId = getTenantId(req);
    const account = await accountService.createAccount(tenantId, parsed.data);
    res.status(201).json({ success: true, account });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Account code already exists' });
    }
    next(error);
  }
});

// Update account
router.put('/:account_id', async (req, res, next) => {
  try {
    const parsed = AccountUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors });
    }

    const tenantId = getTenantId(req);
    const result = await accountService.updateAccount(tenantId, req.params.account_id, parsed.data);

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    res.json({ success: true, account: result.account });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Account code already exists' });
    }
    next(error);
  }
});

// Delete account (soft delete - deactivate)
router.delete('/:account_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const result = await accountService.deleteAccount(tenantId, req.params.account_id);

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    res.json({ success: true, message: 'Account deactivated' });
  } catch (error) {
    next(error);
  }
});

// ============================================
// ACCOUNT BALANCE
// ============================================

// Get account balance
router.get('/:account_id/balance', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { as_of_date } = req.query;
    const balance = await accountService.getAccountBalance(tenantId, req.params.account_id, as_of_date);

    if (!balance) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({ success: true, balance });
  } catch (error) {
    next(error);
  }
});

// ============================================
// CSV/PDF EXPORT
// ============================================

router.get('/export/csv', async (req, res, next) => {
  try {
    const csvGen = require('../../shared/csv-generator');
    const tenantId = getTenantId(req);
    const rows = await accountService.getAccountsForCSV(tenantId);
    csvGen.sendCSV(res, rows, null, 'chart-of-accounts.csv');
  } catch (e) { next(e); }
});

router.get('/export/pdf', async (req, res, next) => {
  try {
    const pdfGen = require('../../shared/pdf-generator');
    const tenantId = getTenantId(req);
    const rows = await accountService.getAccountsForPDF(tenantId);
    pdfGen.sendLandscapePDF(res, (doc) => {
      pdfGen.addHeader(doc, 'Chart of Accounts');
      pdfGen.addTable(doc, [
        { key: 'account_code', label: 'Code' }, { key: 'account_name', label: 'Name', width: 2 },
        { key: 'account_type', label: 'Type' }, { key: 'category', label: 'Category' },
        { key: 'is_active', label: 'Active', formatter: v => v ? 'Yes' : 'No' }
      ], rows);
    }, 'chart-of-accounts.pdf');
  } catch (e) { next(e); }
});

module.exports = router;
