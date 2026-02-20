const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, query, run, get } = require('../shared/db');
const { notifyAccounting } = require('../shared/accounting-hook');

const app = express();
const PORT = process.env.PORT || 9160;
app.use(cors());
app.use(express.json());
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) app.use(express.static(uiPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'abandoned_cart_recovery', mode: 'lite' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'abandoned_cart_recovery' }));
app.get('/readyz', (req, res) => res.json({ status: 'ok', service: 'abandoned_cart_recovery', ready: true }));

// ── Abandoned Carts ─────────────────────────────────────────────

// List abandoned carts
app.get('/abandoned', (req, res) => {
  try {
    const { status, customer_id, from_date, to_date, min_total, limit = 100 } = req.query;
    let sql = 'SELECT * FROM abandoned_carts WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND recovery_status = ?'; params.push(status); }
    if (customer_id) { sql += ' AND customer_id = ?'; params.push(customer_id); }
    if (from_date) { sql += ' AND abandoned_at >= ?'; params.push(from_date); }
    if (to_date) { sql += ' AND abandoned_at <= ?'; params.push(to_date); }
    if (min_total) { sql += ' AND cart_total >= ?'; params.push(parseFloat(min_total)); }
    sql += ' ORDER BY abandoned_at DESC LIMIT ?';
    params.push(parseInt(limit));
    const carts = query(sql, params);
    res.json({ success: true, data: carts });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get abandoned cart stats
app.get('/abandoned/stats', (req, res) => {
  try {
    const total = get("SELECT COUNT(*) as count FROM abandoned_carts") || { count: 0 };
    const recovered = get("SELECT COUNT(*) as count FROM abandoned_carts WHERE recovery_status = 'recovered'") || { count: 0 };
    const pending = get("SELECT COUNT(*) as count FROM abandoned_carts WHERE recovery_status = 'pending'") || { count: 0 };
    const totalValue = get("SELECT COALESCE(SUM(cart_total), 0) as total FROM abandoned_carts") || { total: 0 };
    const recoveredValue = get("SELECT COALESCE(SUM(cart_total), 0) as total FROM abandoned_carts WHERE recovery_status = 'recovered'") || { total: 0 };
    const attempts = get("SELECT COUNT(*) as count FROM recovery_attempts") || { count: 0 };
    const converted = get("SELECT COUNT(*) as count FROM recovery_attempts WHERE status = 'converted'") || { count: 0 };

    const totalCount = total.count || 0;
    const recoveredCount = recovered.count || 0;
    const totalAttempts = attempts.count || 0;
    const convertedCount = converted.count || 0;

    res.json({
      success: true,
      data: {
        total_abandoned: totalCount,
        total_recovered: recoveredCount,
        total_pending: pending.count || 0,
        recovery_rate: totalCount > 0 ? Math.round((recoveredCount / totalCount) * 100 * 100) / 100 : 0,
        total_abandoned_value: totalValue.total || 0,
        total_recovered_value: recoveredValue.total || 0,
        total_attempts: totalAttempts,
        conversion_rate: totalAttempts > 0 ? Math.round((convertedCount / totalAttempts) * 100 * 100) / 100 : 0
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get single abandoned cart
app.get('/abandoned/:id', (req, res) => {
  try {
    const cart = get('SELECT * FROM abandoned_carts WHERE id = ?', [req.params.id]);
    if (!cart) return res.status(404).json({ success: false, error: 'Abandoned cart not found' });
    res.json({ success: true, data: cart });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Create abandoned cart
app.post('/abandoned', (req, res) => {
  try {
    const { cart_id, customer_id, customer_email, cart_total, items_count, abandoned_at } = req.body;
    if (!cart_id) return res.status(400).json({ success: false, error: 'cart_id is required' });

    const id = uuidv4();
    run(`INSERT INTO abandoned_carts (id, cart_id, customer_id, customer_email, cart_total, items_count, abandoned_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, cart_id, customer_id || null, customer_email || null, cart_total || 0, items_count || 0, abandoned_at || new Date().toISOString()]);

    res.status(201).json({ success: true, data: { id, cart_id, recovery_status: 'pending' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Mark as recovered
app.post('/abandoned/:id/recovered', (req, res) => {
  try {
    const { order_id } = req.body;
    if (!order_id) return res.status(400).json({ success: false, error: 'order_id is required' });

    const cart = get('SELECT * FROM abandoned_carts WHERE id = ?', [req.params.id]);
    if (!cart) return res.status(404).json({ success: false, error: 'Abandoned cart not found' });

    run("UPDATE abandoned_carts SET recovery_status = 'recovered', recovered_at = ?, recovered_order_id = ? WHERE id = ?",
      [new Date().toISOString(), order_id, req.params.id]);

    res.json({ success: true, data: { message: 'Cart marked as recovered' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Recovery ────────────────────────────────────────────────────

// Trigger recovery
app.post('/recovery/trigger', (req, res) => {
  try {
    const { abandoned_cart_id, template_id } = req.body;
    if (!abandoned_cart_id) return res.status(400).json({ success: false, error: 'abandoned_cart_id is required' });

    const cart = get('SELECT * FROM abandoned_carts WHERE id = ?', [abandoned_cart_id]);
    if (!cart) return res.status(404).json({ success: false, error: 'Abandoned cart not found' });
    if (cart.recovery_status === 'recovered') return res.status(400).json({ success: false, error: 'Cart already recovered' });

    let template = null;
    if (template_id) {
      template = get('SELECT * FROM recovery_templates WHERE id = ?', [template_id]);
    } else {
      template = get('SELECT * FROM recovery_templates WHERE is_active = 1 ORDER BY delay_hours ASC LIMIT 1');
    }
    if (!template) return res.status(400).json({ success: false, error: 'No recovery template available' });

    // Render template
    const cartUrl = `${process.env.STORE_URL || 'https://store.example.com'}/cart/recover/${cart.cart_id}`;
    const renderedSubject = (template.subject || '').replace(/\{\{customer_name\}\}/g, cart.customer_email || 'Valued Customer').replace(/\{\{cart_url\}\}/g, cartUrl);
    const renderedBody = (template.body || '')
      .replace(/\{\{customer_name\}\}/g, cart.customer_email || 'Valued Customer')
      .replace(/\{\{cart_url\}\}/g, cartUrl)
      .replace(/\{\{cart_total\}\}/g, String(cart.cart_total))
      .replace(/\{\{items_count\}\}/g, String(cart.items_count));

    const attemptId = uuidv4();
    run(`INSERT INTO recovery_attempts (id, abandoned_cart_id, channel, template_id, status) VALUES (?, ?, ?, ?, 'sent')`,
      [attemptId, abandoned_cart_id, template.channel || 'email', template.id]);

    run("UPDATE abandoned_carts SET recovery_status = 'attempted', recovery_attempts = recovery_attempts + 1, last_attempt_at = ? WHERE id = ?",
      [new Date().toISOString(), abandoned_cart_id]);

    res.status(201).json({
      success: true,
      data: {
        attempt: { id: attemptId, status: 'sent', channel: template.channel },
        rendered: { subject: renderedSubject, body: renderedBody, channel: template.channel || 'email' }
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Track attempt
app.post('/recovery/attempts/:id/track', (req, res) => {
  try {
    const { action } = req.body;
    const validActions = ['opened', 'clicked', 'converted'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ success: false, error: `Invalid action. Must be: ${validActions.join(', ')}` });
    }

    const attempt = get('SELECT * FROM recovery_attempts WHERE id = ?', [req.params.id]);
    if (!attempt) return res.status(404).json({ success: false, error: 'Recovery attempt not found' });

    const column = `${action}_at`;
    run(`UPDATE recovery_attempts SET ${column} = ?, status = ? WHERE id = ?`,
      [new Date().toISOString(), action === 'converted' ? 'converted' : 'sent', req.params.id]);

    if (action === 'converted') {
      run("UPDATE abandoned_carts SET recovery_status = 'recovered', recovered_at = ? WHERE id = ?",
        [new Date().toISOString(), attempt.abandoned_cart_id]);
    }

    res.json({ success: true, data: { message: `Attempt marked as ${action}` } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// List attempts for cart
app.get('/recovery/attempts/:abandoned_cart_id', (req, res) => {
  try {
    const attempts = query(
      `SELECT ra.*, rt.name as template_name FROM recovery_attempts ra
       LEFT JOIN recovery_templates rt ON rt.id = ra.template_id
       WHERE ra.abandoned_cart_id = ? ORDER BY ra.sent_at DESC`,
      [req.params.abandoned_cart_id]);
    res.json({ success: true, data: attempts });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Templates ───────────────────────────────────────────────────

// List templates
app.get('/templates', (req, res) => {
  try {
    const { active_only } = req.query;
    let sql = 'SELECT * FROM recovery_templates WHERE 1=1';
    const params = [];
    if (active_only === 'true') { sql += ' AND is_active = 1'; }
    sql += ' ORDER BY delay_hours ASC, created_at DESC';
    const templates = query(sql, params);
    res.json({ success: true, data: templates });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get template
app.get('/templates/:id', (req, res) => {
  try {
    const template = get('SELECT * FROM recovery_templates WHERE id = ?', [req.params.id]);
    if (!template) return res.status(404).json({ success: false, error: 'Template not found' });
    res.json({ success: true, data: template });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Create template
app.post('/templates', (req, res) => {
  try {
    const { name, channel, subject, body, delay_hours, is_active } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'name is required' });

    const id = uuidv4();
    run(`INSERT INTO recovery_templates (id, name, channel, subject, body, delay_hours, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, name, channel || 'email', subject || '', body || '', delay_hours || 1, is_active !== false ? 1 : 0]);

    res.status(201).json({ success: true, data: { id, name, channel: channel || 'email' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Update template
app.put('/templates/:id', (req, res) => {
  try {
    const existing = get('SELECT * FROM recovery_templates WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Template not found' });

    const { name, channel, subject, body, delay_hours, is_active } = req.body;
    run(`UPDATE recovery_templates SET name = ?, channel = ?, subject = ?, body = ?, delay_hours = ?, is_active = ? WHERE id = ?`,
      [
        name !== undefined ? name : existing.name,
        channel !== undefined ? channel : existing.channel,
        subject !== undefined ? subject : existing.subject,
        body !== undefined ? body : existing.body,
        delay_hours !== undefined ? delay_hours : existing.delay_hours,
        is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
        req.params.id
      ]);

    res.json({ success: true, data: { message: 'Template updated' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Delete template
app.delete('/templates/:id', (req, res) => {
  try {
    const existing = get('SELECT * FROM recovery_templates WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Template not found' });
    run('DELETE FROM recovery_templates WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: { message: 'Template deleted' } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('*', (req, res) => {
  const indexPath = path.join(uiPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ service: 'abandoned_cart_recovery', mode: 'lite', status: 'running' });
});

initDb().then(() => app.listen(PORT, () => console.log(`[Abandoned Cart Recovery Lite] Running on http://localhost:${PORT}`))).catch(e => { console.error(e); process.exit(1); });
