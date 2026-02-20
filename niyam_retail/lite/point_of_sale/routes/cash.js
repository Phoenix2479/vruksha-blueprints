// Point of Sale - Cash Management Routes
const express = require('express');
const { z } = require('zod');
const { query } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');

const router = express.Router();
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function getTenantId(req) {
  const t = req.headers['x-tenant-id'];
  return typeof t === 'string' && t.trim() ? t.trim() : DEFAULT_TENANT_ID;
}

// ============================================
// CASH MOVEMENTS
// ============================================

const CashMovementSchema = z.object({
  session_id: z.string().uuid(),
  movement_type: z.enum(['paid_in', 'paid_out', 'drop', 'pickup', 'float']),
  amount: z.number().positive(),
  reason: z.string().optional(),
  reference_number: z.string().optional(),
  notes: z.string().optional()
});

// Record cash movement
router.post('/movements', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = CashMovementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors });
    }
    
    const { session_id, movement_type, amount, reason, reference_number, notes } = parsed.data;
    const performedBy = req.user?.id || 'system';
    
    // Verify session is open
    const sessionResult = await query(
      'SELECT * FROM pos_sessions WHERE id = $1 AND tenant_id = $2 AND status = $3',
      [session_id, tenantId, 'open']
    );
    
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Active session not found' });
    }
    
    const result = await query(
      `INSERT INTO cash_movements 
       (tenant_id, session_id, movement_type, amount, reason, reference_number, performed_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [tenantId, session_id, movement_type, amount, reason, reference_number, performedBy, notes]
    );
    
    // Publish event
    await publishEnvelope('retail.pos.cash.movement.v1', 1, {
      movement_id: result.rows[0].id,
      session_id,
      movement_type,
      amount,
      timestamp: new Date().toISOString()
    });
    
    res.json({ success: true, movement: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Get movements for session
router.get('/movements/:session_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { session_id } = req.params;
    
    const result = await query(
      `SELECT * FROM cash_movements 
       WHERE tenant_id = $1 AND session_id = $2
       ORDER BY created_at DESC`,
      [tenantId, session_id]
    );
    
    // Calculate summary
    const summary = {
      paid_in: 0,
      paid_out: 0,
      drops: 0,
      pickups: 0,
      floats: 0
    };
    
    for (const m of result.rows) {
      const amt = parseFloat(m.amount);
      switch (m.movement_type) {
        case 'paid_in': summary.paid_in += amt; break;
        case 'paid_out': summary.paid_out += amt; break;
        case 'drop': summary.drops += amt; break;
        case 'pickup': summary.pickups += amt; break;
        case 'float': summary.floats += amt; break;
      }
    }
    
    res.json({ 
      success: true, 
      movements: result.rows,
      summary
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// SUSPENDED TRANSACTIONS (HOLD/RECALL)
// ============================================

const SuspendSchema = z.object({
  session_id: z.string().uuid(),
  cart_data: z.object({
    items: z.array(z.any()),
    discount: z.number().optional(),
    customer_id: z.string().uuid().optional()
  }),
  hold_reason: z.string().optional()
});

// Suspend (hold) transaction
router.post('/suspend', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = SuspendSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors });
    }
    
    const { session_id, cart_data, hold_reason } = parsed.data;
    
    // Get session info
    const sessionResult = await query(
      'SELECT * FROM pos_sessions WHERE id = $1 AND tenant_id = $2',
      [session_id, tenantId]
    );
    
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const session = sessionResult.rows[0];
    
    // Calculate totals
    const items = cart_data.items || [];
    const subtotal = items.reduce((sum, item) => sum + (item.subtotal || item.price * item.quantity), 0);
    const tax = items.reduce((sum, item) => sum + (item.tax_amount || 0), 0);
    const discount = cart_data.discount || 0;
    const total = subtotal + tax - discount;
    
    // Set expiry (24 hours)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    const result = await query(
      `INSERT INTO suspended_transactions 
       (tenant_id, session_id, store_id, cashier_id, customer_id, cart_data, subtotal, tax, discount, total, hold_reason, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        tenantId, session_id, session.store_id, session.cashier_id,
        cart_data.customer_id, JSON.stringify(cart_data), 
        subtotal, tax, discount, total, hold_reason, expiresAt
      ]
    );
    
    res.json({ 
      success: true, 
      suspended: result.rows[0],
      message: 'Transaction suspended'
    });
  } catch (error) {
    next(error);
  }
});

// List suspended transactions
router.get('/suspended', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { session_id, store_id, include_expired } = req.query;
    
    let sql = `
      SELECT * FROM suspended_transactions 
      WHERE tenant_id = $1 AND recalled = false
    `;
    const params = [tenantId];
    let paramIndex = 2;
    
    if (!include_expired) {
      sql += ` AND expires_at > NOW()`;
    }
    
    if (session_id) {
      sql += ` AND session_id = $${paramIndex++}`;
      params.push(session_id);
    }
    
    if (store_id) {
      sql += ` AND store_id = $${paramIndex++}`;
      params.push(store_id);
    }
    
    sql += ` ORDER BY created_at DESC`;
    
    const result = await query(sql, params);
    
    res.json({ success: true, suspended: result.rows });
  } catch (error) {
    next(error);
  }
});

// Recall suspended transaction
router.post('/recall/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const recalledBy = req.user?.id || 'system';
    
    const result = await query(
      `UPDATE suspended_transactions 
       SET recalled = true, recalled_at = NOW(), recalled_by = $1
       WHERE id = $2 AND tenant_id = $3 AND recalled = false
       RETURNING *`,
      [recalledBy, id, tenantId]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Suspended transaction not found or already recalled' });
    }
    
    const suspended = result.rows[0];
    const cartData = typeof suspended.cart_data === 'string' 
      ? JSON.parse(suspended.cart_data) 
      : suspended.cart_data;
    
    res.json({ 
      success: true, 
      cart: cartData,
      message: 'Transaction recalled'
    });
  } catch (error) {
    next(error);
  }
});

// Delete suspended transaction
router.delete('/suspended/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    const result = await query(
      'DELETE FROM suspended_transactions WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, tenantId]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Suspended transaction not found' });
    }
    
    res.json({ success: true, message: 'Suspended transaction deleted' });
  } catch (error) {
    next(error);
  }
});

// ============================================
// DAILY RECONCILIATION
// ============================================

// Get day's summary for reconciliation
router.get('/reconciliation/:store_id/:date', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { store_id, date } = req.params;
    
    // Get all closed sessions for the day
    const sessionsResult = await query(
      `SELECT s.*, 
              (SELECT COUNT(*) FROM pos_transactions t WHERE t.session_id = s.id) as transaction_count,
              (SELECT COALESCE(SUM(total), 0) FROM pos_transactions t WHERE t.session_id = s.id AND t.status = 'completed') as total_sales
       FROM pos_sessions s
       WHERE s.tenant_id = $1 
       AND s.store_id = $2 
       AND DATE(s.opened_at) = $3
       ORDER BY s.opened_at`,
      [tenantId, store_id, date]
    );
    
    // Aggregate by payment method
    const paymentSummary = await query(
      `SELECT 
         p.method,
         COUNT(*) as count,
         SUM(p.amount::decimal) as total
       FROM pos_transactions t
       JOIN pos_sessions s ON t.session_id = s.id
       CROSS JOIN LATERAL jsonb_array_elements(t.payments::jsonb) AS p(elem)
       CROSS JOIN LATERAL (
         SELECT 
           COALESCE(elem->>'method', 'cash') as method,
           COALESCE(elem->>'amount', '0') as amount
       ) p
       WHERE s.tenant_id = $1 
       AND s.store_id = $2 
       AND DATE(t.created_at) = $3
       AND t.status = 'completed'
       GROUP BY p.method`,
      [tenantId, store_id, date]
    );
    
    // Get returns
    const returnsResult = await query(
      `SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total
       FROM pos_returns 
       WHERE tenant_id = $1 AND store_id = $2 AND DATE(created_at) = $3 AND status = 'completed'`,
      [tenantId, store_id, date]
    );
    
    // Calculate totals
    const totalSales = sessionsResult.rows.reduce((sum, s) => sum + parseFloat(s.total_sales || 0), 0);
    const totalReturns = parseFloat(returnsResult.rows[0]?.total || 0);
    const netSales = totalSales - totalReturns;
    
    res.json({
      success: true,
      reconciliation: {
        date,
        store_id,
        sessions: sessionsResult.rows,
        total_transactions: sessionsResult.rows.reduce((sum, s) => sum + parseInt(s.transaction_count), 0),
        total_sales: totalSales,
        total_returns: totalReturns,
        net_sales: netSales,
        payment_breakdown: paymentSummary.rows
      }
    });
  } catch (error) {
    next(error);
  }
});

// Submit reconciliation
router.post('/reconciliation', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { 
      store_id, 
      reconciliation_date, 
      cash_actual, 
      sessions_included,
      notes 
    } = req.body;
    
    const reconciledBy = req.user?.id || 'system';
    
    // Get expected values
    const summaryResult = await query(
      `SELECT 
         COUNT(DISTINCT t.id) as total_transactions,
         COALESCE(SUM(t.total), 0) as total_sales,
         COALESCE(SUM(t.discount), 0) as total_discounts
       FROM pos_transactions t
       JOIN pos_sessions s ON t.session_id = s.id
       WHERE s.tenant_id = $1 
       AND s.store_id = $2 
       AND DATE(t.created_at) = $3
       AND t.status = 'completed'`,
      [tenantId, store_id, reconciliation_date]
    );
    
    const returnsResult = await query(
      `SELECT COALESCE(SUM(total), 0) as total
       FROM pos_returns 
       WHERE tenant_id = $1 AND store_id = $2 AND DATE(created_at) = $3 AND status = 'completed'`,
      [tenantId, store_id, reconciliation_date]
    );
    
    const summary = summaryResult.rows[0];
    const totalReturns = parseFloat(returnsResult.rows[0]?.total || 0);
    
    // Calculate cash expected (simplified - assumes all cash)
    // In production, would need to track actual cash payments vs card
    const cashExpected = parseFloat(summary.total_sales) - totalReturns;
    const cashVariance = cash_actual ? cash_actual - cashExpected : null;
    const status = cashVariance === null ? 'pending' : (Math.abs(cashVariance) < 1 ? 'completed' : 'discrepancy');
    
    const result = await query(
      `INSERT INTO daily_reconciliation 
       (tenant_id, store_id, reconciliation_date, status, total_transactions, total_sales, 
        total_returns, total_discounts, cash_expected, cash_actual, cash_variance, 
        sessions_included, reconciled_by, reconciled_at, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), $14)
       ON CONFLICT (tenant_id, store_id, reconciliation_date) 
       DO UPDATE SET 
         status = EXCLUDED.status,
         cash_actual = EXCLUDED.cash_actual,
         cash_variance = EXCLUDED.cash_variance,
         reconciled_by = EXCLUDED.reconciled_by,
         reconciled_at = NOW(),
         notes = EXCLUDED.notes
       RETURNING *`,
      [
        tenantId, store_id, reconciliation_date, status,
        parseInt(summary.total_transactions), parseFloat(summary.total_sales),
        totalReturns, parseFloat(summary.total_discounts),
        cashExpected, cash_actual, cashVariance,
        sessions_included || [], reconciledBy, notes
      ]
    );
    
    res.json({ success: true, reconciliation: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
