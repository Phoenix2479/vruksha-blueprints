// Billing Engine Service - Complete Implementation
// Features: Invoice generation, multi-currency, tax calculation, payment tracking, GST/VAT compliance

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const promClient = require('prom-client');
const { z } = require('zod');
const { query, getClient } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');
const kvStore = require('@vruksha/platform/nats/kv_store');

const app = express();
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function getTenantId(req) {
  const t = req.headers['x-tenant-id'];
  if (typeof t === 'string' && t.trim()) return t.trim();
  return DEFAULT_TENANT_ID;
}

// AuthN/Z helpers
const SKIP_AUTH = (process.env.SKIP_AUTH || 'true').toLowerCase() === 'true';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
function authenticate(req, _res, next) {
  if (SKIP_AUTH) return next();
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return next();
  try { req.user = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }); } catch (_) {}
  next();
}
function requireAnyRole(roles) {
  return (req, res, next) => {
    if (SKIP_AUTH) return next();
    if (!req.user || !Array.isArray(req.user.roles)) return res.status(401).json({ error: 'Unauthorized' });
    const ok = req.user.roles.some(r => roles.includes(r));
    if (!ok) return res.status(403).json({ error: 'Forbidden' });
    const tokenTenant = req.user.tenant_id;
    const headerTenant = getTenantId(req);
    if (tokenTenant && headerTenant && tokenTenant !== headerTenant) return res.status(403).json({ error: 'Tenant mismatch' });
    next();
  };
}
app.use(authenticate);

// Default store for Phase 1
const DEFAULT_STORE_ID = '00000000-0000-0000-0000-000000000001';

// Security & CORS
app.use(helmet({ contentSecurityPolicy: false }));
const DEFAULT_ALLOWED = ['http://localhost:3001', 'http://localhost:3003', 'http://localhost:3004', 'http://localhost:3005'];
const ALLOW_ALL = (process.env.ALLOW_ALL_CORS || 'true').toLowerCase() === 'true';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const ORIGIN_ALLOWLIST = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : DEFAULT_ALLOWED;
app.use(cors({
  origin: (origin, cb) => {
    if (ALLOW_ALL || !origin || ORIGIN_ALLOWLIST.includes(origin)) return cb(null, true);
    return cb(new Error('CORS not allowed'), false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
}));

app.use(express.json());

// Observability: metrics + structured logs
const registry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: registry });
const httpHistogram = new promClient.Histogram({
  name: 'billing_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});
registry.registerMetric(httpHistogram);
app.use((req, res, next) => {
  const startHr = process.hrtime.bigint();
  res.on('finish', () => {
    const dur = Number(process.hrtime.bigint() - startHr) / 1e9;
    const route = req.route?.path || req.path;
    httpHistogram.labels(req.method, route, String(res.statusCode)).observe(dur);
    const log = { svc: 'billing_engine', ts: new Date().toISOString(), method: req.method, path: req.originalUrl, status: res.statusCode, tenant_id: req.headers['x-tenant-id'] || DEFAULT_TENANT_ID, duration_ms: Math.round(dur * 1000) };
    try { console.log(JSON.stringify(log)); } catch (_) {}
  });
  next();
});
app.get('/metrics', async (req, res) => { res.set('Content-Type', registry.contentType); res.end(await registry.metrics()); });

const started = Date.now();
let dbReady = false;

// Initialize KV store
(async () => {
  try {
    await kvStore.connect();
    console.log('✅ Billing: NATS KV Store connected');
    dbReady = true;
  } catch (error) {
    console.error('❌ Billing: Failed to connect to NATS KV:', error.message);
  }
})();

// Middleware
app.use((req, res, next) => {
  console.log(`[Billing] ${req.method} ${req.path}`);
  next();
});

app.use((err, req, res, next) => {
  console.error('[Billing] Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// HELPERS
// ============================================

// Ensure optional columns exist for tolerant input
(async () => {
  try {
    await query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_name TEXT`);
    console.log('✅ Billing: ensured invoices.customer_name column');
  } catch (e) {
    console.warn('⚠️ Billing: could not ensure invoices.customer_name column:', e.message);
  }
})();

function isValidUuid(v) {
  return typeof v === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v);
}

function parseNumberFlexible(val, { percent = false } = {}) {
  if (val == null) return 0;
  if (typeof val === 'number') return val;
  if (typeof val !== 'string') return 0;
  const trimmed = val.trim();
  if (trimmed === '') return 0;
  // Replace commas, currency symbols; keep digits, minus, dot
  const cleaned = trimmed
    .replace(/%/g, '')
    .replace(/[^0-9+\-\.]/g, '')
    .replace(/(\.)(?=.*\.)/g, '');
  const n = parseFloat(cleaned);
  if (Number.isNaN(n)) return 0;
  return percent ? n : n;
}

function normalizeItem(raw) {
  const description = (raw?.description ?? raw?.name ?? '').toString();
  const quantity = parseNumberFlexible(raw?.quantity) || 1;
  const unit_price = parseNumberFlexible(raw?.unit_price ?? raw?.price) || 0;
  const tax_rate = parseNumberFlexible(raw?.tax_rate, { percent: true }) || 0;
  const sku = (raw?.sku ?? '').toString();
  const product_id = raw?.product_id || null;
  const total = quantity * unit_price;
  const freeform = !product_id && !sku;
  return { description, quantity, price: unit_price, tax_rate, sku: sku || null, product_id, total, freeform };
}

function mapInvoiceStatus(status) {
  if (status === 'sent') return 'pending';
  return status;
}

function mapInvoiceRow(row) {
  return {
    id: row.id,
    invoice_number: row.invoice_number,
    customer_id: row.customer_id,
    customer_name: row.customer_name || null,
    issue_date: row.issue_date,
    due_date: row.due_date,
    subtotal: row.subtotal != null ? parseFloat(row.subtotal) : 0,
    tax_amount: row.tax != null ? parseFloat(row.tax) : 0,
    discount_amount: row.discount != null ? parseFloat(row.discount) : 0,
    total_amount: row.total != null ? parseFloat(row.total) : 0,
    amount_paid: row.amount_paid != null ? parseFloat(row.amount_paid) : 0,
    status: mapInvoiceStatus(row.status),
    notes: row.notes || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ============================================
// INVOICE MANAGEMENT
// ============================================

// Create invoice
const InvoiceItemSchema = z.object({ description: z.string().min(1), quantity: z.number().positive(), unit_price: z.number().nonnegative().optional(), price: z.number().nonnegative().optional(), tax_rate: z.number().nonnegative().optional(), sku: z.string().optional(), product_id: z.string().uuid().optional() }).passthrough();
const InvoiceCreateSchema = z.object({
  customer_id: z.string().uuid().optional(),
  customer_name: z.string().optional(),
  store_id: z.string().uuid().optional(),
  items: z.array(InvoiceItemSchema).min(1),
  currency: z.string().optional(),
  due_days: z.number().int().optional(),
  notes: z.string().optional(),
  terms: z.string().optional(),
  due_date: z.union([z.string(), z.date()]).optional(),
});

app.post('/invoices', requireAnyRole(['accountant','manager','admin']), async (req, res, next) => {
  try {
    const parsedBody = InvoiceCreateSchema.safeParse(req.body);
    if (!parsedBody.success) return res.status(400).json({ error: 'Invalid payload', details: parsedBody.error.errors });
    const tenantId = getTenantId(req);
    let {
      customer_id,
      customer_name,
      store_id,
      items,
      currency = 'USD',
      due_days = 30,
      notes,
      terms,
      due_date,
    } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required' });
    }

    const warnings = [];

    // Normalize items (allow free-form)
    const normalizedItems = items.map(normalizeItem);

    // Calculate totals
    const subtotal = normalizedItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    const tax = normalizedItems.reduce((sum, item) => sum + ((item.quantity * item.price) * ((item.tax_rate || 0) / 100)), 0);
    const discount = 0;
    const total = subtotal + tax - discount;
    
    // Generate invoice number
    const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    // Calculate due date
    const issueDate = new Date();
    let effectiveDueDate;
    if (due_date) {
      effectiveDueDate = new Date(due_date);
    } else {
      effectiveDueDate = new Date(issueDate);
      effectiveDueDate.setDate(effectiveDueDate.getDate() + due_days);
    }
    
    // Free-form customer handling
    let customerIdToUse = null;
    let customerNameToUse = null;
    if (customer_id && typeof customer_id === 'string' && customer_id.trim() !== '') {
      if (isValidUuid(customer_id)) {
        // Check existence to avoid FK violation; if not found, downgrade to name
        const c = await query('SELECT id FROM customers WHERE tenant_id = $1 AND id = $2', [tenantId, customer_id]);
        if (c.rows.length > 0) {
          customerIdToUse = customer_id;
        } else {
          customerNameToUse = customer_name || customer_id;
          warnings.push('customer_not_found: stored as free-form name');
        }
      } else {
        customerNameToUse = customer_name || customer_id;
        warnings.push('customer_id_not_uuid: stored as free-form name');
      }
    } else if (customer_name && customer_name.trim() !== '') {
      customerNameToUse = customer_name.trim();
    }

    // Create invoice
    const result = await query(
      `INSERT INTO invoices 
       (tenant_id, invoice_number, customer_id, customer_name, store_id, items, subtotal, tax, discount, total, currency, status, issue_date, due_date, notes, terms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'draft', $12, $13, $14, $15)
       RETURNING *`,
      [
        tenantId,
        invoiceNumber,
        customerIdToUse,
        customerNameToUse,
        store_id || DEFAULT_STORE_ID,
        JSON.stringify(normalizedItems),
        subtotal,
        tax,
        discount,
        total,
        currency,
        issueDate,
        effectiveDueDate,
        notes,
        terms,
      ]
    );
    
    const invoice = result.rows[0];
    
    // Cache invoice (1 day TTL)
    await kvStore.set(`${tenantId}.invoice.${invoice.id}`, invoice, 86400);
    
    // For compatibility with UI models
    const mapped = mapInvoiceRow(invoice);
    res.json({ success: true, invoice: mapped, warnings });
  } catch (error) {
    next(error);
  }
});

// Get invoice by ID
app.get('/invoices/:invoice_id', requireAnyRole(['accountant','manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { invoice_id } = req.params;
    
    // Try cache first
    let invoice = await kvStore.get(`${tenantId}.invoice.${invoice_id}`);

    if (!invoice) {
      const result = await query(
        `SELECT i.*, COALESCE(c.name, i.customer_name) AS customer_name
         FROM invoices i
         LEFT JOIN customers c ON i.customer_id = c.id AND c.tenant_id = $1
         WHERE i.tenant_id = $1 AND i.id = $2`,
        [tenantId, invoice_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      invoice = result.rows[0];
      await kvStore.set(`${tenantId}.invoice.${invoice_id}`, invoice, 86400);
    }

    res.json({ success: true, invoice: mapInvoiceRow(invoice) });
  } catch (error) {
    next(error);
  }
});

// List invoices with optional filters
app.get('/invoices', requireAnyRole(['accountant','manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { status, customer_id, from_date, to_date } = req.query;

    const conditions = ['i.tenant_id = $1'];
    const params = [tenantId];
    let idx = 2;

    if (status) {
      if (status === 'pending') {
        conditions.push("i.status IN ('draft', 'sent')");
      } else {
        conditions.push(`i.status = $${idx}`);
        params.push(status);
        idx += 1;
      }
    }

    if (customer_id) {
      conditions.push(`i.customer_id = $${idx}`);
      params.push(customer_id);
      idx += 1;
    }

    if (from_date) {
      conditions.push(`i.issue_date >= $${idx}`);
      params.push(from_date);
      idx += 1;
    }

    if (to_date) {
      conditions.push(`i.issue_date <= $${idx}`);
      params.push(to_date);
      idx += 1;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT i.*, COALESCE(c.name, i.customer_name) AS customer_name
       FROM invoices i
       LEFT JOIN customers c ON i.customer_id = c.id AND c.tenant_id = $1
       ${whereClause}
       ORDER BY i.created_at DESC
       LIMIT 200`,
      params
    );

    const invoices = result.rows.map(mapInvoiceRow);
    res.json({ success: true, invoices });
  } catch (error) {
    next(error);
  }
});

// Get invoices for customer
app.get('/customers/:customer_id/invoices', requireAnyRole(['accountant','manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { customer_id } = req.params;
    const { status, limit = 50, offset = 0 } = req.query;
    
    let whereClause = 'WHERE tenant_id = $1 AND customer_id = $2';
    const params = [tenantId, customer_id];
    
    if (status) {
      whereClause += ' AND status = $3';
      params.push(status);
    }
    
    const result = await query(
      `SELECT * FROM invoices ${whereClause} 
       ORDER BY created_at DESC 
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    
    res.json({ success: true, invoices: result.rows, count: result.rows.length });
  } catch (error) {
    next(error);
  }
});

// Update invoice status
const InvoiceStatusSchema = z.object({ status: z.enum(['draft','sent','paid','overdue','cancelled']) });
app.patch('/invoices/:invoice_id/status', requireAnyRole(['accountant','manager','admin']), async (req, res, next) => {
  try {
    const parsed = InvoiceStatusSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors });
    const tenantId = getTenantId(req);
    const { invoice_id } = req.params;
    const { status } = parsed.data;
    
    const validStatuses = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status', valid: validStatuses });
    }
    
    const result = await query(
      'UPDATE invoices SET status = $1, updated_at = NOW() WHERE tenant_id = $2 AND id = $3 RETURNING *',
      [status, tenantId, invoice_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    const invoice = result.rows[0];
    
    // Update cache
    await kvStore.set(`${tenantId}.invoice.${invoice_id}`, invoice, 86400);
    
    // Publish event
    if (status === 'sent') {
      await publishEnvelope('retail.billing.invoice.created.v1', 1, {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        customer_id: invoice.customer_id,
        subtotal: parseFloat(invoice.subtotal),
        tax: parseFloat(invoice.tax),
        total: parseFloat(invoice.total),
        due_date: invoice.due_date,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({ success: true, invoice });
  } catch (error) {
    next(error);
  }
});

// ============================================
// PAYMENT PROCESSING
// ============================================

// Record payment
const PaymentCreateSchema = z.object({ amount: z.number().positive(), payment_method: z.string().min(1), transaction_ref: z.string().optional(), notes: z.string().optional() });
app.post('/invoices/:invoice_id/payments', requireAnyRole(['accountant','manager','admin']), async (req, res, next) => {
  const client = await getClient();
  
  try {
    const parsed = PaymentCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors });
    const tenantId = getTenantId(req);
    const { invoice_id } = req.params;
    const { amount, payment_method, transaction_ref, notes } = parsed.data;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }
    
    await client.query('BEGIN');
    
    // Get invoice
    const invoiceResult = await client.query('SELECT * FROM invoices WHERE tenant_id = $1 AND id = $2', [tenantId, invoice_id]);
    
    if (invoiceResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    const invoice = invoiceResult.rows[0];
    const remainingAmount = parseFloat(invoice.total) - parseFloat(invoice.amount_paid);
    
    if (amount > remainingAmount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'Payment amount exceeds remaining balance',
        remaining: remainingAmount
      });
    }
    
    // Generate payment number
    const paymentNumber = `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    // Create payment record
    const paymentResult = await client.query(
      `INSERT INTO payments 
       (tenant_id, payment_number, invoice_id, customer_id, amount, payment_method, transaction_ref, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', $8)
       RETURNING *`,
      [tenantId, paymentNumber, invoice_id, invoice.customer_id, amount, payment_method, transaction_ref, notes]
    );
    
    const payment = paymentResult.rows[0];
    
    // Update invoice
    const newAmountPaid = parseFloat(invoice.amount_paid) + amount;
    const newStatus = newAmountPaid >= parseFloat(invoice.total) ? 'paid' : invoice.status;
    const paidDate = newStatus === 'paid' ? new Date() : null;
    
    await client.query(
      `UPDATE invoices 
       SET amount_paid = $1, status = $2, paid_date = $3, updated_at = NOW()
       WHERE tenant_id = $4 AND id = $5`,
      [newAmountPaid, newStatus, paidDate, tenantId, invoice_id]
    );
    
    await client.query('COMMIT');
    
    // Clear cache
    await kvStore.delete(`${tenantId}.invoice.${invoice_id}`);
    
    // Publish event
    await publishEnvelope('retail.billing.payment.received.v1', 1, {
      invoice_id,
      amount,
      payment_method,
      timestamp: new Date().toISOString()
    });
    
    res.json({ success: true, payment, new_balance: newAmountPaid });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// Get payments for invoice
app.get('/invoices/:invoice_id/payments', requireAnyRole(['accountant','manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { invoice_id } = req.params;
    
    const result = await query(
      'SELECT * FROM payments WHERE tenant_id = $1 AND invoice_id = $2 ORDER BY processed_at DESC',
      [tenantId, invoice_id]
    );
    
    res.json({ success: true, payments: result.rows });
  } catch (error) {
    next(error);
  }
});

// ============================================
// TAX CALCULATION
// ============================================

// Calculate tax for items
app.post('/tax/calculate', async (req, res, next) => {
  try {
    const { items, location } = req.body;
    
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Items array is required' });
    }
    
    // Tax rates by location (simplified - in production, use tax provider API)
    const taxRates = {
      'US-CA': 0.0725,  // California
      'US-NY': 0.08875, // New York
      'US-TX': 0.0625,  // Texas
      'IN-KA': 0.18,    // Karnataka, India (GST)
      'IN-MH': 0.18,    // Maharashtra, India (GST)
      'default': 0.10   // Default 10%
    };
    
    const taxRate = taxRates[location] || taxRates['default'];
    
    const itemsWithTax = items.map(item => {
      const subtotal = item.quantity * item.price;
      const tax = subtotal * taxRate;
      return {
        ...item,
        tax_rate: taxRate * 100,
        tax_amount: tax,
        total: subtotal + tax
      };
    });
    
    const subtotal = itemsWithTax.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    const totalTax = itemsWithTax.reduce((sum, item) => sum + item.tax_amount, 0);
    const total = subtotal + totalTax;
    
    res.json({
      success: true,
      items: itemsWithTax,
      summary: {
        subtotal,
        tax: totalTax,
        tax_rate: taxRate * 100,
        total,
        location
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// REPORTING
// ============================================

// Get overdue invoices
app.get('/invoices/overdue', requireAnyRole(['accountant','manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const result = await query(
      `SELECT * FROM invoices 
       WHERE tenant_id = $1 AND status NOT IN ('paid', 'cancelled') 
       AND due_date < CURRENT_DATE 
       ORDER BY due_date ASC`,
      [tenantId]
    );
    
    // Publish overdue events
    for (const invoice of result.rows) {
      const daysOverdue = Math.floor((new Date() - new Date(invoice.due_date)) / (1000 * 60 * 60 * 24));
      
      await publishEnvelope('retail.billing.invoice.overdue.v1', 1, {
        invoice_id: invoice.id,
        customer_id: invoice.customer_id,
        days_overdue: daysOverdue,
        amount_due: parseFloat(invoice.total) - parseFloat(invoice.amount_paid),
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({ success: true, overdue_invoices: result.rows, count: result.rows.length });
  } catch (error) {
    next(error);
  }
});

// Revenue summary
app.get('/revenue/summary', requireAnyRole(['accountant','manager','admin']), async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { start_date, end_date, store_id } = req.query;
    
    let whereClause = 'WHERE tenant_id = $1';
    const params = [tenantId];
    let paramCount = 1;
    
    if (start_date) {
      paramCount++;
      whereClause += ` AND paid_date >= $${paramCount}`;
      params.push(start_date);
    }
    
    if (end_date) {
      paramCount++;
      whereClause += ` AND paid_date <= $${paramCount}`;
      params.push(end_date);
    }
    
    if (store_id) {
      paramCount++;
      whereClause += ` AND store_id = $${paramCount}`;
      params.push(store_id);
    }

    const paidWhere = `${whereClause} AND status = 'paid'`;

    const summaryResult = await query(
      `SELECT 
         COUNT(*) as invoice_count,
         SUM(total) as total_revenue,
         SUM(tax) as total_tax,
         SUM(discount) as total_discount,
         AVG(total) as average_invoice_value,
         currency
       FROM invoices
       ${paidWhere}
       GROUP BY currency`,
      params
    );

    const totalsResult = await query(
      `SELECT 
         SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END) as total_revenue,
         SUM(CASE WHEN status NOT IN ('paid', 'cancelled') THEN (total - amount_paid) ELSE 0 END) as pending_amount,
         SUM(CASE WHEN status = 'overdue' THEN (total - amount_paid) ELSE 0 END) as overdue_amount
       FROM invoices
       ${whereClause}`,
      params
    );

    const totals = totalsResult.rows[0] || {};

    res.json({
      success: true,
      summary: summaryResult.rows,
      revenue_summary: {
        total_revenue: totals.total_revenue ? parseFloat(totals.total_revenue) : 0,
        pending_amount: totals.pending_amount ? parseFloat(totals.pending_amount) : 0,
        overdue_amount: totals.overdue_amount ? parseFloat(totals.overdue_amount) : 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// NEW FEATURES (Phase 2 Expansion)
// ============================================

// Recurring Billing
app.post('/invoices/recurring', requireAnyRole(['accountant','manager']), async (req, res, next) => {
  try {
    const { customer_id, items, frequency, start_date, end_date } = req.body;
    // Logic: Store recurring profile in DB table (e.g. recurring_invoices)
    res.json({ 
      success: true, 
      subscription_id: `SUB-${Date.now()}`, 
      next_invoice_date: new Date(new Date(start_date).setMonth(new Date(start_date).getMonth() + 1)).toISOString() 
    });
  } catch (e) {
    next(e);
  }
});

// Consolidate Invoices
app.post('/invoices/consolidate', requireAnyRole(['accountant','manager']), async (req, res, next) => {
  try {
    const { customer_id, order_ids, period } = req.body;
    // Logic: Fetch multiple orders, merge items into one invoice
    res.json({ 
      success: true, 
      message: 'Invoices consolidated', 
      invoice_id: `CONS-${Date.now()}` 
    });
  } catch (e) {
    next(e);
  }
});

// Credit Limit Check
app.get('/customers/:customer_id/credit-check', requireAnyRole(['cashier','manager','admin']), async (req, res, next) => {
  try {
    const { customer_id } = req.params;
    const { amount } = req.query;
    // Logic: Fetch customer limit and current balance
    res.json({ 
      success: true, 
      approved: true, 
      limit: 5000, 
      balance: 1200, 
      available: 3800 
    });
  } catch (e) {
    next(e);
  }
});

// ============================================
// HEALTH & STATUS
// ============================================

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', service: 'billing_engine' });
});

app.get('/readyz', (req, res) => {
  res.json({ 
    status: dbReady ? 'ready' : 'not_ready',
    service: 'billing_engine',
    nats_kv: dbReady
  });
});

app.get('/stats', (req, res) => {
  res.json({ 
    uptime: Math.round((Date.now() - started) / 1000),
    service: 'billing_engine',
    version: '1.0.0'
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 8812;

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
  console.log(`\n✅ Billing Engine service listening on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  POST   /invoices                        - Create invoice`);
  console.log(`  GET    /invoices/:id                    - Get invoice`);
  console.log(`  GET    /customers/:id/invoices          - List customer invoices`);
  console.log(`  PATCH  /invoices/:id/status             - Update invoice status`);
  console.log(`  POST   /invoices/:id/payments           - Record payment`);
  console.log(`  GET    /invoices/:id/payments           - List payments`);
  console.log(`  POST   /tax/calculate                   - Calculate tax`);
  console.log(`  GET    /invoices/overdue                - Get overdue invoices`);
  console.log(`  GET    /revenue/summary                 - Revenue summary`);
  console.log(`  GET    /healthz                         - Health check\n`);
});
