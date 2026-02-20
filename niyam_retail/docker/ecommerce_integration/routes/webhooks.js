// E-commerce Integration - Webhooks Routes
const express = require('express');
const crypto = require('crypto');
const { query, getClient } = require('@vruksha/platform/db/postgres');
const { handleNewOrder, isFirstOrder } = require('../utils/emailNotifications');
const { normalizeWebhookOrder } = require('../utils/platformAdapters');

const router = express.Router();
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// ============================================
// WEBHOOK SIGNATURE VERIFICATION
// ============================================

function verifyWebhookSignature(rawBody, signature, secret, platform) {
  if (!signature || !secret) return false;

  try {
    let expectedSignature;

    if (platform === 'shopify') {
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(rawBody);
      expectedSignature = hmac.digest('base64');
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } else if (platform === 'woocommerce') {
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(rawBody);
      expectedSignature = 'sha256=' + hmac.digest('base64');
      return signature === expectedSignature;
    } else {
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(rawBody);
      const hexSig = hmac.digest('hex');
      return signature === hexSig || signature === `sha256=${hexSig}`;
    }
  } catch (error) {
    console.error('Webhook signature verification error:', error.message);
    return false;
  }
}

function normalizeOrderData(webhookData, channelId) {
  if (webhookData.id && webhookData.email && webhookData.line_items) {
    // Shopify format
    return {
      id: `SHOP-${webhookData.id}`,
      platform: 'shopify',
      channel_id: channelId,
      customerEmail: webhookData.email,
      customerName: webhookData.customer?.first_name
        ? `${webhookData.customer.first_name} ${webhookData.customer.last_name || ''}`
        : webhookData.billing_address?.name || 'Customer',
      total: parseFloat(webhookData.total_price) || 0,
      items: (webhookData.line_items || []).map(item => ({
        name: item.name,
        sku: item.sku,
        quantity: item.quantity,
        price: parseFloat(item.price)
      })),
      raw: webhookData
    };
  } else if (webhookData.id && webhookData.billing) {
    // WooCommerce format
    return {
      id: `WOO-${webhookData.id}`,
      platform: 'woocommerce',
      channel_id: channelId,
      customerEmail: webhookData.billing?.email,
      customerName: `${webhookData.billing?.first_name || ''} ${webhookData.billing?.last_name || ''}`.trim() || 'Customer',
      total: parseFloat(webhookData.total) || 0,
      items: (webhookData.line_items || []).map(item => ({
        name: item.name,
        sku: item.sku,
        quantity: item.quantity,
        price: parseFloat(item.price)
      })),
      raw: webhookData
    };
  } else {
    // Generic format
    return {
      id: webhookData.order_id || webhookData.id || `WEB-${Date.now()}`,
      platform: 'unknown',
      channel_id: channelId,
      customerEmail: webhookData.customer_email || webhookData.email,
      customerName: webhookData.customer_name || 'Customer',
      total: webhookData.total || 0,
      items: webhookData.items || [],
      raw: webhookData
    };
  }
}

// ============================================
// WEBHOOK ENDPOINTS
// ============================================

// Orders webhook
router.post('/:channel_id/orders', async (req, res) => {
  const { channel_id } = req.params;
  const webhookData = req.body;

  console.log(`🔔 [WEBHOOK] Order received from ${channel_id}`);

  try {
    // Get channel configuration
    const channelResult = await query(
      'SELECT * FROM ecommerce_channels WHERE channel_id = $1',
      [channel_id]
    );

    const channel = channelResult.rows[0];

    // Log webhook
    await query(
      `INSERT INTO ecommerce_webhook_log 
       (channel_id, channel_identifier, event_type, payload, processing_status)
       VALUES ($1, $2, 'orders/create', $3, 'received')`,
      [channel?.id, channel_id, JSON.stringify(webhookData)]
    );

    // Verify signature if channel configured
    if (channel && channel.webhook_secret) {
      const signature = req.get('X-Shopify-Hmac-SHA256') ||
                       req.get('X-WC-Webhook-Signature') ||
                       req.get('X-Webhook-Signature') ||
                       req.get('X-Signature');

      if (!signature) {
        console.warn(`⚠️ [WEBHOOK] Missing signature for ${channel_id}`);
        return res.status(401).json({
          success: false,
          error: { code: 'MISSING_SIGNATURE', message: 'Webhook signature required' }
        });
      }

      const isValid = verifyWebhookSignature(
        req.rawBody,
        signature,
        channel.webhook_secret,
        channel.platform
      );

      if (!isValid) {
        console.warn(`⚠️ [WEBHOOK] Invalid signature for ${channel_id}`);
        await query(
          `UPDATE ecommerce_webhook_log SET signature_valid = false WHERE channel_identifier = $1 ORDER BY received_at DESC LIMIT 1`,
          [channel_id]
        );
        return res.status(401).json({
          success: false,
          error: { code: 'INVALID_SIGNATURE', message: 'Webhook signature verification failed' }
        });
      }

      console.log(`✅ [WEBHOOK] Signature verified for ${channel_id}`);
    }

    // Normalize order data
    let order;
    if (channel) {
      try {
        const config = JSON.parse(channel.config_encrypted || '{}');
        order = normalizeWebhookOrder(webhookData, channel.platform, config);
      } catch (e) {
        order = normalizeOrderData(webhookData, channel_id);
      }
    } else {
      order = normalizeOrderData(webhookData, channel_id);
    }

    // Store order
    if (channel) {
      await query(
        `INSERT INTO ecommerce_orders 
         (tenant_id, channel_id, external_order_id, external_order_number, platform, 
          customer_email, customer_name, items, total, status, source, raw_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', 'webhook', $10)
         ON CONFLICT (channel_id, external_order_id) DO NOTHING`,
        [
          channel.tenant_id, channel.id, order.id, order.order_number || order.id,
          channel.platform, order.customerEmail, order.customerName,
          JSON.stringify(order.items), order.total, JSON.stringify(order.raw || {})
        ]
      );
    }

    // Send email notifications
    if (order.customerEmail) {
      const isFirst = await isFirstOrder(order.customerEmail);
      await handleNewOrder({
        customerEmail: order.customerEmail,
        customerName: order.customerName || 'Valued Customer',
        isFirstOrder: isFirst,
        orderNumber: order.id,
        items: order.items || [],
        total: order.total || 0,
        storeName: 'Niyam Retail'
      });
    }

    // Update webhook log
    await query(
      `UPDATE ecommerce_webhook_log 
       SET processing_status = 'processed', signature_valid = true, processed_at = NOW() 
       WHERE channel_identifier = $1 ORDER BY received_at DESC LIMIT 1`,
      [channel_id]
    );

    // Update daily stats
    if (channel) {
      await query(
        `INSERT INTO ecommerce_daily_stats (tenant_id, channel_id, stat_date, orders_received, orders_total, webhooks_received)
         VALUES ($1, $2, CURRENT_DATE, 1, $3, 1)
         ON CONFLICT (tenant_id, channel_id, stat_date) 
         DO UPDATE SET 
           orders_received = ecommerce_daily_stats.orders_received + 1,
           orders_total = ecommerce_daily_stats.orders_total + $3,
           webhooks_received = ecommerce_daily_stats.webhooks_received + 1,
           updated_at = NOW()`,
        [channel.tenant_id, channel.id, order.total]
      );
    }

    res.json({
      success: true,
      data: {
        message: 'Order received and processed',
        order_id: order.id,
        platform: channel?.platform || 'unknown'
      }
    });
  } catch (error) {
    console.error(`❌ Webhook processing error:`, error);
    
    // Log error
    await query(
      `UPDATE ecommerce_webhook_log 
       SET processing_status = 'failed', error_message = $1, processed_at = NOW() 
       WHERE channel_identifier = $2 ORDER BY received_at DESC LIMIT 1`,
      [error.message, channel_id]
    ).catch(() => {});
    
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
});

// Inventory webhook
router.post('/:channel_id/inventory', async (req, res) => {
  const { channel_id } = req.params;
  const inventoryData = req.body;

  console.log(`🔔 [WEBHOOK] Inventory update from ${channel_id}`);

  try {
    // Get channel
    const channelResult = await query(
      'SELECT * FROM ecommerce_channels WHERE channel_id = $1',
      [channel_id]
    );

    const channel = channelResult.rows[0];

    // Log webhook
    await query(
      `INSERT INTO ecommerce_webhook_log 
       (channel_id, channel_identifier, event_type, payload, processing_status)
       VALUES ($1, $2, 'inventory/update', $3, 'received')`,
      [channel?.id, channel_id, JSON.stringify(inventoryData)]
    );

    // Verify signature if configured
    if (channel && channel.webhook_secret) {
      const signature = req.get('X-Shopify-Hmac-SHA256') ||
                       req.get('X-WC-Webhook-Signature') ||
                       req.get('X-Webhook-Signature');

      if (signature) {
        const isValid = verifyWebhookSignature(
          req.rawBody,
          signature,
          channel.webhook_secret,
          channel.platform
        );

        if (!isValid) {
          return res.status(401).json({
            success: false,
            error: { code: 'INVALID_SIGNATURE', message: 'Webhook signature verification failed' }
          });
        }
      }
    }

    // Update stats
    if (channel) {
      await query(
        `INSERT INTO ecommerce_daily_stats (tenant_id, channel_id, stat_date, inventory_syncs, webhooks_received)
         VALUES ($1, $2, CURRENT_DATE, 1, 1)
         ON CONFLICT (tenant_id, channel_id, stat_date) 
         DO UPDATE SET 
           inventory_syncs = ecommerce_daily_stats.inventory_syncs + 1,
           webhooks_received = ecommerce_daily_stats.webhooks_received + 1,
           updated_at = NOW()`,
        [channel.tenant_id, channel.id]
      );
    }

    res.json({
      success: true,
      data: {
        message: 'Inventory update received',
        items_updated: inventoryData.items?.length || 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
});

// Register webhooks with platform
router.post('/register', async (req, res, next) => {
  try {
    const { platform, channel_id, webhook_types = ['orders/create'] } = req.body;

    if (!platform || !channel_id) {
      return res.status(400).json({ 
        success: false, 
        error: { code: 'MISSING_FIELDS', message: 'platform and channel_id are required' } 
      });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const webhooks = webhook_types.map(type => ({
      type,
      url: `${baseUrl}/webhooks/${channel_id}/${type.includes('inventory') ? 'inventory' : 'orders'}`,
      status: 'pending_registration'
    }));

    res.json({
      success: true,
      data: {
        message: `Webhook URLs generated for ${platform}`,
        channel_id,
        webhooks,
        instructions: {
          shopify: 'Add these URLs in Shopify Admin > Settings > Notifications > Webhooks',
          woocommerce: 'Add these URLs in WooCommerce > Settings > Advanced > Webhooks'
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
