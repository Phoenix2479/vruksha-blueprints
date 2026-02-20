// E-commerce Integration - Orders Routes
const express = require('express');
const { query, getClient } = require('@vruksha/platform/db/postgres');
const { handleNewOrder, isFirstOrder, sendShippingNotification } = require('../utils/emailNotifications');

const router = express.Router();
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function getTenantId(req) {
  const t = req.headers['x-tenant-id'];
  return typeof t === 'string' && t.trim() ? t.trim() : DEFAULT_TENANT_ID;
}

// ============================================
// ORDERS
// ============================================

// List orders
router.get('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { channel_id, status, limit = 50, offset = 0 } = req.query;
    
    let sql = `
      SELECT o.*, c.channel_id as channel_identifier, c.platform, c.display_name as channel_name
      FROM ecommerce_orders o
      JOIN ecommerce_channels c ON o.channel_id = c.id
      WHERE o.tenant_id = $1
    `;
    const params = [tenantId];
    let idx = 2;
    
    if (channel_id) {
      sql += ` AND c.channel_id = $${idx++}`;
      params.push(channel_id);
    }
    
    if (status) {
      sql += ` AND o.status = $${idx++}`;
      params.push(status);
    }
    
    sql += ` ORDER BY o.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await query(sql, params);
    
    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM ecommerce_orders o 
       JOIN ecommerce_channels c ON o.channel_id = c.id
       WHERE o.tenant_id = $1`,
      [tenantId]
    );
    
    res.json({
      success: true,
      data: {
        total: parseInt(countResult.rows[0].count),
        orders: result.rows
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get order by ID
router.get('/:id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    
    const result = await query(
      `SELECT o.*, c.channel_id as channel_identifier, c.platform, c.display_name as channel_name,
              (SELECT json_agg(f.*) FROM ecommerce_fulfillments f WHERE f.order_id = o.id) as fulfillments
       FROM ecommerce_orders o
       JOIN ecommerce_channels c ON o.channel_id = c.id
       WHERE o.id = $1 AND o.tenant_id = $2`,
      [id, tenantId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
    }
    
    res.json({ success: true, data: { order: result.rows[0] } });
  } catch (error) {
    next(error);
  }
});

// Update order status
router.patch('/:id/status', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { status, fulfillment_status, payment_status, notes } = req.body;
    
    const updates = [];
    const params = [id, tenantId];
    let idx = 3;
    
    if (status) { updates.push(`status = $${idx++}`); params.push(status); }
    if (fulfillment_status) { updates.push(`fulfillment_status = $${idx++}`); params.push(fulfillment_status); }
    if (payment_status) { updates.push(`payment_status = $${idx++}`); params.push(payment_status); }
    if (notes !== undefined) { updates.push(`notes = $${idx++}`); params.push(notes); }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push('updated_at = NOW()');
    
    const result = await query(
      `UPDATE ecommerce_orders SET ${updates.join(', ')} WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      params
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
    }
    
    res.json({ success: true, data: { order: result.rows[0] } });
  } catch (error) {
    next(error);
  }
});

// Import orders from a channel
router.post('/import', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { since_date, channel_id } = req.body;

    if (!channel_id) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_CHANNEL', message: 'channel_id is required. Use POST /channels/:channel_id/sync-now for channel-specific imports.' }
      });
    }

    // Find the channel
    const channelResult = await query(
      'SELECT * FROM ecommerce_channels WHERE tenant_id = $1 AND channel_id = $2',
      [tenantId, channel_id]
    );

    if (channelResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'CHANNEL_NOT_FOUND', message: `Channel ${channel_id} not found. Connect a channel first.` }
      });
    }

    // Redirect to the sync endpoint
    res.json({
      success: true,
      data: {
        message: `Use POST /channels/${channel_id}/sync-now to import orders from this channel`,
        channel: channelResult.rows[0].display_name,
        platform: channelResult.rows[0].platform
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// FULFILLMENT
// ============================================

// Create fulfillment (ship order)
router.post('/:id/fulfill', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { tracking_number, carrier, tracking_url, items, notes, estimated_delivery } = req.body;
    
    // Get order
    const orderResult = await query(
      'SELECT * FROM ecommerce_orders WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
    }
    
    const order = orderResult.rows[0];
    
    // Create fulfillment
    const result = await query(
      `INSERT INTO ecommerce_fulfillments 
       (order_id, tracking_number, carrier, tracking_url, items, notes, estimated_delivery, shipped_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), 'shipped')
       RETURNING *`,
      [id, tracking_number, carrier, tracking_url, items ? JSON.stringify(items) : null, notes, estimated_delivery]
    );
    
    // Update order status
    await query(
      `UPDATE ecommerce_orders SET fulfillment_status = 'fulfilled', status = 'shipped', updated_at = NOW() WHERE id = $1`,
      [id]
    );
    
    // Send shipping notification
    if (order.customer_email) {
      await sendShippingNotification(order.customer_email, order.customer_name, {
        orderNumber: order.external_order_number || order.external_order_id,
        trackingNumber: tracking_number,
        carrier: carrier || 'Standard Shipping',
        estimatedDelivery: estimated_delivery || '3-5 business days'
      });
    }
    
    res.json({ success: true, data: { fulfillment: result.rows[0] } });
  } catch (error) {
    next(error);
  }
});

// Get fulfillments for order
router.get('/:id/fulfillments', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const result = await query(
      'SELECT * FROM ecommerce_fulfillments WHERE order_id = $1 ORDER BY created_at DESC',
      [id]
    );
    
    res.json({ success: true, data: { fulfillments: result.rows } });
  } catch (error) {
    next(error);
  }
});

// Ship order (legacy endpoint)
router.post('/ship', async (req, res, next) => {
  try {
    const { 
      orderNumber, 
      customerEmail, 
      customerName, 
      trackingNumber, 
      carrier = 'Blue Dart',
      estimatedDelivery = '3-5 business days'
    } = req.body;

    if (!orderNumber || !customerEmail || !trackingNumber) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'Missing required fields: orderNumber, customerEmail, trackingNumber' }
      });
    }

    const result = await sendShippingNotification(customerEmail, customerName, {
      orderNumber,
      trackingNumber,
      carrier,
      estimatedDelivery
    });

    if (result.success) {
      res.json({
        success: true,
        data: {
          message: 'Shipping notification sent successfully',
          messageId: result.messageId
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: { code: 'EMAIL_FAILED', message: result.error }
      });
    }
  } catch (error) {
    next(error);
  }
});

module.exports = router;
