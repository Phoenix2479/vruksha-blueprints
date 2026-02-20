/**
 * OAuth Routes for Email Client
 * 
 * Handles OAuth2 flows for Google (Gmail) and Microsoft (Outlook).
 */

const express = require('express');
const crypto = require('crypto');
const { query } = require('@vruksha/platform/db/postgres');
const {
  getGoogleAuthUrl,
  exchangeGoogleCode,
  refreshGoogleToken,
  isGoogleConfigured,
  getMicrosoftAuthUrl,
  exchangeMicrosoftCode,
  refreshMicrosoftToken,
  isMicrosoftConfigured,
  getOAuthStatus,
} = require('../lib/oauth-providers');

const router = express.Router();

// Store pending OAuth states (in production, use Redis or database)
const pendingStates = new Map();
const STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

// Default tenant ID
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function getTenantId(req) {
  const t = req.headers['x-tenant-id'];
  return typeof t === 'string' && t.trim() ? t.trim() : DEFAULT_TENANT_ID;
}

/**
 * Generate a random state for OAuth
 */
function generateState() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Store pending OAuth state
 */
function storePendingState(state, data) {
  pendingStates.set(state, {
    ...data,
    createdAt: Date.now(),
  });

  // Clean up expired states
  setTimeout(() => {
    pendingStates.delete(state);
  }, STATE_EXPIRY_MS);
}

/**
 * Get and remove pending state
 */
function getPendingState(state) {
  const data = pendingStates.get(state);
  if (!data) return null;

  // Check if expired
  if (Date.now() - data.createdAt > STATE_EXPIRY_MS) {
    pendingStates.delete(state);
    return null;
  }

  pendingStates.delete(state);
  return data;
}

// ============================================================================
// OAuth Status
// ============================================================================

/**
 * Get OAuth configuration status
 */
router.get('/status', (_req, res) => {
  res.json(getOAuthStatus());
});

// ============================================================================
// Google OAuth
// ============================================================================

/**
 * Initiate Google OAuth flow
 */
router.get('/google', (req, res) => {
  try {
    if (!isGoogleConfigured()) {
      return res.status(503).json({
        error: 'Google OAuth not configured',
        message: 'Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.',
      });
    }

    const tenantId = getTenantId(req);
    const returnUrl = req.query.return_url || '/';
    const state = generateState();

    storePendingState(state, {
      provider: 'google',
      tenantId,
      returnUrl,
    });

    const authUrl = getGoogleAuthUrl(state);
    res.redirect(authUrl);
  } catch (error) {
    console.error('Google OAuth initiation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Google OAuth callback
 */
router.get('/google/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      return res.redirect(`/?error=${encodeURIComponent(oauthError)}`);
    }

    if (!code || !state) {
      return res.redirect('/?error=missing_params');
    }

    const pendingData = getPendingState(state);
    if (!pendingData) {
      return res.redirect('/?error=invalid_state');
    }

    // Exchange code for tokens
    const tokens = await exchangeGoogleCode(code);

    // Store account in database
    const configEncrypted = JSON.stringify({
      provider: 'gmail',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    });

    await query(
      `INSERT INTO email_accounts 
       (tenant_id, email, provider, display_name, config_encrypted, oauth_tokens_encrypted, status)
       VALUES ($1, $2, 'gmail', $3, $4, $4, 'connected')
       ON CONFLICT (tenant_id, email) 
       DO UPDATE SET 
         config_encrypted = EXCLUDED.config_encrypted,
         oauth_tokens_encrypted = EXCLUDED.oauth_tokens_encrypted,
         status = 'connected',
         updated_at = NOW()
       RETURNING id`,
      [pendingData.tenantId, tokens.email, tokens.name || tokens.email.split('@')[0], configEncrypted]
    );

    // Create default folders
    const accountResult = await query(
      'SELECT id FROM email_accounts WHERE tenant_id = $1 AND email = $2',
      [pendingData.tenantId, tokens.email]
    );

    if (accountResult.rows.length > 0) {
      const accountId = accountResult.rows[0].id;
      const defaultFolders = [
        { name: 'INBOX', folder_type: 'inbox' },
        { name: 'Sent', folder_type: 'sent' },
        { name: 'Drafts', folder_type: 'drafts' },
        { name: 'Trash', folder_type: 'trash' },
        { name: 'Spam', folder_type: 'spam' },
      ];

      for (const folder of defaultFolders) {
        await query(
          `INSERT INTO email_folders (account_id, name, full_path, folder_type)
           VALUES ($1, $2, $2, $3)
           ON CONFLICT (account_id, full_path) DO NOTHING`,
          [accountId, folder.name, folder.folder_type]
        );
      }
    }

    // Redirect back to app
    const successUrl = `${pendingData.returnUrl}?connected=google&email=${encodeURIComponent(tokens.email)}`;
    res.redirect(successUrl);
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    res.redirect(`/?error=${encodeURIComponent(error.message)}`);
  }
});

/**
 * Refresh Google token for an account
 */
router.post('/google/refresh', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    // Get account
    const result = await query(
      'SELECT * FROM email_accounts WHERE tenant_id = $1 AND email = $2 AND provider = $3',
      [tenantId, email, 'gmail']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const account = result.rows[0];
    const config = JSON.parse(account.oauth_tokens_encrypted || account.config_encrypted || '{}');

    if (!config.refreshToken) {
      return res.status(400).json({ error: 'No refresh token available. Please reconnect the account.' });
    }

    // Refresh token
    const newTokens = await refreshGoogleToken(config.refreshToken);

    // Update database
    const updatedConfig = JSON.stringify({
      ...config,
      accessToken: newTokens.accessToken,
      expiresAt: newTokens.expiresAt,
    });

    await query(
      'UPDATE email_accounts SET config_encrypted = $1, oauth_tokens_encrypted = $1, updated_at = NOW() WHERE id = $2',
      [updatedConfig, account.id]
    );

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      expiresAt: newTokens.expiresAt,
    });
  } catch (error) {
    console.error('Google token refresh error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Microsoft OAuth
// ============================================================================

/**
 * Initiate Microsoft OAuth flow
 */
router.get('/microsoft', async (req, res) => {
  try {
    if (!isMicrosoftConfigured()) {
      return res.status(503).json({
        error: 'Microsoft OAuth not configured',
        message: 'Please set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET environment variables.',
      });
    }

    const tenantId = getTenantId(req);
    const returnUrl = req.query.return_url || '/';
    const state = generateState();

    storePendingState(state, {
      provider: 'microsoft',
      tenantId,
      returnUrl,
    });

    const authUrl = await getMicrosoftAuthUrl(state);
    res.redirect(authUrl);
  } catch (error) {
    console.error('Microsoft OAuth initiation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Microsoft OAuth callback
 */
router.get('/microsoft/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError, error_description } = req.query;

    if (oauthError) {
      const errorMsg = error_description || oauthError;
      return res.redirect(`/?error=${encodeURIComponent(errorMsg)}`);
    }

    if (!code || !state) {
      return res.redirect('/?error=missing_params');
    }

    const pendingData = getPendingState(state);
    if (!pendingData) {
      return res.redirect('/?error=invalid_state');
    }

    // Exchange code for tokens
    const tokens = await exchangeMicrosoftCode(code);

    // Store account in database
    const configEncrypted = JSON.stringify({
      provider: 'outlook',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      homeAccountId: tokens.homeAccountId,
    });

    await query(
      `INSERT INTO email_accounts 
       (tenant_id, email, provider, display_name, config_encrypted, oauth_tokens_encrypted, status)
       VALUES ($1, $2, 'outlook', $3, $4, $4, 'connected')
       ON CONFLICT (tenant_id, email) 
       DO UPDATE SET 
         config_encrypted = EXCLUDED.config_encrypted,
         oauth_tokens_encrypted = EXCLUDED.oauth_tokens_encrypted,
         status = 'connected',
         updated_at = NOW()
       RETURNING id`,
      [pendingData.tenantId, tokens.email, tokens.name || tokens.email.split('@')[0], configEncrypted]
    );

    // Create default folders
    const accountResult = await query(
      'SELECT id FROM email_accounts WHERE tenant_id = $1 AND email = $2',
      [pendingData.tenantId, tokens.email]
    );

    if (accountResult.rows.length > 0) {
      const accountId = accountResult.rows[0].id;
      const defaultFolders = [
        { name: 'Inbox', folder_type: 'inbox' },
        { name: 'Sent Items', folder_type: 'sent' },
        { name: 'Drafts', folder_type: 'drafts' },
        { name: 'Deleted Items', folder_type: 'trash' },
        { name: 'Junk Email', folder_type: 'spam' },
      ];

      for (const folder of defaultFolders) {
        await query(
          `INSERT INTO email_folders (account_id, name, full_path, folder_type)
           VALUES ($1, $2, $2, $3)
           ON CONFLICT (account_id, full_path) DO NOTHING`,
          [accountId, folder.name, folder.folder_type]
        );
      }
    }

    // Redirect back to app
    const successUrl = `${pendingData.returnUrl}?connected=microsoft&email=${encodeURIComponent(tokens.email)}`;
    res.redirect(successUrl);
  } catch (error) {
    console.error('Microsoft OAuth callback error:', error);
    res.redirect(`/?error=${encodeURIComponent(error.message)}`);
  }
});

/**
 * Refresh Microsoft token for an account
 */
router.post('/microsoft/refresh', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    // Get account
    const result = await query(
      'SELECT * FROM email_accounts WHERE tenant_id = $1 AND email = $2 AND provider = $3',
      [tenantId, email, 'outlook']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const account = result.rows[0];
    const config = JSON.parse(account.oauth_tokens_encrypted || account.config_encrypted || '{}');

    if (!config.homeAccountId) {
      return res.status(400).json({ error: 'No home account ID available. Please reconnect the account.' });
    }

    // Refresh token
    const newTokens = await refreshMicrosoftToken(config.homeAccountId);

    // Update database
    const updatedConfig = JSON.stringify({
      ...config,
      accessToken: newTokens.accessToken,
      expiresAt: newTokens.expiresAt,
    });

    await query(
      'UPDATE email_accounts SET config_encrypted = $1, oauth_tokens_encrypted = $1, updated_at = NOW() WHERE id = $2',
      [updatedConfig, account.id]
    );

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      expiresAt: newTokens.expiresAt,
    });
  } catch (error) {
    console.error('Microsoft token refresh error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Disconnect Account
// ============================================================================

/**
 * Disconnect an OAuth account
 */
router.post('/disconnect', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    // Update account status
    const result = await query(
      `UPDATE email_accounts 
       SET status = 'disconnected', 
           config_encrypted = NULL, 
           oauth_tokens_encrypted = NULL,
           updated_at = NOW()
       WHERE tenant_id = $1 AND email = $2
       RETURNING id, email, provider`,
      [tenantId, email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({
      success: true,
      message: 'Account disconnected',
      account: result.rows[0],
    });
  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
