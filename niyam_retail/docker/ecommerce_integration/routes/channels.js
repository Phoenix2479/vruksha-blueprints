// E-commerce Integration - Channels Routes
const express = require('express');
const crypto = require('crypto');
const { query, getClient } = require('@vruksha/platform/db/postgres');
const { fetchOrders, registerWebhook } = require('../utils/platformAdapters');

const router = express.Router();
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function getTenantId(req) {
  const t = req.headers['x-tenant-id'];
  return typeof t === 'string' && t.trim() ? t.trim() : DEFAULT_TENANT_ID;
}

function generateWebhookSecret() {
  return crypto.randomBytes(32).toString('hex');
}

// ============================================
// CHANNEL MANAGEMENT
// ============================================

// List all connected channels
router.get('/', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    
    const result = await query(
      `SELECT c.*, 
              sc.auto_sync_orders, sc.auto_sync_inventory, sc.sync_interval_minutes, sc.use_webhooks
       FROM ecommerce_channels c
       LEFT JOIN ecommerce_sync_config sc ON c.id = sc.channel_id
       WHERE c.tenant_id = $1
       ORDER BY c.created_at DESC`,
      [tenantId]
    );
    
    res.json({
      success: true,
      data: {
        total: result.rows.length,
        channels: result.rows.map(ch => ({
          id: ch.id,
          channel_id: ch.channel_id,
          platform: ch.platform,
          display_name: ch.display_name,
          shop_url: ch.shop_url,
          status: ch.status,
          last_sync_at: ch.last_sync_at,
          auto_sync: {
            enabled: ch.auto_sync_orders || false,
            interval_minutes: ch.sync_interval_minutes,
            use_webhooks: ch.use_webhooks
          },
          created_at: ch.created_at
        }))
      }
    });
  } catch (error) {
    next(error);
  }
});

// Connect a new channel
router.post('/connect', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const {
      channel_id,
      platform,
      shop_url,
      api_key,
      api_secret,
      consumer_key,
      consumer_secret,
      display_name
    } = req.body;

    if (!channel_id || !platform || !shop_url) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'channel_id, platform, and shop_url are required' }
      });
    }

    const validPlatforms = ['shopify', 'woocommerce', 'custom'];
    if (!validPlatforms.includes(platform.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PLATFORM', message: `Invalid platform. Supported: ${validPlatforms.join(', ')}` }
      });
    }

    // Build platform-specific config
    let config = {};
    switch (platform.toLowerCase()) {
      case 'shopify':
        if (!api_key || !api_secret) {
          return res.status(400).json({
            success: false,
            error: { code: 'MISSING_CREDENTIALS', message: 'Shopify requires api_key and api_secret' }
          });
        }
        config = { shop_url, api_key, api_secret };
        break;

      case 'woocommerce':
        const wooKey = consumer_key || api_key;
        const wooSecret = consumer_secret || api_secret;
        if (!wooKey || !wooSecret) {
          return res.status(400).json({
            success: false,
            error: { code: 'MISSING_CREDENTIALS', message: 'WooCommerce requires consumer_key and consumer_secret' }
          });
        }
        config = { shop_url, consumer_key: wooKey, consumer_secret: wooSecret };
        break;

      case 'custom':
        config = { api_url: shop_url, api_key };
        break;
    }

    const webhookSecret = generateWebhookSecret();
    const configEncrypted = JSON.stringify(config);

    const result = await query(
      `INSERT INTO ecommerce_channels 
       (tenant_id, channel_id, platform, display_name, shop_url, config_encrypted, webhook_secret, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'connected')
       ON CONFLICT (tenant_id, channel_id) 
       DO UPDATE SET 
         platform = EXCLUDED.platform,
         config_encrypted = EXCLUDED.config_encrypted,
         shop_url = EXCLUDED.shop_url,
         status = 'connected',
         updated_at = NOW()
       RETURNING *`,
      [tenantId, channel_id, platform.toLowerCase(), display_name || channel_id, shop_url, configEncrypted, webhookSecret]
    );

    const channel = result.rows[0];

    console.log(`✅ Connected channel ${channel_id} (${platform})`);

    res.json({
      success: true,
      data: {
        message: `Connected to ${platform} successfully`,
        channel: {
          id: channel.id,
          channel_id: channel.channel_id,
          platform: channel.platform,
          display_name: channel.display_name,
          shop_url,
          connected_at: channel.created_at
        },
        webhook_url: `${req.protocol}://${req.get('host')}/webhooks/${channel_id}/orders`,
        webhook_secret: webhookSecret
      }
    });
  } catch (error) {
    next(error);
  }
});

// Configure custom API channel
router.post('/custom-api', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const {
      channel_id,
      api_url,
      api_key,
      auth_type = 'bearer',
      auth_header_name = 'Authorization',
      orders_endpoint = '/orders',
      date_param_name = 'since',
      date_format = 'iso',
      response_path = 'orders',
      field_mapping = {},
      display_name
    } = req.body;

    if (!channel_id || !api_url) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'channel_id and api_url are required' }
      });
    }

    const config = {
      api_url,
      api_key,
      auth_type,
      auth_header_name,
      orders_endpoint,
      date_param_name,
      date_format,
      response_path,
      field_mapping
    };

    const webhookSecret = generateWebhookSecret();

    const result = await query(
      `INSERT INTO ecommerce_channels 
       (tenant_id, channel_id, platform, display_name, shop_url, config_encrypted, webhook_secret, status)
       VALUES ($1, $2, 'custom', $3, $4, $5, $6, 'connected')
       ON CONFLICT (tenant_id, channel_id) 
       DO UPDATE SET 
         config_encrypted = EXCLUDED.config_encrypted,
         shop_url = EXCLUDED.shop_url,
         status = 'connected',
         updated_at = NOW()
       RETURNING *`,
      [tenantId, channel_id, display_name || channel_id, api_url, JSON.stringify(config), webhookSecret]
    );

    res.json({
      success: true,
      data: {
        message: 'Custom API channel configured successfully',
        channel: result.rows[0],
        webhook_url: `${req.protocol}://${req.get('host')}/webhooks/${channel_id}/orders`,
        webhook_secret: webhookSecret
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get channel by ID
router.get('/:channel_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { channel_id } = req.params;
    
    const result = await query(
      `SELECT c.*, sc.*
       FROM ecommerce_channels c
       LEFT JOIN ecommerce_sync_config sc ON c.id = sc.channel_id
       WHERE c.tenant_id = $1 AND c.channel_id = $2`,
      [tenantId, channel_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Channel not found' } });
    }
    
    res.json({ success: true, data: { channel: result.rows[0] } });
  } catch (error) {
    next(error);
  }
});

// Disconnect channel
router.delete('/:channel_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { channel_id } = req.params;

    const result = await query(
      'DELETE FROM ecommerce_channels WHERE tenant_id = $1 AND channel_id = $2 RETURNING channel_id',
      [tenantId, channel_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Channel not found' } });
    }

    console.log(`🗑️ Disconnected channel ${channel_id}`);

    res.json({
      success: true,
      data: { message: `Channel ${channel_id} disconnected` }
    });
  } catch (error) {
    next(error);
  }
});

// Test channel connection
router.post('/:channel_id/test', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { channel_id } = req.params;

    const channelResult = await query(
      'SELECT * FROM ecommerce_channels WHERE tenant_id = $1 AND channel_id = $2',
      [tenantId, channel_id]
    );

    if (channelResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Channel not found' } });
    }

    const channel = channelResult.rows[0];
    const config = JSON.parse(channel.config_encrypted || '{}');
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const orders = await fetchOrders(channel.platform, config, since);

    res.json({
      success: true,
      data: {
        message: `Connection successful! Found ${orders.length} orders in last 7 days`,
        sample_orders: orders.slice(0, 3).map(o => ({
          id: o.id,
          order_number: o.order_number,
          customer: o.customerName,
          total: o.total,
          status: o.status,
          created_at: o.created_at
        }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'CONNECTION_FAILED', message: error.message }
    });
  }
});

// Manual sync
router.post('/:channel_id/sync-now', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { channel_id } = req.params;
    const { since_date } = req.body;

    const channelResult = await query(
      'SELECT * FROM ecommerce_channels WHERE tenant_id = $1 AND channel_id = $2',
      [tenantId, channel_id]
    );

    if (channelResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Channel not found' } });
    }

    const channel = channelResult.rows[0];
    const config = JSON.parse(channel.config_encrypted || '{}');
    const since = since_date || channel.last_sync_at || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    console.log(`🔄 [MANUAL] Syncing orders from ${channel.platform} since ${since}`);

    const orders = await fetchOrders(channel.platform, config, since);

    // Store orders
    for (const order of orders) {
      await query(
        `INSERT INTO ecommerce_orders 
         (tenant_id, channel_id, external_order_id, external_order_number, platform, 
          customer_email, customer_name, items, total, status, source, external_created_at, raw_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'manual', $11, $12)
         ON CONFLICT (channel_id, external_order_id) DO NOTHING`,
        [
          tenantId, channel.id, order.id, order.order_number, channel.platform,
          order.customerEmail, order.customerName, JSON.stringify(order.items),
          order.total, order.status || 'pending', order.created_at, JSON.stringify(order.raw || {})
        ]
      );
    }

    // Update last sync
    await query(
      'UPDATE ecommerce_channels SET last_sync_at = NOW() WHERE id = $1',
      [channel.id]
    );

    res.json({
      success: true,
      data: {
        message: `Synced ${orders.length} orders from ${channel.platform}`,
        orders_processed: orders.length
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
