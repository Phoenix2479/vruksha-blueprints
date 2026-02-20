/**
 * Message Management Routes
 */

const express = require('express');
const router = express.Router();
const { query } = require('@vruksha/platform/db/postgres');
const EmailService = require('../services/email-service');
const { parseConfig } = require('../lib/utils');

const emailService = new EmailService(query);

// List messages
router.get('/', async (req, res, next) => {
  try {
    const { account, folder = 'INBOX', limit = 50, offset = 0 } = req.query;

    let sql = `
      SELECT m.*, f.name as folder_name
      FROM email_messages m
      LEFT JOIN email_folders f ON m.folder_id = f.id
      JOIN email_accounts a ON m.account_id = a.id
      WHERE m.tenant_id = $1
    `;
    const params = [req.tenantId];
    let idx = 2;

    if (account) {
      sql += ` AND a.email = $${idx++}`;
      params.push(account);
    }

    if (folder) {
      sql += ` AND f.name = $${idx++}`;
      params.push(folder);
    }

    // Count total
    const countResult = await query(
      sql.replace('SELECT m.*, f.name as folder_name', 'SELECT COUNT(*)'),
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get paginated results
    sql += ` ORDER BY m.received_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(sql, params);

    res.json({
      messages: result.rows,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    next(error);
  }
});

// Fetch new messages from server
router.post('/fetch', async (req, res, next) => {
  try {
    const { account, folder = 'INBOX' } = req.body;

    if (!account) {
      return res.status(400).json({ error: 'Account email required' });
    }

    // Get account from DB
    const accountResult = await query(
      'SELECT * FROM email_accounts WHERE tenant_id = $1 AND email = $2',
      [req.tenantId, account]
    );

    if (accountResult.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const accountData = accountResult.rows[0];
    const config = parseConfig(accountData.config_encrypted);

    // Fetch messages from provider
    const fetchedMessages = await emailService.fetchMessages(
      accountData.provider,
      config,
      folder,
      50
    );

    // Get folder ID
    const folderResult = await query(
      `SELECT id FROM email_folders WHERE account_id = $1 AND name = $2`,
      [accountData.id, folder]
    );
    const folderId = folderResult.rows[0]?.id;

    // Store messages in DB
    for (const msg of fetchedMessages) {
      await query(
        `INSERT INTO email_messages 
         (tenant_id, account_id, folder_id, message_id, subject, from_address, to_address, 
          received_at, body_text, body_html, is_read, ai_category, ai_priority)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (account_id, message_id) DO UPDATE SET
           is_read = COALESCE(email_messages.is_read, EXCLUDED.is_read),
           updated_at = NOW()`,
        [
          req.tenantId, accountData.id, folderId, msg.id, msg.subject,
          msg.from, msg.to, msg.date, msg.body, msg.body,
          msg.read || false, msg.category, msg.priority
        ]
      );
    }

    // Update last sync
    await query(
      'UPDATE email_accounts SET last_sync_at = NOW() WHERE id = $1',
      [accountData.id]
    );

    // Cache messages
    emailService.cacheMessages(req.tenantId, account, fetchedMessages);

    res.json({
      message: 'Messages fetched successfully',
      count: fetchedMessages.length,
      messages: fetchedMessages
    });
  } catch (error) {
    console.error('Fetch messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages', details: error.message });
  }
});

// Get single message
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { account } = req.query;

    let sql = `
      SELECT m.*, a.email as account_email
      FROM email_messages m
      JOIN email_accounts a ON m.account_id = a.id
      WHERE m.tenant_id = $1 AND m.id = $2
    `;
    const params = [req.tenantId, id];

    if (account) {
      sql += ' AND a.email = $3';
      params.push(account);
    }

    const result = await query(sql, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Mark as read
    await query('UPDATE email_messages SET is_read = true WHERE id = $1', [id]);

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Send email
router.post('/send', async (req, res, next) => {
  try {
    const { from, to, subject, body, cc, bcc, attachments } = req.body;

    if (!from || !to || !subject || !body) {
      return res.status(400).json({ error: 'Missing required fields (from, to, subject, body)' });
    }

    // Get sender account
    const accountResult = await query(
      'SELECT * FROM email_accounts WHERE tenant_id = $1 AND email = $2',
      [req.tenantId, from]
    );

    if (accountResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sender account not found' });
    }

    const account = accountResult.rows[0];
    const config = parseConfig(account.config_encrypted);

    // Send email
    const result = await emailService.sendEmail(
      account.provider,
      config,
      { to, subject, body, cc, bcc, attachments }
    );

    res.json({ message: 'Email sent successfully', messageId: result.messageId });
  } catch (error) {
    console.error('Send email error:', error);
    res.status(500).json({ error: 'Failed to send email', details: error.message });
  }
});

// Search messages
router.post('/search', async (req, res, next) => {
  try {
    const { query: searchQuery, account, folder } = req.body;

    let sql = `
      SELECT m.*, a.email as account_email, f.name as folder_name
      FROM email_messages m
      JOIN email_accounts a ON m.account_id = a.id
      LEFT JOIN email_folders f ON m.folder_id = f.id
      WHERE m.tenant_id = $1
    `;
    const params = [req.tenantId];
    let idx = 2;

    if (account) {
      sql += ` AND a.email = $${idx++}`;
      params.push(account);
    }

    if (folder) {
      sql += ` AND f.name = $${idx++}`;
      params.push(folder);
    }

    if (searchQuery) {
      sql += ` AND (m.subject ILIKE $${idx} OR m.from_address ILIKE $${idx} OR m.body_text ILIKE $${idx})`;
      params.push(`%${searchQuery}%`);
      idx++;
    }

    sql += ' ORDER BY m.received_at DESC LIMIT 100';

    const result = await query(sql, params);

    res.json({ messages: result.rows, total: result.rows.length });
  } catch (error) {
    next(error);
  }
});

// Delete message
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM email_messages WHERE tenant_id = $1 AND id = $2 RETURNING id',
      [req.tenantId, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Mark as read/unread
router.patch('/:id/read', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { read } = req.body;

    const result = await query(
      'UPDATE email_messages SET is_read = $1 WHERE tenant_id = $2 AND id = $3 RETURNING *',
      [read !== false, req.tenantId, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json({ message: 'Message updated', data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
