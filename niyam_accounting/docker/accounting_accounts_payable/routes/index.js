// Routes barrel - mounts all route modules

const healthRoutes = require('./health');
const vendorRoutes = require('./vendors');
const { billRouter, paymentRouter, reportRouter } = require('./bills');

function mountRoutes(app) {
  // Health routes (top-level)
  app.use(healthRoutes);

  // Vendor routes
  app.use('/vendors', vendorRoutes);

  // Bill routes
  app.use('/bills', billRouter);

  // Payment routes
  app.use('/payments', paymentRouter);

  // Report routes
  app.use('/reports', reportRouter);
}

module.exports = { mountRoutes };
