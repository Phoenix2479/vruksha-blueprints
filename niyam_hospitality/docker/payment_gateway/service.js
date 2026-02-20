// Payment Gateway Service
// Online payments, split billing, refunds

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const crypto = require('crypto');
const promClient = require('prom-client');

let db, sdk;
try {
  db = require('../../../../db/postgres');
  sdk = require('../../../../platform/sdk/node');
} catch (_) {
  db = { query: async () => ({ rows: [] }), getClient: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) };
  sdk = { publishEnvelope: async () => {} };
}

const { query, getClient } = db;
const { publishEnvelope } = sdk;

const app = express();
const SERVICE_NAME = 'payment_gateway';
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

const getTenantId = (req) => req.headers['x-tenant-id'] || DEFAULT_TENANT_ID;

// ============================================
// PAYMENT METHODS
// ============================================

const PAYMENT_METHODS = [
  { code: 'card', name: 'Credit/Debit Card', icon: 'credit-card' },
  { code: 'cash', name: 'Cash', icon: 'banknote' },
  { code: 'upi', name: 'UPI', icon: 'smartphone' },
  { code: 'bank_transfer', name: 'Bank Transfer', icon: 'building' },
  { code: 'wallet', name: 'Digital Wallet', icon: 'wallet' },
];

app.get('/methods', (req, res) => {
  res.json({ success: true, methods: PAYMENT_METHODS });
});

// ============================================
// GATEWAY CONFIGURATION
// ============================================

app.get('/gateways', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const result = await query(`
      SELECT id, gateway_name, gateway_type, is_active, is_default, supported_methods, created_at
      FROM payment_gateways WHERE tenant_id = $1 ORDER BY is_default DESC, gateway_name
    `, [tenantId]);
    res.json({ success: true, gateways: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/gateways', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { gateway_name, gateway_type, api_key, api_secret, merchant_id, supported_methods, settings } = req.body;
    
    const result = await query(`
      INSERT INTO payment_gateways (tenant_id, gateway_name, gateway_type, api_key, api_secret, merchant_id, supported_methods, settings, is_active, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NOW())
      RETURNING id, gateway_name, gateway_type, is_active, supported_methods
    `, [tenantId, gateway_name, gateway_type, api_key, api_secret, merchant_id, JSON.stringify(supported_methods || ['card']), JSON.stringify(settings || {})]);
    
    res.json({ success: true, gateway: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// PAYMENT PROCESSING
// ============================================

app.post('/initiate', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { booking_id, amount, currency, method, guest_email, description, return_url } = req.body;
    
    // Generate payment reference
    const paymentRef = `PAY${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    
    // Create payment record
    const result = await query(`
      INSERT INTO payments (tenant_id, payment_ref, booking_id, amount, currency, method, guest_email, description, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', NOW())
      RETURNING *
    `, [tenantId, paymentRef, booking_id, amount, currency || 'USD', method, guest_email, description]);
    
    // In production, integrate with actual gateway
    // For now, return mock checkout URL
    const checkoutUrl = `${return_url || '/payment'}?ref=${paymentRef}`;
    
    res.json({
      success: true,
      payment: result.rows[0],
      checkout_url: checkoutUrl,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/process', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { payment_ref, card_token, gateway_response } = req.body;
    
    await client.query('BEGIN');
    
    // Get payment
    const paymentRes = await client.query(`
      SELECT * FROM payments WHERE payment_ref = $1 AND tenant_id = $2 AND status = 'pending'
    `, [payment_ref, tenantId]);
    
    if (paymentRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Payment not found or already processed' });
    }
    
    const payment = paymentRes.rows[0];
    
    // Simulate gateway processing (in production, call actual gateway)
    const isSuccessful = Math.random() > 0.1; // 90% success rate for demo
    const gatewayTxnId = `GW${Date.now()}`;
    
    if (isSuccessful) {
      // Update payment
      await client.query(`
        UPDATE payments SET status = 'completed', gateway_txn_id = $1, completed_at = NOW(), gateway_response = $2
        WHERE id = $3
      `, [gatewayTxnId, JSON.stringify(gateway_response || {}), payment.id]);
      
      // Update booking if applicable
      if (payment.booking_id) {
        await client.query(`
          UPDATE hotel_bookings SET paid_amount = paid_amount + $1 WHERE id = $2
        `, [payment.amount, payment.booking_id]);
      }
      
      await client.query('COMMIT');
      
      await publishEnvelope('hospitality.payment.completed.v1', 1, { payment_id: payment.id, amount: payment.amount });
      
      res.json({
        success: true,
        status: 'completed',
        gateway_txn_id: gatewayTxnId,
      });
    } else {
      await client.query(`
        UPDATE payments SET status = 'failed', gateway_response = $1 WHERE id = $2
      `, [JSON.stringify({ error: 'Card declined' }), payment.id]);
      
      await client.query('COMMIT');
      
      res.json({ success: false, status: 'failed', error: 'Payment declined' });
    }
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

app.get('/status/:ref', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { ref } = req.params;
    
    const result = await query(`
      SELECT payment_ref, amount, currency, status, method, created_at, completed_at
      FROM payments WHERE payment_ref = $1 AND tenant_id = $2
    `, [ref, tenantId]);
    
    if (result.rowCount === 0) return res.status(404).json({ error: 'Payment not found' });
    
    res.json({ success: true, payment: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// REFUNDS
// ============================================

app.post('/refund', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { payment_id, amount, reason } = req.body;
    
    await client.query('BEGIN');
    
    const paymentRes = await client.query(`
      SELECT * FROM payments WHERE id = $1 AND tenant_id = $2 AND status = 'completed'
    `, [payment_id, tenantId]);
    
    if (paymentRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Completed payment not found' });
    }
    
    const payment = paymentRes.rows[0];
    const previouslyRefunded = parseFloat(payment.refunded_amount || 0);
    const availableForRefund = parseFloat(payment.amount) - previouslyRefunded;
    const refundAmount = amount || availableForRefund;

    if (refundAmount > availableForRefund) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: {
          code: 'REFUND_EXCEEDS_AVAILABLE',
          message: `Refund amount exceeds available balance. Original: ${payment.amount}, Already refunded: ${previouslyRefunded}, Available: ${availableForRefund}`
        }
      });
    }

    if (refundAmount <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REFUND_AMOUNT', message: 'Refund amount must be positive' }
      });
    }
    
    const refundRef = `REF${Date.now().toString(36).toUpperCase()}`;
    
    const result = await client.query(`
      INSERT INTO payment_refunds (tenant_id, payment_id, refund_ref, amount, reason, status, created_at)
      VALUES ($1, $2, $3, $4, $5, 'completed', NOW())
      RETURNING *
    `, [tenantId, payment_id, refundRef, refundAmount, reason]);
    
    // Update original payment
    await client.query(`
      UPDATE payments SET refunded_amount = COALESCE(refunded_amount, 0) + $1 WHERE id = $2
    `, [refundAmount, payment_id]);
    
    // Update booking if applicable
    if (payment.booking_id) {
      await client.query(`
        UPDATE hotel_bookings SET paid_amount = paid_amount - $1 WHERE id = $2
      `, [refundAmount, payment.booking_id]);
    }
    
    await client.query('COMMIT');
    
    await publishEnvelope('hospitality.payment.refunded.v1', 1, { refund_id: result.rows[0].id, amount: refundAmount });
    
    res.json({ success: true, refund: result.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ============================================
// SPLIT PAYMENTS
// ============================================

app.post('/split', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const { booking_id, splits } = req.body; // splits: [{ method, amount, payer_name, payer_email }]
    
    await client.query('BEGIN');
    
    const payments = [];
    for (const split of splits) {
      const paymentRef = `SPL${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      
      const result = await client.query(`
        INSERT INTO payments (tenant_id, payment_ref, booking_id, amount, currency, method, guest_email, description, is_split_payment, status, created_at)
        VALUES ($1, $2, $3, $4, 'USD', $5, $6, $7, true, 'pending', NOW())
        RETURNING *
      `, [tenantId, paymentRef, booking_id, split.amount, split.method, split.payer_email, `Split payment by ${split.payer_name}`]);
      
      payments.push(result.rows[0]);
    }
    
    await client.query('COMMIT');
    
    res.json({ success: true, payments });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ============================================
// PAYMENT HISTORY
// ============================================

app.get('/history', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { booking_id, guest_email, status, from_date, to_date, limit = 50 } = req.query;
    
    let sql = `SELECT * FROM payments WHERE tenant_id = $1`;
    const params = [tenantId];
    let idx = 2;
    
    if (booking_id) { sql += ` AND booking_id = $${idx++}`; params.push(booking_id); }
    if (guest_email) { sql += ` AND guest_email = $${idx++}`; params.push(guest_email); }
    if (status) { sql += ` AND status = $${idx++}`; params.push(status); }
    if (from_date) { sql += ` AND created_at >= $${idx++}`; params.push(from_date); }
    if (to_date) { sql += ` AND created_at <= $${idx++}`; params.push(to_date); }
    
    sql += ` ORDER BY created_at DESC LIMIT $${idx}`;
    params.push(limit);
    
    const result = await query(sql, params);
    res.json({ success: true, payments: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// SETTLEMENT REPORTS
// ============================================

app.get('/settlements', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { from_date, to_date } = req.query;
    
    const result = await query(`
      SELECT 
        DATE(completed_at) as date,
        method,
        COUNT(*) as transactions,
        SUM(amount) as gross_amount,
        SUM(COALESCE(refunded_amount, 0)) as refunds,
        SUM(amount - COALESCE(refunded_amount, 0)) as net_amount
      FROM payments
      WHERE tenant_id = $1 AND status = 'completed'
        AND completed_at >= COALESCE($2::date, NOW() - INTERVAL '30 days')
        AND completed_at <= COALESCE($3::date, NOW())
      GROUP BY DATE(completed_at), method
      ORDER BY date DESC, method
    `, [tenantId, from_date, to_date]);
    
    res.json({ success: true, settlements: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// STATS
// ============================================

app.get('/stats', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    
    const [todayRes, monthRes, pendingRes] = await Promise.all([
      query(`
        SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as amount
        FROM payments WHERE tenant_id = $1 AND status = 'completed' AND DATE(completed_at) = CURRENT_DATE
      `, [tenantId]),
      query(`
        SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as amount
        FROM payments WHERE tenant_id = $1 AND status = 'completed' AND completed_at >= DATE_TRUNC('month', NOW())
      `, [tenantId]),
      query(`SELECT COUNT(*) FROM payments WHERE tenant_id = $1 AND status = 'pending'`, [tenantId]),
    ]);
    
    res.json({
      success: true,
      stats: {
        transactions_today: parseInt(todayRes.rows[0].count),
        amount_today: parseFloat(todayRes.rows[0].amount),
        transactions_month: parseInt(monthRes.rows[0].count),
        amount_month: parseFloat(monthRes.rows[0].amount),
        pending_payments: parseInt(pendingRes.rows[0].count),
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health
app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
app.get('/readyz', (req, res) => res.json({ status: 'ready' }));


// ============================================
// SERVE EMBEDDED UI (Auto-generated)
// ============================================

const UI_DIST = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(UI_DIST)) {
  console.log('📦 Serving embedded UI from ui/dist');
  app.use(express.static(UI_DIST));
  
  // SPA fallback - serve index.html for non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || 
        req.path.startsWith('/health') ||
        req.path.startsWith('/metrics') ||
        req.path.startsWith('/readyz')) {
      return next();
    }
    res.sendFile(path.join(UI_DIST, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('<html><body style="font-family:system-ui;text-align:center;padding:2rem;"><h1>Service Running</h1><p><a href="/healthz">Health Check</a></p></body></html>');
  });
}

const PORT = process.env.PORT || 8940;
app.listen(PORT, () => console.log(`Payment Gateway Service listening on ${PORT}`));
