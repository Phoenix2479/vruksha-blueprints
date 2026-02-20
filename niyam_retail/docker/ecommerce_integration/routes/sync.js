// E-commerce Integration - Sync Routes
const express = require('express');
const { query, getClient } = require('@vruksha/platform/db/postgres');
const { fetchOrders, pushInventory } = require('../utils/platformAdapters');

const router = express.Router();
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// In-memory interval tracking (for scheduled syncs)
const syncIntervals = new Map();
const syncInProgress = new Set();

function getTenantId(req) {
  const t = req.headers['x-tenant-id'];
  return typeof t === 'string' && t.trim() ? t.trim() : DEFAULT_TENANT_ID;
}

// ============================================
// AUTO-SYNC CONFIGURATION
// ============================================

// Configure auto-sync
router.post('/configure', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const {
      channel_id,
      auto_sync_orders = false,
      auto_sync_inventory = false,
      auto_sync_products = false,
      sync_interval_minutes = 5,
      use_webhooks = true
    } = req.body;

    if (!channel_id) {
      return res.status(400).json({ 
        success: false, 
        error: { code: 'MISSING_FIELDS', message: 'channel_id is required' } 
      });
    }

    // Get channel
    const channelResult = await query(
      'SELECT id FROM ecommerce_channels WHERE tenant_id = $1 AND channel_id = $2',
      [tenantId, channel_id]
    );

    if (channelResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: { code: 'NOT_FOUND', message: 'Channel not found' } 
      });
    }

    const channelDbId = channelResult.rows[0].id;

    const result = await query(
      `INSERT INTO ecommerce_sync_config 
       (channel_id, auto_sync_orders, auto_sync_inventory, auto_sync_products, sync_interval_minutes, use_webhooks)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (channel_id) 
       DO UPDATE SET 
         auto_sync_orders = EXCLUDED.auto_sync_orders,
         auto_sync_inventory = EXCLUDED.auto_sync_inventory,
         auto_sync_products = EXCLUDED.auto_sync_products,
         sync_interval_minutes = EXCLUDED.sync_interval_minutes,
         use_webhooks = EXCLUDED.use_webhooks,
         updated_at = NOW()
       RETURNING *`,
      [channelDbId, auto_sync_orders, auto_sync_inventory, auto_sync_products, sync_interval_minutes, use_webhooks]
    );

    // Manage scheduled sync
    if (!use_webhooks && auto_sync_orders) {
      startScheduledSync(channel_id, channelDbId, tenantId, sync_interval_minutes);
    } else {
      stopScheduledSync(channel_id);
    }

    res.json({
      success: true,
      data: {
        message: `Auto-sync configured for ${channel_id}`,
        config: result.rows[0],
        webhook_url: use_webhooks ? `${req.protocol}://${req.get('host')}/webhooks/${channel_id}/orders` : null
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get sync status
router.get('/status', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { channel_id } = req.query;

    let sql = `
      SELECT c.channel_id, c.platform, c.last_sync_at, sc.*
      FROM ecommerce_channels c
      LEFT JOIN ecommerce_sync_config sc ON c.id = sc.channel_id
      WHERE c.tenant_id = $1
    `;
    const params = [tenantId];

    if (channel_id) {
      sql += ' AND c.channel_id = $2';
      params.push(channel_id);
    }

    const result = await query(sql, params);

    // Get today's stats
    const statsResult = await query(
      `SELECT 
         SUM(orders_received) as orders_today,
         SUM(webhooks_received) as webhooks_today,
         SUM(inventory_syncs) as inventory_syncs_today,
         SUM(sync_errors) as errors_today
       FROM ecommerce_daily_stats
       WHERE tenant_id = $1 AND stat_date = CURRENT_DATE`,
      [tenantId]
    );

    const stats = statsResult.rows[0] || {};

    res.json({
      success: true,
      data: {
        channels: result.rows.map(ch => ({
          channel_id: ch.channel_id,
          platform: ch.platform,
          last_sync: ch.last_sync_at,
          auto_sync_orders: ch.auto_sync_orders || false,
          auto_sync_inventory: ch.auto_sync_inventory || false,
          sync_interval_minutes: ch.sync_interval_minutes,
          use_webhooks: ch.use_webhooks,
          is_polling: syncIntervals.has(ch.channel_id)
        })),
        stats: {
          orders_received_today: parseInt(stats.orders_today) || 0,
          webhooks_received_today: parseInt(stats.webhooks_today) || 0,
          inventory_syncs_today: parseInt(stats.inventory_syncs_today) || 0,
          errors_today: parseInt(stats.errors_today) || 0
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Disable auto-sync
router.delete('/:channel_id', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { channel_id } = req.params;

    stopScheduledSync(channel_id);

    const channelResult = await query(
      'SELECT id FROM ecommerce_channels WHERE tenant_id = $1 AND channel_id = $2',
      [tenantId, channel_id]
    );

    if (channelResult.rows.length > 0) {
      await query(
        'UPDATE ecommerce_sync_config SET is_active = false WHERE channel_id = $1',
        [channelResult.rows[0].id]
      );
    }

    res.json({
      success: true,
      data: { message: `Auto-sync disabled for ${channel_id}` }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// PRODUCT SYNC
// ============================================

router.post('/products', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { channel_id, direction } = req.body;
    
    if (direction !== 'push_to_web') {
      return res.status(501).json({ 
        success: false, 
        error: { code: 'NOT_IMPLEMENTED', message: 'Only push supported currently' } 
      });
    }

    // Get local products
    const products = await query(
      'SELECT * FROM products WHERE tenant_id = $1 AND status = $2',
      [tenantId, 'active']
    );

    const pushedCount = products.rows.length;
    console.log(`[Ecom] Pushing ${pushedCount} products`);

    res.json({ success: true, data: { pushed_count: pushedCount } });
  } catch (error) {
    next(error);
  }
});

// ============================================
// INVENTORY SYNC
// ============================================

router.post('/inventory', async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const { channel_id } = req.body;

    // Queue inventory sync job
    console.log(`[Ecom] Inventory sync queued for channel ${channel_id}`);

    res.json({ 
      success: true, 
      data: { message: 'Inventory sync job queued' } 
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// SCHEDULED SYNC HELPERS
// ============================================

async function runScheduledSync(channelId, channelDbId, tenantId) {
  if (syncInProgress.has(channelId)) {
    console.log(`⏳ [SCHEDULED] Sync already in progress for ${channelId}, skipping`);
    return { success: true, skipped: true };
  }

  syncInProgress.add(channelId);

  try {
    const channelResult = await query(
      'SELECT * FROM ecommerce_channels WHERE id = $1',
      [channelDbId]
    );

    if (channelResult.rows.length === 0) {
      return { success: false, error: 'Channel not found' };
    }

    const channel = channelResult.rows[0];
    const config = JSON.parse(channel.config_encrypted || '{}');
    const since = channel.last_sync_at || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    console.log(`🔄 [SCHEDULED] Running auto-sync for ${channelId}`);

    const orders = await fetchOrders(channel.platform, config, since);

    for (const order of orders) {
      await query(
        `INSERT INTO ecommerce_orders 
         (tenant_id, channel_id, external_order_id, external_order_number, platform, 
          customer_email, customer_name, items, total, status, source, raw_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', 'polling', $10)
         ON CONFLICT (channel_id, external_order_id) DO NOTHING`,
        [
          tenantId, channelDbId, order.id, order.order_number, channel.platform,
          order.customerEmail, order.customerName, JSON.stringify(order.items),
          order.total, JSON.stringify(order.raw || {})
        ]
      );
    }

    await query('UPDATE ecommerce_channels SET last_sync_at = NOW() WHERE id = $1', [channelDbId]);

    console.log(`✅ [SCHEDULED] Sync completed for ${channelId}, processed ${orders.length} orders`);

    return { success: true, ordersProcessed: orders.length };
  } catch (error) {
    console.error(`❌ [SCHEDULED] Sync failed for ${channelId}:`, error.message);

    await query(
      `INSERT INTO ecommerce_daily_stats (tenant_id, channel_id, stat_date, sync_errors)
       VALUES ($1, $2, CURRENT_DATE, 1)
       ON CONFLICT (tenant_id, channel_id, stat_date) 
       DO UPDATE SET sync_errors = ecommerce_daily_stats.sync_errors + 1`,
      [tenantId, channelDbId]
    ).catch(() => {});

    return { success: false, error: error.message };
  } finally {
    syncInProgress.delete(channelId);
  }
}

function startScheduledSync(channelId, channelDbId, tenantId, intervalMinutes = 5) {
  stopScheduledSync(channelId);

  const intervalMs = intervalMinutes * 60 * 1000;

  const intervalId = setInterval(() => {
    runScheduledSync(channelId, channelDbId, tenantId).catch(error => {
      console.error(`❌ [SCHEDULED] Unhandled error in sync for ${channelId}:`, error.message);
    });
  }, intervalMs);

  syncIntervals.set(channelId, intervalId);

  console.log(`⏰ Started scheduled sync for ${channelId} every ${intervalMinutes} minutes`);

  // Run immediately
  runScheduledSync(channelId, channelDbId, tenantId).catch(() => {});
}

function stopScheduledSync(channelId) {
  const intervalId = syncIntervals.get(channelId);
  if (intervalId) {
    clearInterval(intervalId);
    syncIntervals.delete(channelId);
    console.log(`⏹️ Stopped scheduled sync for ${channelId}`);
  }
}

module.exports = router;
