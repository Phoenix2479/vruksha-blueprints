// Authentication and authorization middleware

const jwt = require('jsonwebtoken');
const { SKIP_AUTH, JWT_SECRET, DEFAULT_TENANT_ID } = require('../config/constants');

function getTenantId(req) {
  const t = req.headers['x-tenant-id'];
  if (typeof t === 'string' && t.trim()) return t.trim();
  return DEFAULT_TENANT_ID;
}

function getUserId(req) {
  if (req.user && req.user.sub) return req.user.sub;
  if (req.user && req.user.user_id) return req.user.user_id;
  return null;
}

function authenticate(req, _res, next) {
  if (SKIP_AUTH) return next();
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    req.user = decoded;
  } catch (_) {
    // ignore invalid token for non-protected routes
  }
  next();
}

function requireAnyRole(roles) {
  return (req, res, next) => {
    if (SKIP_AUTH) return next();
    if (!req.user || !Array.isArray(req.user.roles)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const has = req.user.roles.some(r => roles.includes(r));
    if (!has) return res.status(403).json({ error: 'Forbidden' });

    // tenant consistency check
    const tokenTenant = req.user.tenant_id;
    const headerTenant = getTenantId(req);
    if (tokenTenant && headerTenant && tokenTenant !== headerTenant) {
      return res.status(403).json({ error: 'Tenant mismatch' });
    }
    next();
  };
}

module.exports = {
  getTenantId,
  getUserId,
  authenticate,
  requireAnyRole
};
