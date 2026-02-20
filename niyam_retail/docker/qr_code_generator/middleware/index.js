// Middleware for QR Code Generator

const { SKIP_AUTH, JWT_SECRET, DEFAULT_TENANT_ID, DEFAULT_USER_ID } = require('../config/constants');

// Authentication middleware
function authenticate(req, res, next) {
  if (SKIP_AUTH) {
    req.tenantId = req.headers['x-tenant-id'] || DEFAULT_TENANT_ID;
    req.userId = DEFAULT_USER_ID;
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing authorization header' });
  }

  try {
    const jwt = require('jsonwebtoken');
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    req.tenantId = decoded.tenantId || DEFAULT_TENANT_ID;
    req.userId = decoded.userId || decoded.sub || DEFAULT_USER_ID;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
}

// Request logger middleware
function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[QR] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
}

// Metrics handler (placeholder for Prometheus)
function metricsHandler(req, res) {
  res.set('Content-Type', 'text/plain');
  res.send('# QR Code Generator Metrics\n');
}

// Error handler middleware
function errorHandler(err, req, res, next) {
  console.error('[QR] Error:', err.message);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
}

module.exports = {
  authenticate,
  requestLogger,
  metricsHandler,
  errorHandler
};
