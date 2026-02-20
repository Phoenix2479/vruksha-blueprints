/**
 * Authentication & Authorization Middleware (Postgres version)
 * Session-based auth for accounting docker services
 */
const crypto = require('crypto');

let _query;

function initAuth(queryFn) {
  _query = queryFn;
}

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const verify = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return hash === verify;
}

function generateToken() {
  return crypto.randomBytes(48).toString('hex');
}

async function login(username, password, ip, tenantId) {
  const userResult = await _query(
    'SELECT * FROM acc_users WHERE username = $1 AND tenant_id = $2 AND is_active = true',
    [username, tenantId]
  );
  const user = userResult.rows[0];
  if (!user) return { success: false, error: 'Invalid credentials' };
  if (!verifyPassword(password, user.password_hash)) return { success: false, error: 'Invalid credentials' };

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await _query(
    'INSERT INTO acc_sessions (tenant_id, user_id, token, expires_at, ip_address) VALUES ($1, $2, $3, $4, $5)',
    [tenantId, user.id, token, expiresAt, ip || '']
  );
  await _query('UPDATE acc_users SET last_login = NOW() WHERE id = $1', [user.id]);

  const rolesResult = await _query(
    'SELECT r.* FROM acc_roles r JOIN acc_user_roles ur ON r.id = ur.role_id WHERE ur.user_id = $1',
    [user.id]
  );

  return {
    success: true,
    data: {
      token,
      expires_at: expiresAt,
      user: { id: user.id, username: user.username, email: user.email, full_name: user.full_name },
      roles: rolesResult.rows.map(r => ({ id: r.id, name: r.name, permissions: typeof r.permissions === 'string' ? JSON.parse(r.permissions) : r.permissions }))
    }
  };
}

async function logout(token) {
  await _query('DELETE FROM acc_sessions WHERE token = $1', [token]);
  return { success: true };
}

async function validateSession(token) {
  if (!token) return null;
  const result = await _query(
    `SELECT s.*, u.username, u.email, u.full_name
     FROM acc_sessions s JOIN acc_users u ON s.user_id = u.id
     WHERE s.token = $1 AND s.expires_at > NOW() AND u.is_active = true`,
    [token]
  );
  if (result.rows.length === 0) return null;
  const s = result.rows[0];
  return { id: s.user_id, username: s.username, email: s.email, full_name: s.full_name, tenant_id: s.tenant_id };
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    validateSession(token).then(user => {
      if (user) req.user = user;
      next();
    }).catch(() => next());
  } else {
    next();
  }
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  next();
}

async function cleanupSessions() {
  await _query('DELETE FROM acc_sessions WHERE expires_at < NOW()');
}

module.exports = { initAuth, login, logout, validateSession, authMiddleware, requireAuth, hashPassword, verifyPassword, generateToken, cleanupSessions };
