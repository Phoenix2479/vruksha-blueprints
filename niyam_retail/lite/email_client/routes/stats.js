/**
 * Stats & Settings Routes
 */

const express = require('express');
const router = express.Router();
const { query } = require('@vruksha/platform/db/postgres');
const { getDefaultSettings } = require('../lib/utils');

// Get email stats
router.get('/stats', async (req, res, next) => {
  try {
    const accountsResult = await query(
      `SELECT 
         COUNT(*) as total_accounts,
         COUNT(*) FILTER (WHERE status = 'connected') as connected_accounts
       FROM email_accounts WHERE tenant_id = $1`,
      [req.tenantId]
    );
    
    const messagesResult = await query(
      `SELECT 
         COUNT(*) as total_messages,
         COUNT(*) FILTER (WHERE is_read = false) as unread_messages,
         COUNT(*) FILTER (WHERE received_at::date = CURRENT_DATE) as today_messages
       FROM email_messages WHERE tenant_id = $1`,
      [req.tenantId]
    );
    
    const categoryResult = await query(
      `SELECT ai_category as category, COUNT(*) as count
       FROM email_messages WHERE tenant_id = $1 AND ai_category IS NOT NULL
       GROUP BY ai_category`,
      [req.tenantId]
    );
    
    const folderResult = await query(
      `SELECT f.name as folder, COUNT(m.id) as count
       FROM email_folders f
       LEFT JOIN email_messages m ON f.id = m.folder_id
       JOIN email_accounts a ON f.account_id = a.id
       WHERE a.tenant_id = $1
       GROUP BY f.name`,
      [req.tenantId]
    );

    const accounts = accountsResult.rows[0];
    const messages = messagesResult.rows[0];
    
    res.json({
      totalAccounts: parseInt(accounts.total_accounts),
      connectedAccounts: parseInt(accounts.connected_accounts),
      totalMessages: parseInt(messages.total_messages),
      unreadMessages: parseInt(messages.unread_messages),
      todayMessages: parseInt(messages.today_messages),
      byCategory: Object.fromEntries(categoryResult.rows.map(r => [r.category, parseInt(r.count)])),
      byFolder: Object.fromEntries(folderResult.rows.map(r => [r.folder, parseInt(r.count)]))
    });
  } catch (error) {
    next(error);
  }
});

// Get settings
router.get('/settings', async (req, res, next) => {
  try {
    const userId = req.user?.id || null;
    
    const result = await query(
      `SELECT * FROM email_settings 
       WHERE tenant_id = $1 AND (user_id = $2 OR user_id IS NULL) 
       ORDER BY user_id NULLS LAST LIMIT 1`,
      [req.tenantId, userId]
    );
    
    res.json(result.rows[0] || getDefaultSettings());
  } catch (error) {
    next(error);
  }
});

// Update settings
router.post('/settings', async (req, res, next) => {
  try {
    const userId = req.user?.id || null;
    const { 
      auto_refresh, refresh_interval, enable_ai, enable_smart_replies, 
      enable_categorization, notifications_enabled, notification_sound, 
      default_signature, reply_behavior, send_delay_seconds, theme, density 
    } = req.body;
    
    const result = await query(
      `INSERT INTO email_settings 
       (tenant_id, user_id, auto_refresh, refresh_interval, enable_ai, enable_smart_replies, 
        enable_categorization, notifications_enabled, notification_sound, default_signature, 
        reply_behavior, send_delay_seconds, theme, density)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (tenant_id, user_id) 
       DO UPDATE SET 
         auto_refresh = COALESCE(EXCLUDED.auto_refresh, email_settings.auto_refresh),
         refresh_interval = COALESCE(EXCLUDED.refresh_interval, email_settings.refresh_interval),
         enable_ai = COALESCE(EXCLUDED.enable_ai, email_settings.enable_ai),
         enable_smart_replies = COALESCE(EXCLUDED.enable_smart_replies, email_settings.enable_smart_replies),
         enable_categorization = COALESCE(EXCLUDED.enable_categorization, email_settings.enable_categorization),
         notifications_enabled = COALESCE(EXCLUDED.notifications_enabled, email_settings.notifications_enabled),
         notification_sound = COALESCE(EXCLUDED.notification_sound, email_settings.notification_sound),
         default_signature = COALESCE(EXCLUDED.default_signature, email_settings.default_signature),
         reply_behavior = COALESCE(EXCLUDED.reply_behavior, email_settings.reply_behavior),
         send_delay_seconds = COALESCE(EXCLUDED.send_delay_seconds, email_settings.send_delay_seconds),
         theme = COALESCE(EXCLUDED.theme, email_settings.theme),
         density = COALESCE(EXCLUDED.density, email_settings.density),
         updated_at = NOW()
       RETURNING *`,
      [req.tenantId, userId, auto_refresh, refresh_interval, enable_ai, enable_smart_replies,
       enable_categorization, notifications_enabled, notification_sound, default_signature,
       reply_behavior, send_delay_seconds, theme, density]
    );
    
    res.json({ message: 'Settings updated successfully', settings: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
