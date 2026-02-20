// Routes barrel - mounts all route modules

const healthRoutes = require('./health');
const accountRoutes = require('./accounts');
const accountTypeRoutes = require('./accountTypes');
const { getTenantId } = require('../middleware/auth');
const { accountService } = require('../services');

function mountRoutes(app) {
  // Health routes (top-level)
  app.use(healthRoutes);

  // Account types
  app.use('/account-types', accountTypeRoutes);

  // Accounts
  app.use('/accounts', accountRoutes);

  // Trial balance (top-level)
  app.get('/trial-balance', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const { as_of_date, show_zero } = req.query;
      const trialBalance = await accountService.getTrialBalance(tenantId, { as_of_date, show_zero });
      res.json({ success: true, trial_balance: trialBalance });
    } catch (error) {
      next(error);
    }
  });

  // Search (top-level)
  app.get('/search', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const { q, limit = 20 } = req.query;

      if (!q || q.length < 2) {
        return res.status(400).json({ error: 'Search query must be at least 2 characters' });
      }

      const accounts = await accountService.searchAccounts(tenantId, q, limit);
      res.json({ success: true, accounts });
    } catch (error) {
      next(error);
    }
  });

  // Postable accounts (top-level)
  app.get('/postable-accounts', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const { category } = req.query;
      const accounts = await accountService.getPostableAccounts(tenantId, category);
      res.json({ success: true, accounts });
    } catch (error) {
      next(error);
    }
  });

  // Export (top-level)
  app.get('/export', async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const accounts = await accountService.exportAccounts(tenantId);
      res.json({ success: true, accounts, exported_at: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  });

  // Import (top-level)
  app.post('/import', async (req, res, next) => {
    try {
      const { accounts } = req.body;

      if (!Array.isArray(accounts) || accounts.length === 0) {
        return res.status(400).json({ error: 'Accounts array is required' });
      }

      const tenantId = getTenantId(req);
      const results = await accountService.importAccounts(tenantId, accounts);
      res.json({ success: true, results });
    } catch (error) {
      next(error);
    }
  });

  // Top-level CSV/PDF export
  app.get('/export/csv', async (req, res, next) => {
    try {
      const csvGen = require('../../shared/csv-generator');
      const tenantId = getTenantId(req);
      const rows = await accountService.getAccountsForCSV(tenantId);
      csvGen.sendCSV(res, rows, null, 'chart-of-accounts.csv');
    } catch (e) { next(e); }
  });

  app.get('/export/pdf', async (req, res, next) => {
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
}

module.exports = { mountRoutes };
