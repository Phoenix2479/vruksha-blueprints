// Journal Entries route handlers

const express = require('express');
const router = express.Router();
const { getTenantId } = require('../middleware/auth');
const journalsService = require('../services/journalsService');

// ============================================
// JOURNAL ENTRIES CRUD
// ============================================

// List journal entries
router.get('/entries', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { status, from_date, to_date, source_type, limit = 50, offset = 0 } = req.query;

    const result = await journalsService.listEntries(tenantId, { status, from_date, to_date, source_type, limit, offset });

    res.json({
      success: true,
      entries: result.entries,
      pagination: {
        total: result.total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get single journal entry with lines
router.get('/entries/:entry_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { entry_id } = req.params;

    const entry = await journalsService.getEntry(tenantId, entry_id);

    if (!entry) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }

    res.json({ success: true, entry });
  } catch (error) {
    next(error);
  }
});

// Create journal entry
router.post('/entries', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);

    const result = await journalsService.createEntry(tenantId, req.body);

    if (result.error) {
      return res.status(result.status).json({
        error: result.error,
        ...(result.details ? { details: result.details } : {})
      });
    }

    res.status(201).json({ success: true, entry: result.entry });
  } catch (error) {
    next(error);
  }
});

// Update draft journal entry
router.put('/entries/:entry_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { entry_id } = req.params;

    const result = await journalsService.updateEntry(tenantId, entry_id, req.body);

    if (result.error) {
      return res.status(result.status).json({
        error: result.error,
        ...(result.details ? { details: result.details } : {})
      });
    }

    res.json({ success: true, entry: result.entry });
  } catch (error) {
    next(error);
  }
});

// Delete draft journal entry
router.delete('/entries/:entry_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { entry_id } = req.params;

    const result = await journalsService.deleteEntry(tenantId, entry_id);

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ============================================
// POSTING & STATUS
// ============================================

// Post journal entry (calls General Ledger service)
router.post('/entries/:entry_id/post', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { entry_id } = req.params;

    const result = await journalsService.postEntry(tenantId, entry_id);

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Void a posted entry
router.post('/entries/:entry_id/void', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { entry_id } = req.params;
    const { reason } = req.body;

    const result = await journalsService.voidEntry(tenantId, entry_id, reason);

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ============================================
// AUTO-GENERATE FROM SOURCE
// ============================================

// Create journal entry from invoice/payment
router.post('/from-source', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);

    const result = await journalsService.createFromSource(tenantId, req.body);

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    res.status(201).json({
      success: true,
      entry: result.entry,
      message: 'Journal entry created from source. Post it to complete.'
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// VALIDATION
// ============================================

// Validate journal entry without saving
router.post('/validate', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { lines } = req.body;

    const result = await journalsService.validateEntry(tenantId, lines);

    res.json({
      success: true,
      valid: result.valid,
      errors: result.errors,
      warnings: result.warnings
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// CSV/PDF EXPORT ENDPOINTS
// ============================================

router.get('/entries/export/csv', async (req, res, next) => {
  try {
    const csvGen = require('../../shared/csv-generator');
    const tenantId = getTenantId(req);
    const rows = await journalsService.getEntriesCSVData(tenantId);
    csvGen.sendCSV(res, rows, null, 'journal-entries.csv');
  } catch (e) { next(e); }
});

router.get('/entries/export/pdf', async (req, res, next) => {
  try {
    const pdfGen = require('../../shared/pdf-generator');
    const tenantId = getTenantId(req);
    const rows = await journalsService.getEntriesPDFData(tenantId);
    pdfGen.sendLandscapePDF(res, (doc) => {
      pdfGen.addHeader(doc, 'Journal Entries');
      pdfGen.addTable(doc, [
        { key: 'entry_number', label: 'Number' }, { key: 'entry_date', label: 'Date', formatter: v => pdfGen.fmtDate(v) },
        { key: 'description', label: 'Description', width: 2 }, { key: 'status', label: 'Status' },
        { key: 'total_debit', label: 'Debit', align: 'right', formatter: v => pdfGen.fmtCurrency(v) },
        { key: 'total_credit', label: 'Credit', align: 'right', formatter: v => pdfGen.fmtCurrency(v) }
      ], rows);
    }, 'journal-entries.pdf');
  } catch (e) { next(e); }
});

module.exports = router;
