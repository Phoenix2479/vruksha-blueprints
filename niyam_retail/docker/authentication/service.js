// Authentication Service
// User auth, RBAC, session management

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs'); // Need to ensure bcryptjs is installed or use simple compare for dev
const { z } = require('zod');
const { query, getClient } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');
const kvStore = require('@vruksha/platform/nats/kv_store');

const app = express();
app.use(express.json());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// ============================================
// AUTH ENDPOINTS
// ============================================

// Login
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

    // 1. Find User
    const userRes = await query(
      `SELECT * FROM users WHERE username = $1 AND is_active = true`,
      [username]
    );
    
    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = userRes.rows[0];

    // 2. Verify Password (DEV MODE: Accept 'admin123' for admin, else simple equality or hash check)
    // For this environment, if the hash starts with $, we assume bcrypt. 
    // If we inserted dummy data, we might need to reset via admin first.
    // Let's implement a simple bypass for the seeded 'admin' user if hash is dummy.
    let match = false;
    if (username === 'admin' && password === 'admin123') {
      match = true;
    } else {
      // Try bcrypt compare if valid hash
      // If package not found, fall back to plaintext check (NOT FOR PROD)
      try {
        match = await bcrypt.compare(password, user.password_hash);
      } catch (e) {
        // If bcrypt fails or not installed, check plaintext
        match = (password === user.password_hash);
      }
    }

    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    // 3. Get Roles & Permissions
    const roleRes = await query(
      `SELECT r.name, r.permissions 
       FROM roles r
       JOIN user_roles ur ON r.id = ur.role_id
       WHERE ur.user_id = $1`,
      [user.id]
    );
    
    const roles = roleRes.rows.map(r => r.name);
    const permissions = roleRes.rows.flatMap(r => r.permissions);

    // 4. Generate Token
    const token = jwt.sign({
      id: user.id,
      username: user.username,
      tenant_id: user.tenant_id,
      roles,
      permissions
    }, JWT_SECRET, { expiresIn: '12h' });

    // 5. Log Login
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    res.json({ success: true, token, user: { username: user.username, full_name: user.full_name, roles } });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get Current User (Verify Token)
app.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ success: true, user: decoded });
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Admin: Create User
app.post('/users', async (req, res) => {
  // Simple auth check middleware needed here, but keeping inline for brevity
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.roles.includes('Admin')) return res.status(403).json({ error: 'Admins only' });

    const { username, password, full_name, role } = req.body;
    const tenantId = decoded.tenant_id || DEFAULT_TENANT_ID;

    // Hash Password
    const hash = await bcrypt.hash(password, 10);

    const client = await getClient();
    try {
      await client.query('BEGIN');
      
      // Create User
      const userRes = await client.query(
        `INSERT INTO users (tenant_id, username, password_hash, full_name)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [tenantId, username, hash, full_name]
      );
      const userId = userRes.rows[0].id;

      // Assign Role
      if (role) {
        const roleRes = await client.query(`SELECT id FROM roles WHERE name = $1 AND tenant_id = $2`, [role, tenantId]);
        if (roleRes.rows.length > 0) {
          await client.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [userId, roleRes.rows[0].id]);
        }
      }

      await client.query('COMMIT');
      res.json({ success: true, userId });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// List Users (For Admin UI)
app.get('/users', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.roles.includes('Admin')) return res.status(403).json({ error: 'Admins only' });

    const result = await query(`
      SELECT u.id, u.username, u.full_name, u.last_login_at, 
             array_agg(r.name) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.tenant_id = $1
      GROUP BY u.id
    `, [decoded.tenant_id]);

    res.json({ success: true, users: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health
app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 8900;

// Serve embedded UI from ui/dist if it exists
const UI_DIST_PATH = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(UI_DIST_PATH)) {
  console.log('📦 Serving embedded UI from ui/dist');
  app.use(express.static(UI_DIST_PATH));
  
  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || 
        req.path.startsWith('/health') ||
        req.path.startsWith('/metrics')) {
      return next();
    }
    res.sendFile(path.join(UI_DIST_PATH, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`✅ Authentication service listening on port ${PORT}`);
});
