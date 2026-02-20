// Middleware barrel export

const { getTenantId, getUserId, authenticate, requireAnyRole } = require('./auth');
const { requestLogger, metricsHandler, registry } = require('./metrics');
const { errorHandler } = require('./errorHandler');

module.exports = {
  getTenantId,
  getUserId,
  authenticate,
  requireAnyRole,
  requestLogger,
  metricsHandler,
  registry,
  errorHandler
};
