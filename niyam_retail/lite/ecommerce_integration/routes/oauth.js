// E-commerce Integration - OAuth2 Routes
// Supports Shopify and WooCommerce OAuth flows

const express = require('express');
const crypto = require('crypto');
const { query } = require('@vruksha/platform/db/postgres');

const router = express.Router();
const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// OAuth state storage (in production, use Redis)
const oauthStates = new Map();

function getTenantId(req) {
  const t = req.headers['x-tenant-id'];
  return typeof t === 'string' && t.trim() ? t.trim() : DEFAULT_TENANT_ID;
}

function generateState() {
  return crypto.randomBytes(32).toString('hex');
}

function generateNonce() {
  return crypto.randomBytes(16).toString('hex');
}

// ============================================
// SHOPIFY OAUTH
// ============================================

// Step 1: Initiate Shopify OAuth
router.get('/shopify/authorize', (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { shop, redirect_uri } = req.query;

    if (!shop) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_SHOP', message: 'Shop domain is required (e.g., mystore.myshopify.com)' }
      });
    }

    const clientId = process.env.SHOPIFY_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({
        success: false,
        error: { code: 'NOT_CONFIGURED', message: 'Shopify OAuth is not configured' }
      });
    }

    // Normalize shop domain
    const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
    
    // Generate state for CSRF protection
    const state = generateState();
    const nonce = generateNonce();
    
    // Store state with tenant info (expires in 10 minutes)
    oauthStates.set(state, {
      tenantId,
      platform: 'shopify',
      shop: shopDomain,
      redirectUri: redirect_uri || `${req.protocol}://${req.get('host')}/oauth/shopify/callback`,
      createdAt: Date.now(),
      nonce
    });

    // Clean up old states
    for (const [key, value] of oauthStates) {
      if (Date.now() - value.createdAt > 600000) {
        oauthStates.delete(key);
      }
    }

    // Shopify OAuth scopes for e-commerce integration
    const scopes = [
      'read_products',
      'read_orders',
      'read_inventory',
      'write_inventory',
      'read_fulfillments',
      'write_fulfillments',
      'read_customers'
    ].join(',');

    const callbackUrl = redirect_uri || `${req.protocol}://${req.get('host')}/oauth/shopify/callback`;

    // Build Shopify authorization URL
    const authUrl = `https://${shopDomain}/admin/oauth/authorize?` +
      `client_id=${encodeURIComponent(clientId)}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
      `&state=${state}`;

    console.log(`🔐 [OAUTH] Initiating Shopify OAuth for ${shopDomain}`);

    res.json({
      success: true,
      data: {
        authorization_url: authUrl,
        state,
        shop: shopDomain
      }
    });
  } catch (error) {
    console.error('[OAUTH] Shopify authorize error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'OAUTH_ERROR', message: error.message }
    });
  }
});

// Step 2: Shopify OAuth callback
router.get('/shopify/callback', async (req, res) => {
  try {
    const { code, shop, state, hmac } = req.query;

    // Validate state
    if (!state || !oauthStates.has(state)) {
      return res.status(400).send(`
        <html>
          <body style="font-family: sans-serif; padding: 40px; text-align: center;">
            <h2>Authorization Failed</h2>
            <p>Invalid or expired state. Please try again.</p>
            <script>
              setTimeout(() => { window.close(); }, 3000);
            </script>
          </body>
        </html>
      `);
    }

    const stateData = oauthStates.get(state);
    oauthStates.delete(state);

    // Verify shop matches
    if (stateData.shop !== shop) {
      return res.status(400).send('Shop mismatch');
    }

    // Verify HMAC (Shopify signature)
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
    if (hmac && clientSecret) {
      const queryParams = { ...req.query };
      delete queryParams.hmac;
      const message = Object.keys(queryParams)
        .sort()
        .map(key => `${key}=${queryParams[key]}`)
        .join('&');
      const expectedHmac = crypto
        .createHmac('sha256', clientSecret)
        .update(message)
        .digest('hex');
      
      if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac))) {
        console.error('[OAUTH] HMAC verification failed');
        return res.status(400).send('HMAC verification failed');
      }
    }

    // Exchange code for access token
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[OAUTH] Token exchange failed:', errorText);
      return res.status(400).send('Failed to exchange token');
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    const scope = tokenData.scope;

    // Fetch shop info
    const shopInfoResponse = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
      headers: { 'X-Shopify-Access-Token': accessToken }
    });
    const shopInfo = shopInfoResponse.ok ? await shopInfoResponse.json() : { shop: {} };

    // Generate channel_id and webhook secret
    const channelId = `shopify_${shop.split('.')[0]}_${Date.now().toString(36)}`;
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    // Store in database
    const config = {
      shop_url: `https://${shop}`,
      access_token: accessToken,
      scope,
      oauth: true
    };

    await query(
      `INSERT INTO ecommerce_channels 
       (tenant_id, channel_id, platform, display_name, shop_url, config_encrypted, webhook_secret, status)
       VALUES ($1, $2, 'shopify', $3, $4, $5, $6, 'connected')
       ON CONFLICT (tenant_id, channel_id) 
       DO UPDATE SET 
         config_encrypted = EXCLUDED.config_encrypted,
         status = 'connected',
         updated_at = NOW()
       RETURNING id`,
      [
        stateData.tenantId,
        channelId,
        shopInfo.shop?.name || shop.split('.')[0],
        `https://${shop}`,
        JSON.stringify(config),
        webhookSecret
      ]
    );

    console.log(`✅ [OAUTH] Shopify connected: ${shop}`);

    // Return success page that closes and notifies parent
    res.send(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h2 style="color: #22c55e;">✓ Shopify Connected!</h2>
          <p>Successfully connected to <strong>${shopInfo.shop?.name || shop}</strong></p>
          <p style="color: #666;">This window will close automatically...</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'OAUTH_SUCCESS',
                platform: 'shopify',
                channelId: '${channelId}',
                shop: '${shop}'
              }, '*');
            }
            setTimeout(() => { window.close(); }, 2000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('[OAUTH] Shopify callback error:', error);
    res.status(500).send(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h2 style="color: #ef4444;">Connection Failed</h2>
          <p>${error.message}</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'OAUTH_ERROR',
                platform: 'shopify',
                error: '${error.message}'
              }, '*');
            }
            setTimeout(() => { window.close(); }, 5000);
          </script>
        </body>
      </html>
    `);
  }
});

// ============================================
// WOOCOMMERCE REST API KEY FLOW
// ============================================

// WooCommerce uses REST API keys, not OAuth
// This provides a guided setup flow

router.post('/woocommerce/connect', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { 
      shop_url, 
      consumer_key, 
      consumer_secret, 
      display_name 
    } = req.body;

    if (!shop_url || !consumer_key || !consumer_secret) {
      return res.status(400).json({
        success: false,
        error: { 
          code: 'MISSING_FIELDS', 
          message: 'shop_url, consumer_key, and consumer_secret are required' 
        }
      });
    }

    // Normalize URL
    let normalizedUrl = shop_url;
    if (!normalizedUrl.startsWith('http')) {
      normalizedUrl = `https://${normalizedUrl}`;
    }
    normalizedUrl = normalizedUrl.replace(/\/$/, '');

    // Test connection
    const testUrl = `${normalizedUrl}/wp-json/wc/v3/system_status`;
    const auth = Buffer.from(`${consumer_key}:${consumer_secret}`).toString('base64');
    
    console.log(`🔍 [OAUTH] Testing WooCommerce connection to ${normalizedUrl}`);

    const testResponse = await fetch(testUrl, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });

    if (!testResponse.ok) {
      const errorText = await testResponse.text();
      console.error('[OAUTH] WooCommerce test failed:', testResponse.status, errorText);
      return res.status(400).json({
        success: false,
        error: { 
          code: 'CONNECTION_FAILED', 
          message: `Failed to connect to WooCommerce: ${testResponse.status} ${testResponse.statusText}` 
        }
      });
    }

    const systemStatus = await testResponse.json();
    const storeName = systemStatus.settings?.store_name || display_name || new URL(normalizedUrl).hostname;

    // Generate channel_id and webhook secret
    const channelId = `woo_${new URL(normalizedUrl).hostname.replace(/\./g, '_')}_${Date.now().toString(36)}`;
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    // Store in database
    const config = {
      shop_url: normalizedUrl,
      consumer_key,
      consumer_secret,
      api_version: 'wc/v3'
    };

    const result = await query(
      `INSERT INTO ecommerce_channels 
       (tenant_id, channel_id, platform, display_name, shop_url, config_encrypted, webhook_secret, status)
       VALUES ($1, $2, 'woocommerce', $3, $4, $5, $6, 'connected')
       ON CONFLICT (tenant_id, channel_id) 
       DO UPDATE SET 
         config_encrypted = EXCLUDED.config_encrypted,
         display_name = EXCLUDED.display_name,
         status = 'connected',
         updated_at = NOW()
       RETURNING *`,
      [tenantId, channelId, storeName, normalizedUrl, JSON.stringify(config), webhookSecret]
    );

    console.log(`✅ [OAUTH] WooCommerce connected: ${normalizedUrl}`);

    res.json({
      success: true,
      data: {
        message: 'WooCommerce store connected successfully',
        channel: {
          id: result.rows[0].id,
          channel_id: channelId,
          platform: 'woocommerce',
          display_name: storeName,
          shop_url: normalizedUrl
        },
        webhook_url: `${req.protocol}://${req.get('host')}/webhooks/${channelId}/orders`,
        webhook_secret: webhookSecret,
        woocommerce_version: systemStatus.environment?.version,
        wp_version: systemStatus.environment?.wp_version
      }
    });
  } catch (error) {
    console.error('[OAUTH] WooCommerce connect error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'CONNECTION_ERROR', message: error.message }
    });
  }
});

// Instructions for WooCommerce setup
router.get('/woocommerce/setup-instructions', (req, res) => {
  res.json({
    success: true,
    data: {
      title: 'WooCommerce Setup Instructions',
      steps: [
        {
          step: 1,
          title: 'Go to WooCommerce Settings',
          description: 'In your WordPress admin, go to WooCommerce > Settings > Advanced > REST API'
        },
        {
          step: 2,
          title: 'Create API Key',
          description: 'Click "Add key" and fill in the details'
        },
        {
          step: 3,
          title: 'Configure Permissions',
          description: 'Set permissions to "Read/Write" for full integration'
        },
        {
          step: 4,
          title: 'Copy Credentials',
          description: 'Copy the Consumer Key and Consumer Secret'
        },
        {
          step: 5,
          title: 'Connect',
          description: 'Paste your shop URL and credentials in the connection form'
        }
      ],
      notes: [
        'Ensure your WooCommerce REST API is enabled',
        'Use HTTPS for secure connections',
        'Keep your API keys secure and never share them'
      ]
    }
  });
});

// ============================================
// REFRESH / DISCONNECT
// ============================================

// Refresh OAuth token (for platforms that support it)
router.post('/:channel_id/refresh', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { channel_id } = req.params;

    const channelResult = await query(
      'SELECT * FROM ecommerce_channels WHERE tenant_id = $1 AND channel_id = $2',
      [tenantId, channel_id]
    );

    if (channelResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Channel not found' }
      });
    }

    const channel = channelResult.rows[0];
    const config = JSON.parse(channel.config_encrypted || '{}');

    // Shopify access tokens don't expire, so just verify it works
    if (channel.platform === 'shopify' && config.access_token) {
      const shopUrl = config.shop_url || channel.shop_url;
      const testResponse = await fetch(`${shopUrl}/admin/api/2024-01/shop.json`, {
        headers: { 'X-Shopify-Access-Token': config.access_token }
      });

      if (!testResponse.ok) {
        // Token is invalid, need to re-authenticate
        await query(
          'UPDATE ecommerce_channels SET status = $1 WHERE id = $2',
          ['disconnected', channel.id]
        );

        return res.status(401).json({
          success: false,
          error: { 
            code: 'TOKEN_INVALID', 
            message: 'Access token is invalid. Please reconnect the store.' 
          }
        });
      }

      res.json({
        success: true,
        data: { message: 'Token is valid', status: 'connected' }
      });
    } else if (channel.platform === 'woocommerce') {
      // Test WooCommerce connection
      const auth = Buffer.from(`${config.consumer_key}:${config.consumer_secret}`).toString('base64');
      const testResponse = await fetch(`${config.shop_url}/wp-json/wc/v3/system_status`, {
        headers: { 'Authorization': `Basic ${auth}` }
      });

      if (!testResponse.ok) {
        await query(
          'UPDATE ecommerce_channels SET status = $1 WHERE id = $2',
          ['disconnected', channel.id]
        );

        return res.status(401).json({
          success: false,
          error: { code: 'CREDENTIALS_INVALID', message: 'API credentials are invalid' }
        });
      }

      res.json({
        success: true,
        data: { message: 'Credentials are valid', status: 'connected' }
      });
    } else {
      res.json({
        success: true,
        data: { message: 'No refresh needed for this platform' }
      });
    }
  } catch (error) {
    console.error('[OAUTH] Refresh error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'REFRESH_ERROR', message: error.message }
    });
  }
});

// Get OAuth status
router.get('/status', async (req, res) => {
  const shopifyConfigured = !!(process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET);
  
  res.json({
    success: true,
    data: {
      platforms: {
        shopify: {
          oauth_available: shopifyConfigured,
          method: 'OAuth 2.0',
          scopes: ['read_products', 'read_orders', 'read_inventory', 'write_inventory', 'read_fulfillments', 'write_fulfillments', 'read_customers']
        },
        woocommerce: {
          oauth_available: true,
          method: 'REST API Keys',
          note: 'WooCommerce uses API keys instead of OAuth'
        },
        custom: {
          oauth_available: false,
          method: 'API Key / Bearer Token',
          note: 'Configure custom API endpoints'
        }
      }
    }
  });
});

module.exports = router;
