// Voucher Entry route handlers
// Delegates all business logic to vouchersService

const express = require('express');
const router = express.Router();
const { getTenantId } = require('../middleware/auth');
const { vouchersService } = require('../services');

// ─── Voucher Types ──────────────────────────────────────────────────

router.get('/api/voucher-types', (_req, res) => {
  res.json({ success: true, data: vouchersService.getVoucherTypes() });
});

// ─── Vouchers ───────────────────────────────────────────────────────

router.get('/api/vouchers', async (req, res, next) => {
  try {
    const data = await vouchersService.listVouchers(getTenantId(req), req.query);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/api/vouchers/export/csv', async (req, res, next) => {
  try {
    const csvGen = require('../../shared/csv-generator');
    const rows = await vouchersService.listVouchersForExport(getTenantId(req));
    csvGen.sendCSV(res, rows, null, 'vouchers.csv');
  } catch (e) { next(e); }
});

router.get('/api/vouchers/export/pdf', async (req, res, next) => {
  try {
    const pdfGen = require('../../shared/pdf-generator');
    const rows = await vouchersService.listVouchersForExport(getTenantId(req));
    pdfGen.sendLandscapePDF(res, (doc) => {
      pdfGen.addHeader(doc, 'Voucher Register');
      const cols = [
        { key: 'voucher_number', label: 'Number' },
        { key: 'voucher_type', label: 'Type' },
        { key: 'voucher_date', label: 'Date', formatter: v => String(v || '').slice(0,10) },
        { key: 'amount', label: 'Amount', align: 'right', formatter: v => pdfGen.fmtCurrency(v) },
        { key: 'status', label: 'Status' }
      ];
      pdfGen.addTable(doc, cols, rows);
    }, 'vouchers.pdf');
  } catch (e) { next(e); }
});

router.get('/api/vouchers/:id', async (req, res, next) => {
  try {
    const data = await vouchersService.getVoucher(getTenantId(req), req.params.id);
    if (!data) return res.status(404).json({ error: 'Voucher not found' });
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.post('/api/vouchers', async (req, res, next) => {
  try {
    const { voucher_type, voucher_date } = req.body;
    if (!voucher_type || !voucher_date) return res.status(400).json({ error: 'voucher_type and voucher_date required' });
    const data = await vouchersService.createVoucher(getTenantId(req), req.body);
    res.status(201).json({ success: true, data });
  } catch (e) { next(e); }
});

router.post('/api/vouchers/:id/post', async (req, res, next) => {
  try {
    const result = await vouchersService.postVoucher(getTenantId(req), req.params.id);
    if (result.notFound) return res.status(404).json({ error: 'Voucher not found' });
    if (result.notDraft) return res.status(400).json({ error: 'Only draft vouchers can be posted' });
    if (result.noLines) return res.status(400).json({ error: 'Voucher has no lines' });
    if (result.unbalanced) return res.status(400).json({ error: `Debits (${result.totalDr}) != Credits (${result.totalCr})` });
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});

router.post('/api/vouchers/:id/void', async (req, res, next) => {
  try {
    await vouchersService.voidVoucher(getTenantId(req), req.params.id);
    res.json({ success: true, message: 'Voucher voided' });
  } catch (e) { next(e); }
});

// ─── Recurring Templates ────────────────────────────────────────────

router.get('/api/recurring', async (req, res, next) => {
  try {
    const data = await vouchersService.listRecurring(getTenantId(req));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/api/recurring/:id', async (req, res, next) => {
  try {
    const data = await vouchersService.getRecurring(getTenantId(req), req.params.id);
    if (!data) return res.status(404).json({ error: 'Template not found' });
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.post('/api/recurring', async (req, res, next) => {
  try {
    const { name, voucher_type, frequency, start_date } = req.body;
    if (!name || !voucher_type || !frequency || !start_date) return res.status(400).json({ error: 'name, voucher_type, frequency, start_date required' });
    const data = await vouchersService.createRecurring(getTenantId(req), req.body);
    res.status(201).json({ success: true, data });
  } catch (e) { next(e); }
});

router.put('/api/recurring/:id', async (req, res, next) => {
  try {
    const data = await vouchersService.updateRecurring(getTenantId(req), req.params.id, req.body);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.delete('/api/recurring/:id', async (req, res, next) => {
  try {
    await vouchersService.deleteRecurring(getTenantId(req), req.params.id);
    res.json({ success: true, message: 'Template deleted' });
  } catch (e) { next(e); }
});

router.post('/api/recurring/:id/pause', async (req, res, next) => {
  try {
    const data = await vouchersService.pauseRecurring(getTenantId(req), req.params.id);
    if (!data) return res.status(404).json({ error: 'Template not found' });
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.post('/api/recurring/run', async (req, res, next) => {
  try {
    const data = await vouchersService.runRecurring(getTenantId(req));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/api/recurring/:id/history', async (req, res, next) => {
  try {
    const data = await vouchersService.getRecurringHistory(getTenantId(req), req.params.id);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

// ─── Reference lookups ──────────────────────────────────────────────

router.get('/api/accounts', async (req, res, next) => {
  try {
    const data = await vouchersService.listAccounts(getTenantId(req));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/api/parties', async (req, res, next) => {
  try {
    const data = await vouchersService.listParties(getTenantId(req));
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

module.exports = router;
