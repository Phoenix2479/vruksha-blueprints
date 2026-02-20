// Point of Sale - Returns & Refunds Routes
const express = require('express');
const { z } = require('zod');
const { query, getClient } = require('@vruksha/platform/db/postgres');
const { publishEnvelope } = require('@vruksha/platform/sdk/node');

const router = express.Router();
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function getTenantId(req) {
  const t = req.headers['x-tenant-id'];
  return typeof t === 'string' && t.trim() ? t.trim() : DEFAULT_TENANT_ID;
}

// ============================================
// RETURNS & REFUNDS
// ============================================

const CreateReturnSchema = z.object({
  original_transaction_id: z.string().uuid(),
  session_id: z.string().uuid(),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    sku: z.string(),
    name: z.string().optional(),
    quantity: z.number().int().positive(),
    unit_price: z.number(),
    tax_rate: z.number().optional(),
    return_reason: z.string().optional(),
    condition: z.string().optional(),
    restock: z.boolean().optional()
  })).min(1),
  return_type: z.enum(['refund', 'exchange', 'store_credit']).optional(),
  reason: z.string().optional(),
  notes: z.string().optional()
});

// Create return request
router.post('/', async (req, res, next) => {
  const client = await getClient();
  
  try {
    const tenantId = getTenantId(req);
    const parsed = CreateReturnSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.errors });
    }
    
    const { original_transaction_id, session_id, items, return_type, reason, notes } = parsed.data;
    
    // Get original transaction
    const txResult = await query(
      'SELECT * FROM pos_transactions WHERE id = $1 AND tenant_id = $2',
      [original_transaction_id, tenantId]
    );
    
    if (txResult.rows.length === 0) {
      return res.status(404).json({ error: 'Original transaction not found' });
    }
    
    const originalTx = txResult.rows[0];
    const originalItems = typeof originalTx.items === 'string' 
      ? JSON.parse(originalTx.items) 
      : originalTx.items;
    
    // Validate return quantities don't exceed original
    for (const returnItem of items) {
      const origItem = originalItems.find(i => i.sku === returnItem.sku || i.product_id === returnItem.product_id);
      if (!origItem) {
        return res.status(400).json({ error: `Item ${returnItem.sku} not found in original transaction` });
      }
      
      // Check for existing returns on same transaction
      const existingReturns = await query(
        `SELECT COALESCE(SUM(ri.quantity), 0) as returned_qty
         FROM pos_return_items ri
         JOIN pos_returns r ON ri.return_id = r.id
         WHERE r.original_transaction_id = $1 
         AND ri.sku = $2 
         AND r.status NOT IN ('rejected', 'cancelled')`,
        [original_transaction_id, returnItem.sku]
      );
      
      const alreadyReturned = parseInt(existingReturns.rows[0]?.returned_qty || 0);
      const maxReturnable = origItem.quantity - alreadyReturned;
      
      if (returnItem.quantity > maxReturnable) {
        return res.status(400).json({ 
          error: `Cannot return ${returnItem.quantity} of ${returnItem.sku}. Max returnable: ${maxReturnable}` 
        });
      }
    }
    
    // Get session info
    const sessionResult = await query(
      'SELECT * FROM pos_sessions WHERE id = $1',
      [session_id]
    );
    
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const session = sessionResult.rows[0];
    
    await client.query('BEGIN');
    
    // Generate return number
    const returnNumber = `RTN-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    // Calculate totals
    let subtotal = 0;
    let taxTotal = 0;
    
    const processedItems = items.map(item => {
      const itemSubtotal = item.quantity * item.unit_price;
      const taxRate = item.tax_rate || 0;
      const taxAmount = itemSubtotal * (taxRate / 100);
      
      subtotal += itemSubtotal;
      taxTotal += taxAmount;
      
      return {
        ...item,
        subtotal: itemSubtotal,
        tax_amount: taxAmount
      };
    });
    
    const total = subtotal + taxTotal;
    
    // Create return record
    const returnResult = await client.query(
      `INSERT INTO pos_returns 
       (tenant_id, return_number, original_transaction_id, session_id, store_id, cashier_id, 
        customer_id, return_type, status, subtotal, tax, total, reason, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        tenantId, returnNumber, original_transaction_id, session_id,
        session.store_id, session.cashier_id, originalTx.customer_id,
        return_type || 'refund', subtotal, taxTotal, total, reason, notes
      ]
    );
    
    const returnRecord = returnResult.rows[0];
    
    // Insert return items
    for (const item of processedItems) {
      await client.query(
        `INSERT INTO pos_return_items 
         (return_id, product_id, sku, name, quantity, unit_price, tax_rate, subtotal, tax_amount, return_reason, condition, restock)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          returnRecord.id, item.product_id, item.sku, item.name,
          item.quantity, item.unit_price, item.tax_rate || 0,
          item.subtotal, item.tax_amount, item.return_reason || reason,
          item.condition || 'good', item.restock !== false
        ]
      );
    }
    
    await client.query('COMMIT');
    
    // Publish event
    await publishEnvelope('retail.pos.return.created.v1', 1, {
      return_id: returnRecord.id,
      return_number: returnNumber,
      original_transaction_id,
      total,
      items: processedItems.length,
      timestamp: new Date().toISOString()
    });
    
    res.json({
      success: true,
      return: {
        ...returnRecord,
        items: processedItems
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// Get return by ID
router.get('/:return_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { return_id } = req.params;
    
    const result = await query(
      `SELECT r.*, 
              json_agg(json_build_object(
                'id', ri.id,
                'product_id', ri.product_id,
                'sku', ri.sku,
                'name', ri.name,
                'quantity', ri.quantity,
                'unit_price', ri.unit_price,
                'tax_rate', ri.tax_rate,
                'subtotal', ri.subtotal,
                'tax_amount', ri.tax_amount,
                'return_reason', ri.return_reason,
                'condition', ri.condition,
                'restock', ri.restock
              )) as items
       FROM pos_returns r
       LEFT JOIN pos_return_items ri ON r.id = ri.return_id
       WHERE r.id = $1 AND r.tenant_id = $2
       GROUP BY r.id`,
      [return_id, tenantId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Return not found' });
    }
    
    res.json({ success: true, return: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// List returns
router.get('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { status, store_id, limit = 50, offset = 0 } = req.query;
    
    let sql = `
      SELECT r.*, 
             (SELECT COUNT(*) FROM pos_return_items ri WHERE ri.return_id = r.id) as item_count
      FROM pos_returns r
      WHERE r.tenant_id = $1
    `;
    const params = [tenantId];
    let paramIndex = 2;
    
    if (status) {
      sql += ` AND r.status = $${paramIndex++}`;
      params.push(status);
    }
    
    if (store_id) {
      sql += ` AND r.store_id = $${paramIndex++}`;
      params.push(store_id);
    }
    
    sql += ` ORDER BY r.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await query(sql, params);
    
    res.json({ success: true, returns: result.rows });
  } catch (error) {
    next(error);
  }
});

// Approve return (manager action)
router.post('/:return_id/approve', async (req, res, next) => {
  const client = await getClient();
  
  try {
    const tenantId = getTenantId(req);
    const { return_id } = req.params;
    const { refund_method } = req.body;
    const approvedBy = req.user?.id || 'system';
    
    // Get return
    const returnResult = await query(
      'SELECT * FROM pos_returns WHERE id = $1 AND tenant_id = $2',
      [return_id, tenantId]
    );
    
    if (returnResult.rows.length === 0) {
      return res.status(404).json({ error: 'Return not found' });
    }
    
    const returnRecord = returnResult.rows[0];
    
    if (returnRecord.status !== 'pending') {
      return res.status(400).json({ error: `Return is already ${returnRecord.status}` });
    }
    
    await client.query('BEGIN');
    
    // Update return status
    await client.query(
      `UPDATE pos_returns 
       SET status = 'approved', 
           approved_by = $1, 
           approved_at = NOW(),
           refund_method = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [approvedBy, refund_method || 'original_payment', return_id]
    );
    
    await client.query('COMMIT');
    
    // Publish event
    await publishEnvelope('retail.pos.return.approved.v1', 1, {
      return_id,
      approved_by: approvedBy,
      refund_method,
      timestamp: new Date().toISOString()
    });
    
    res.json({ success: true, message: 'Return approved', return_id });
    
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// Complete return (process refund)
router.post('/:return_id/complete', async (req, res, next) => {
  const client = await getClient();
  
  try {
    const tenantId = getTenantId(req);
    const { return_id } = req.params;
    
    // Get return with items
    const returnResult = await query(
      `SELECT r.*, 
              json_agg(json_build_object(
                'id', ri.id,
                'product_id', ri.product_id,
                'sku', ri.sku,
                'quantity', ri.quantity,
                'restock', ri.restock
              )) as items
       FROM pos_returns r
       LEFT JOIN pos_return_items ri ON r.id = ri.return_id
       WHERE r.id = $1 AND r.tenant_id = $2
       GROUP BY r.id`,
      [return_id, tenantId]
    );
    
    if (returnResult.rows.length === 0) {
      return res.status(404).json({ error: 'Return not found' });
    }
    
    const returnRecord = returnResult.rows[0];
    
    if (returnRecord.status !== 'approved') {
      return res.status(400).json({ error: 'Return must be approved before completing' });
    }
    
    await client.query('BEGIN');
    
    // Process inventory restock for applicable items
    const items = returnRecord.items || [];
    for (const item of items) {
      if (item.restock) {
        await client.query(
          `UPDATE inventory 
           SET quantity = quantity + $1, updated_at = NOW()
           WHERE tenant_id = $2 AND product_id = $3 AND store_id = $4`,
          [item.quantity, tenantId, item.product_id, returnRecord.store_id]
        );
        
        // Log inventory transaction
        await client.query(
          `INSERT INTO inventory_transactions 
           (tenant_id, product_id, sku, store_id, transaction_type, quantity, reference_id, reference_type, created_by)
           VALUES ($1, $2, $3, $4, 'return', $5, $6, 'pos_return', $7)`,
          [tenantId, item.product_id, item.sku, returnRecord.store_id, item.quantity, return_id, returnRecord.cashier_id]
        );
      }
    }
    
    // Update return status
    let refundAmount = parseFloat(returnRecord.total);
    let storeCreditIssued = 0;
    
    if (returnRecord.return_type === 'store_credit') {
      storeCreditIssued = refundAmount;
      refundAmount = 0;
      
      // Issue store credit to customer if applicable
      if (returnRecord.customer_id) {
        await client.query(
          `UPDATE customers 
           SET store_credit = COALESCE(store_credit, 0) + $1, updated_at = NOW()
           WHERE tenant_id = $2 AND id = $3`,
          [storeCreditIssued, tenantId, returnRecord.customer_id]
        );
      }
    }
    
    await client.query(
      `UPDATE pos_returns 
       SET status = 'completed', 
           refund_amount = $1,
           store_credit_issued = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [refundAmount, storeCreditIssued, return_id]
    );
    
    await client.query('COMMIT');
    
    // Publish event
    await publishEnvelope('retail.pos.return.completed.v1', 1, {
      return_id,
      refund_amount: refundAmount,
      store_credit_issued: storeCreditIssued,
      items_restocked: items.filter(i => i.restock).length,
      timestamp: new Date().toISOString()
    });
    
    res.json({ 
      success: true, 
      message: 'Return completed',
      return_id,
      refund_amount: refundAmount,
      store_credit_issued: storeCreditIssued
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// Reject return
router.post('/:return_id/reject', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { return_id } = req.params;
    const { reason } = req.body;
    
    const result = await query(
      `UPDATE pos_returns 
       SET status = 'rejected', 
           notes = COALESCE(notes, '') || E'\nRejection: ' || $1,
           updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3 AND status = 'pending'
       RETURNING *`,
      [reason || 'No reason provided', return_id, tenantId]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Return not found or already processed' });
    }
    
    await publishEnvelope('retail.pos.return.rejected.v1', 1, {
      return_id,
      reason,
      timestamp: new Date().toISOString()
    });
    
    res.json({ success: true, message: 'Return rejected', return_id });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
