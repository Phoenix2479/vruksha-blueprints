// Middleware barrel export

const { getTenantId, authenticate, requireAnyRole } = require('./auth');
const { requestLogger, metricsHandler, registry } = require('./metrics');
const { errorHandler } = require('./errorHandler');

module.exports = {
  getTenantId,
  authenticate,
  requireAnyRole,
  requestLogger,
  metricsHandler,
  registry,
  errorHandler
};
