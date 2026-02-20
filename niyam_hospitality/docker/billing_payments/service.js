// Billing & Payments Service - Niyam Hospitality
// Handles guest folios, invoices, payments, and settlements

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const promClient = require('prom-client');
const { z } = require('zod');

let db, sdk, kvStore;
try {
  db = require('../../../../db/postgres');
  sdk = require('../../../../platform/sdk/node');
  kvStore = require('../../../../platform/nats/kv_store');
} catch (_) {
  db = require('@vruksha/platform/db/postgres');
  sdk = require('@vruksha/platform/sdk/node');
  kvStore = require('@vruksha/platform/nats/kv_store');
}

const { query, getClient } = db;
const { publishEnvelope } = sdk;

const app = express();
const SERVICE_NAME = 'billing_payments';
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Observability
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

// Auth
const SKIP_AUTH = (process.env.SKIP_AUTH || 'true').toLowerCase() === 'true';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

app.use((req, res, next) => {
  if (SKIP_AUTH) return next();
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try { req.user = jwt.verify(token, JWT_SECRET); } catch (e) {}
  }
  next();
});

function getTenantId(req) {
  return req.headers['x-tenant-id'] || req.user?.tenant_id || DEFAULT_TENANT_ID;
}

// NATS KV
let dbReady = false;
(async () => {
  try {
    await kvStore.connect();
    console.log(`✅ ${SERVICE_NAME}: NATS KV Connected`);
    dbReady = true;
  } catch (e) {
    console.error(`❌ ${SERVICE_NAME}: NATS KV Failed`, e);
  }
})();

// ============================================
// GUEST FOLIO
// ============================================

// Get guest folio (all charges for a booking)
app.get('/folio/:booking_id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { booking_id } = req.params;
    
    // Get booking details
    const bookingRes = await query(`
      SELECT b.*, g.full_name as guest_name, g.email, g.phone,
             r.room_number, r.room_type, r.price_per_night
      FROM hotel_bookings b
      JOIN hotel_guests g ON b.guest_id = g.id
      JOIN hotel_rooms r ON b.room_id = r.id
      WHERE b.id = $1 AND b.tenant_id = $2
    `, [booking_id, tenantId]);
    
    if (bookingRes.rowCount === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    const booking = bookingRes.rows[0];
    const nights = Math.ceil((new Date(booking.check_out_date) - new Date(booking.check_in_date)) / (1000 * 60 * 60 * 24));
    
    // Build folio items
    const folioItems = [
      {
        id: 'room-charge',
        date: booking.check_in_date,
        description: `Room ${booking.room_number} (${booking.room_type}) - ${nights} night(s)`,
        category: 'accommodation',
        amount: parseFloat(booking.total_amount),
        quantity: nights
      }
    ];
    
    // Get restaurant charges linked to this room/booking
    const restaurantRes = await query(`
      SELECT id, created_at, total_amount, order_type
      FROM restaurant_orders
      WHERE tenant_id = $1 AND room_id = $2 AND payment_status = 'pending'
    `, [tenantId, booking.room_id]);
    
    restaurantRes.rows.forEach(order => {
      folioItems.push({
        id: `restaurant-${order.id}`,
        date: order.created_at,
        description: `Restaurant - ${order.order_type}`,
        category: 'food_beverage',
        amount: parseFloat(order.total_amount),
        quantity: 1
      });
    });
    
    const totalCharges = folioItems.reduce((sum, item) => sum + item.amount, 0);
    const balance = totalCharges - parseFloat(booking.paid_amount);
    
    res.json({
      success: true,
      folio: {
        booking_id,
        guest_name: booking.guest_name,
        room_number: booking.room_number,
        check_in: booking.check_in_date,
        check_out: booking.check_out_date,
        items: folioItems,
        total_charges: totalCharges,
        paid_amount: parseFloat(booking.paid_amount),
        balance: balance,
        payment_status: booking.payment_status
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// PAYMENTS
// ============================================

const PaymentSchema = z.object({
  booking_id: z.string().uuid(),
  amount: z.number().positive(),
  payment_method: z.enum(['cash', 'card', 'upi', 'bank_transfer', 'room_charge']),
  reference: z.string().optional(),
  notes: z.string().optional()
});

app.post('/payments', async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = getTenantId(req);
    const parsed = PaymentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    
    const { booking_id, amount, payment_method, reference, notes } = parsed.data;
    
    await client.query('BEGIN');
    
    // Get current booking
    const bookingRes = await client.query(`
      SELECT total_amount, paid_amount FROM hotel_bookings
      WHERE id = $1 AND tenant_id = $2
    `, [booking_id, tenantId]);
    
    if (bookingRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    const booking = bookingRes.rows[0];
    const newPaidAmount = parseFloat(booking.paid_amount) + amount;
    const totalAmount = parseFloat(booking.total_amount);
    
    let paymentStatus = 'partial';
    if (newPaidAmount >= totalAmount) {
      paymentStatus = 'paid';
    } else if (newPaidAmount === 0) {
      paymentStatus = 'pending';
    }
    
    // Update booking
    await client.query(`
      UPDATE hotel_bookings 
      SET paid_amount = $1, payment_status = $2, payment_method = $3, updated_at = NOW()
      WHERE id = $4
    `, [newPaidAmount, paymentStatus, payment_method, booking_id]);
    
    await client.query('COMMIT');
    
    await publishEnvelope('hospitality.billing.payment_received.v1', 1, {
      booking_id,
      amount,
      payment_method,
      payment_date: new Date().toISOString(),
      new_balance: totalAmount - newPaidAmount,
      total_amount: totalAmount,
      paid_amount: newPaidAmount,
      payment_status: paymentStatus,
      reference: reference || null,
      notes: notes || null
    });
    
    res.json({
      success: true,
      payment: {
        booking_id,
        amount_paid: amount,
        total_paid: newPaidAmount,
        total_due: totalAmount,
        balance: totalAmount - newPaidAmount,
        status: paymentStatus
      }
    });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ============================================
// INVOICES
// ============================================

app.get('/invoice/:booking_id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { booking_id } = req.params;
    
    const bookingRes = await query(`
      SELECT b.*, g.full_name, g.email, g.phone, g.address,
             r.room_number, r.room_type
      FROM hotel_bookings b
      JOIN hotel_guests g ON b.guest_id = g.id
      JOIN hotel_rooms r ON b.room_id = r.id
      WHERE b.id = $1 AND b.tenant_id = $2
    `, [booking_id, tenantId]);
    
    if (bookingRes.rowCount === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    const booking = bookingRes.rows[0];
    const nights = Math.ceil((new Date(booking.check_out_date) - new Date(booking.check_in_date)) / (1000 * 60 * 60 * 24));
    
    const invoice = {
      invoice_number: `INV-${booking_id.slice(0, 8).toUpperCase()}`,
      date: new Date().toISOString(),
      guest: {
        name: booking.full_name,
        email: booking.email,
        phone: booking.phone,
        address: booking.address
      },
      stay: {
        room_number: booking.room_number,
        room_type: booking.room_type,
        check_in: booking.check_in_date,
        check_out: booking.check_out_date,
        nights: nights
      },
      charges: {
        room_total: parseFloat(booking.total_amount),
        tax: parseFloat(booking.total_amount) * 0.12, // 12% tax
        service_charge: parseFloat(booking.total_amount) * 0.05, // 5% service
        grand_total: parseFloat(booking.total_amount) * 1.17
      },
      payment: {
        paid: parseFloat(booking.paid_amount),
        balance: parseFloat(booking.total_amount) * 1.17 - parseFloat(booking.paid_amount),
        method: booking.payment_method,
        status: booking.payment_status
      }
    };
    
    res.json({ success: true, invoice });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// DAILY SUMMARY
// ============================================

app.get('/summary/daily', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const date = req.query.date || new Date().toISOString().split('T')[0];
    
    const [revenueRes, paymentsRes, outstandingRes] = await Promise.all([
      query(`
        SELECT COALESCE(SUM(total_amount), 0) as room_revenue
        FROM hotel_bookings 
        WHERE tenant_id = $1 AND DATE(checked_in_at) = $2
      `, [tenantId, date]),
      query(`
        SELECT 
          payment_method,
          COUNT(*) as count,
          COALESCE(SUM(paid_amount), 0) as total
        FROM hotel_bookings
        WHERE tenant_id = $1 AND DATE(updated_at) = $2 AND paid_amount > 0
        GROUP BY payment_method
      `, [tenantId, date]),
      query(`
        SELECT COALESCE(SUM(total_amount - paid_amount), 0) as outstanding
        FROM hotel_bookings
        WHERE tenant_id = $1 AND status = 'checked_in'
      `, [tenantId])
    ]);
    
    res.json({
      success: true,
      summary: {
        date,
        room_revenue: parseFloat(revenueRes.rows[0].room_revenue),
        payments_by_method: paymentsRes.rows,
        total_outstanding: parseFloat(outstandingRes.rows[0].outstanding)
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health
app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
app.get('/readyz', (req, res) => res.json({ status: dbReady ? 'ready' : 'not_ready' }));


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

const PORT = process.env.PORT || 8913;
app.listen(PORT, () => {
  console.log(`✅ Billing & Payments Service listening on ${PORT}`);
});
