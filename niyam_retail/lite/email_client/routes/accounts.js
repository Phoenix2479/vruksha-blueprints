/**
 * Account Management Routes
 */

const express = require('express');
const router = express.Router();
const { query } = require('@vruksha/platform/db/postgres');
const EmailService = require('../services/email-service');
const { parseConfig, encryptConfig, DEFAULT_FOLDERS } = require('../lib/utils');

const emailService = new EmailService(query);

// List all connected accounts
router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, email, provider, status, display_name, last_sync_at, is_default, created_at
       FROM email_accounts WHERE tenant_id = $1 ORDER BY is_default DESC, email`,
      [req.tenantId]
    );
    res.json({ accounts: result.rows, total: result.rows.length });
  } catch (error) {
    next(error);
  }
});

// Connect email account
router.post('/connect', async (req, res, next) => {
  try {
    const { email, provider, config, display_name } = req.body;

    if (!email || !provider) {
      return res.status(400).json({ error: 'Email and provider required' });
    }

    if (provider === 'imap') {
      const { imapHost, smtpHost, username, password } = config || {};
      if (!imapHost || !smtpHost || !username || !password) {
        return res.status(400).json({ error: 'IMAP/SMTP configuration incomplete' });
      }
    }

    const configEncrypted = encryptConfig(config);

    const result = await query(
      `INSERT INTO email_accounts 
       (tenant_id, email, provider, display_name, config_encrypted, status)
       VALUES ($1, $2, $3, $4, $5, 'connected')
       ON CONFLICT (tenant_id, email) 
       DO UPDATE SET provider = EXCLUDED.provider, config_encrypted = EXCLUDED.config_encrypted, 
                     status = 'connected', updated_at = NOW()
       RETURNING id, email, provider, status`,
      [req.tenantId, email, provider, display_name || email.split('@')[0], configEncrypted]
    );

    const accountId = result.rows[0].id;

    // Create default folders
    for (const folder of DEFAULT_FOLDERS) {
      await query(
        `INSERT INTO email_folders (account_id, name, full_path, folder_type)
         VALUES ($1, $2, $2, $3) ON CONFLICT (account_id, full_path) DO NOTHING`,
        [accountId, folder.name, folder.folder_type]
      );
    }

    res.json({ message: 'Account connected successfully', account: result.rows[0] });
  } catch (error) {
    console.error('Connect account error:', error);
    next(error);
  }
});

// Test account connection
router.get('/:email/test', async (req, res, next) => {
  try {
    const { email } = req.params;
    
    const result = await query(
      'SELECT * FROM email_accounts WHERE tenant_id = $1 AND email = $2',
      [req.tenantId, email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const account = result.rows[0];
    const config = parseConfig(account.config_encrypted);
    const testResult = await emailService.testConnection(account.provider, config);

    res.json(testResult);
  } catch (error) {
    next(error);
  }
});

// Disconnect account
router.delete('/:email', async (req, res, next) => {
  try {
    const { email } = req.params;

    const result = await query(
      'DELETE FROM email_accounts WHERE tenant_id = $1 AND email = $2 RETURNING email',
      [req.tenantId, email]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({ message: 'Account disconnected successfully', email });
  } catch (error) {
    next(error);
  }
});

// Set default account
router.patch('/:email/default', async (req, res, next) => {
  try {
    const { email } = req.params;

    // Reset all accounts
    await query(
      'UPDATE email_accounts SET is_default = false WHERE tenant_id = $1',
      [req.tenantId]
    );

    // Set new default
    const result = await query(
      'UPDATE email_accounts SET is_default = true WHERE tenant_id = $1 AND email = $2 RETURNING *',
      [req.tenantId, email]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({ message: 'Default account updated', account: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
