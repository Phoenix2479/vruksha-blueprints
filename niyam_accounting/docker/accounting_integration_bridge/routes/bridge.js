// Bridge routes - Manual trigger endpoints, account mappings

const express = require('express');
const router = express.Router();
const { bridgeService } = require('../services');

const DEFAULT_TENANT_ID = bridgeService.DEFAULT_TENANT_ID;

// Manual trigger endpoints (for testing/manual entries)
router.post('/trigger/invoice', async (req, res) => {
  try {
    await bridgeService.handleInvoiceCreated({ tenantId: req.headers['x-tenant-id'], payload: req.body });
    res.json({ success: true, message: 'Invoice journal entry created' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/trigger/payment', async (req, res) => {
  try {
    await bridgeService.handlePaymentReceived({ tenantId: req.headers['x-tenant-id'], payload: req.body });
    res.json({ success: true, message: 'Payment journal entry created' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/trigger/pos-sale', async (req, res) => {
  try {
    await bridgeService.handlePOSSaleCompleted({ tenantId: req.headers['x-tenant-id'], payload: req.body });
    res.json({ success: true, message: 'POS sale journal entry created' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get account mappings
router.get('/mappings', async (req, res) => {
  const tenantId = req.headers['x-tenant-id'] || DEFAULT_TENANT_ID;

  try {
    const mappings = await bridgeService.getAccountMappings(tenantId);
    res.json({ success: true, data: mappings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
