/**
 * Authentication & Authorization Middleware
 * Lightweight session-based auth for accounting lite
 */
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

let _query, _run, _get;

function initAuth(dbFns) {
  _query = dbFns.query;
  _run = dbFns.run;
  _get = dbFns.get;
  seedDefaultRoles();
  seedDefaultAdmin();
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

function seedDefaultRoles() {
  const roles = [
    { id: 'role_admin', name: 'Admin', desc: 'Full access to all modules', perms: { '*': ['read','write','update','delete','admin'] }, sys: 1 },
    { id: 'role_accountant', name: 'Accountant', desc: 'Full accounting access', perms: { '*': ['read','write','update'] }, sys: 1 },
    { id: 'role_viewer', name: 'Viewer', desc: 'Read-only access', perms: { '*': ['read'] }, sys: 1 },
    { id: 'role_ap_clerk', name: 'AP Clerk', desc: 'Accounts Payable access', perms: { accounts_payable: ['read','write','update'], chart_of_accounts: ['read'], journal_entries: ['read'] }, sys: 1 },
    { id: 'role_ar_clerk', name: 'AR Clerk', desc: 'Accounts Receivable access', perms: { accounts_receivable: ['read','write','update'], chart_of_accounts: ['read'], journal_entries: ['read'] }, sys: 1 }
  ];
  roles.forEach(r => {
    const exists = _get('SELECT id FROM acc_roles WHERE id = ?', [r.id]);
    if (!exists) {
      _run('INSERT INTO acc_roles (id, name, description, permissions, is_system) VALUES (?, ?, ?, ?, ?)',
        [r.id, r.name, r.desc, JSON.stringify(r.perms), r.sys]);
    }
  });
}

function seedDefaultAdmin() {
  const exists = _get('SELECT id FROM acc_users WHERE username = ?', ['admin']);
  if (!exists) {
    const id = uuidv4();
    _run('INSERT INTO acc_users (id, username, email, password_hash, full_name) VALUES (?, ?, ?, ?, ?)',
      [id, 'admin', 'admin@localhost', hashPassword('admin123'), 'Administrator']);
    _run('INSERT OR IGNORE INTO acc_user_roles (user_id, role_id) VALUES (?, ?)', [id, 'role_admin']);
  }
}

function login(username, password, ip) {
  const user = _get('SELECT * FROM acc_users WHERE username = ? AND is_active = 1', [username]);
  if (!user) return { success: false, error: 'Invalid credentials' };
  if (!verifyPassword(password, user.password_hash)) return { success: false, error: 'Invalid credentials' };

  const token = generateToken();
  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  _run('INSERT INTO acc_sessions (id, user_id, token, expires_at, ip_address) VALUES (?, ?, ?, ?, ?)',
    [sessionId, user.id, token, expiresAt, ip || '']);
  _run('UPDATE acc_users SET last_login = datetime(\'now\') WHERE id = ?', [user.id]);

  const roles = _query('SELECT r.* FROM acc_roles r JOIN acc_user_roles ur ON r.id = ur.role_id WHERE ur.user_id = ?', [user.id]);

  return {
    success: true,
    data: {
      token,
      expires_at: expiresAt,
      user: { id: user.id, username: user.username, email: user.email, full_name: user.full_name },
      roles: roles.map(r => ({ id: r.id, name: r.name, permissions: JSON.parse(r.permissions || '{}') }))
    }
  };
}

function logout(token) {
  _run('DELETE FROM acc_sessions WHERE token = ?', [token]);
  return { success: true };
}

function validateSession(token) {
  if (!token) return null;
  const session = _get('SELECT s.*, u.username, u.email, u.full_name FROM acc_sessions s JOIN acc_users u ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > datetime(\'now\') AND u.is_active = 1', [token]);
  if (!session) return null;
  return { id: session.user_id, username: session.username, email: session.email, full_name: session.full_name };
}

// Express middleware - optional auth (sets req.user if token present)
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const user = validateSession(token);
    if (user) req.user = user;
  }
  next();
}

// Express middleware - require auth
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  next();
}

function cleanupSessions() {
  _run("DELETE FROM acc_sessions WHERE expires_at < datetime('now')");
}

module.exports = { initAuth, login, logout, validateSession, authMiddleware, requireAuth, hashPassword, verifyPassword, generateToken, cleanupSessions };
