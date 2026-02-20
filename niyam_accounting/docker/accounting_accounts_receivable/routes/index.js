// Routes barrel - mounts all route modules

const healthRoutes = require('./health');
const customerRoutes = require('./customers');
const { invoiceRouter, receiptRouter, reportRouter } = require('./invoices');

function mountRoutes(app) {
  // Health routes (top-level)
  app.use(healthRoutes);

  // Customer routes
  app.use('/customers', customerRoutes);

  // Invoice routes
  app.use('/invoices', invoiceRouter);

  // Receipt routes
  app.use('/receipts', receiptRouter);

  // Report routes
  app.use('/reports', reportRouter);
}

module.exports = { mountRoutes };
