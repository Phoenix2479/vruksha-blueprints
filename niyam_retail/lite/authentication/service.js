const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 8882;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

// Add users table
const initAuth = async () => {
  const db = await initDb();
  run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    active INTEGER DEFAULT 1,
    last_login TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  run(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  return db;
};

const hashPassword = (password) => crypto.createHash('sha256').update(password).digest('hex');
const generateToken = () => crypto.randomBytes(32).toString('hex');

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'authentication', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'authentication' }));

// Register
app.post('/auth/register', (req, res) => {
  try {
    const { username, email, password, role = 'user' } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, error: 'Username and password required' });
    
    const existing = get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existing) return res.status(400).json({ success: false, error: 'Username or email already exists' });
    
    const id = uuidv4();
    const passwordHash = hashPassword(password);
    run('INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [id, username, email, passwordHash, role]);
    
    res.json({ success: true, user: { id, username, email, role } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Login
app.post('/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, error: 'Username and password required' });
    
    const user = get('SELECT * FROM users WHERE (username = ? OR email = ?) AND active = 1', [username, username]);
    if (!user) return res.status(401).json({ success: false, error: 'Invalid credentials' });
    
    const passwordHash = hashPassword(password);
    if (user.password_hash !== passwordHash) return res.status(401).json({ success: false, error: 'Invalid credentials' });
    
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
    const sessionId = uuidv4();
    
    run('INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)', [sessionId, user.id, token, expiresAt]);
    run('UPDATE users SET last_login = ? WHERE id = ?', [new Date().toISOString(), user.id]);
    
    res.json({
      success: true,
      token,
      expires_at: expiresAt,
      user: { id: user.id, username: user.username, email: user.email, role: user.role }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Validate token
app.post('/auth/validate', (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, error: 'Token required' });
    
    const session = get('SELECT s.*, u.username, u.email, u.role FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > ?',
      [token, new Date().toISOString()]);
    
    if (!session) return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    
    res.json({
      success: true,
      valid: true,
      user: { id: session.user_id, username: session.username, email: session.email, role: session.role }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Logout
app.post('/auth/logout', (req, res) => {
  try {
    const { token } = req.body;
    if (token) run('DELETE FROM sessions WHERE token = ?', [token]);
    res.json({ success: true, message: 'Logged out' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Change password
app.post('/auth/change-password', (req, res) => {
  try {
    const { user_id, old_password, new_password } = req.body;
    if (!user_id || !old_password || !new_password) return res.status(400).json({ success: false, error: 'user_id, old_password, new_password required' });
    
    const user = get('SELECT * FROM users WHERE id = ?', [user_id]);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    
    if (user.password_hash !== hashPassword(old_password)) return res.status(401).json({ success: false, error: 'Invalid old password' });
    
    run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hashPassword(new_password), new Date().toISOString(), user_id]);
    run('DELETE FROM sessions WHERE user_id = ?', [user_id]); // Invalidate all sessions
    
    res.json({ success: true, message: 'Password changed' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// List users (admin)
app.get('/users', (req, res) => {
  try {
    const users = query('SELECT id, username, email, role, active, last_login, created_at FROM users ORDER BY created_at DESC');
    res.json({ success: true, users });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Update user
app.put('/users/:id', (req, res) => {
  try {
    const { role, active } = req.body;
    run('UPDATE users SET role = COALESCE(?, role), active = COALESCE(?, active), updated_at = ? WHERE id = ?',
      [role, active, new Date().toISOString(), req.params.id]);
    res.json({ success: true, message: 'User updated' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'authentication', mode: 'lite', status: 'running' });
});

initAuth().then(() => app.listen(PORT, () => console.log(`[Authentication Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
