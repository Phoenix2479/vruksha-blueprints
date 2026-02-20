// Route handlers for Purchase Orders domain

const express = require('express');
const router = express.Router();
const { getTenantId } = require('../middleware/auth');
const purchaseOrdersService = require('../services/purchaseOrdersService');

// --- List POs ---

router.get('/api/purchase-orders', async (req, res, next) => {
  try {
    const result = await purchaseOrdersService.listPurchaseOrders(getTenantId(req), req.query);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/api/purchase-orders/pending', async (req, res, next) => {
  try {
    const result = await purchaseOrdersService.listPendingPurchaseOrders(getTenantId(req));
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/api/purchase-orders/csv', async (req, res, next) => {
  try {
    const csvGen = require('../../shared/csv-generator');
    const rows = await purchaseOrdersService.listPurchaseOrdersCsv(getTenantId(req));
    csvGen.sendCSV(res, rows, null, 'purchase-orders.csv');
  } catch (err) { next(err); }
});

router.get('/api/purchase-orders/report', async (req, res, next) => {
  try {
    const result = await purchaseOrdersService.getPurchaseOrdersReport(getTenantId(req));
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// --- Create PO ---

router.post('/api/purchase-orders', async (req, res, next) => {
  try {
    const { vendor_id, items } = req.body;
    if (!vendor_id || !items || !items.length) return res.status(400).json({ error: 'vendor_id and items required' });
    const result = await purchaseOrdersService.createPurchaseOrder(getTenantId(req), req.body);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

// --- Get PO ---

router.get('/api/purchase-orders/:id', async (req, res, next) => {
  try {
    const result = await purchaseOrdersService.getPurchaseOrder(getTenantId(req), req.params.id);
    if (!result) return res.status(404).json({ error: 'PO not found' });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// --- Update PO ---

router.put('/api/purchase-orders/:id', async (req, res, next) => {
  try {
    const result = await purchaseOrdersService.updatePurchaseOrder(getTenantId(req), req.params.id, req.body);
    if (result.error === 'not_found') return res.status(404).json({ error: 'PO not found' });
    if (result.error === 'not_draft') return res.status(400).json({ error: 'Only draft POs can be edited' });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// --- Submit / Approve / Receive / Convert ---

router.post('/api/purchase-orders/:id/submit', async (req, res, next) => {
  try {
    const result = await purchaseOrdersService.submitPurchaseOrder(getTenantId(req), req.params.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/api/purchase-orders/:id/approve', async (req, res, next) => {
  try {
    const result = await purchaseOrdersService.approvePurchaseOrder(getTenantId(req), req.params.id, req.body.approved_by);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/api/purchase-orders/:id/receive', async (req, res, next) => {
  try {
    const result = await purchaseOrdersService.receivePurchaseOrder(getTenantId(req), req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'PO not found' });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/api/purchase-orders/:id/convert-to-bill', async (req, res, next) => {
  try {
    const result = await purchaseOrdersService.convertToBill(getTenantId(req), req.params.id);
    if (!result) return res.status(404).json({ error: 'PO not found' });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/api/purchase-orders/:id/receipts', async (req, res, next) => {
  try {
    const result = await purchaseOrdersService.listReceipts(getTenantId(req), req.params.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.delete('/api/purchase-orders/:id', async (req, res, next) => {
  try {
    const result = await purchaseOrdersService.deletePurchaseOrder(getTenantId(req), req.params.id);
    if (result.error === 'not_draft') return res.status(400).json({ error: 'Only draft POs can be deleted' });
    res.json({ success: true, message: 'PO deleted' });
  } catch (err) { next(err); }
});

// --- Vendor lookup ---

router.get('/api/vendors', async (req, res, next) => {
  try {
    const result = await purchaseOrdersService.listVendors(getTenantId(req));
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

module.exports = router;
