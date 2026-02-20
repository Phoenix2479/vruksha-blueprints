/**
 * Platform Adapters for E-commerce Integration
 *
 * Supports:
 * - Shopify (Admin API)
 * - WooCommerce (REST API)
 * - Custom/Self-hosted websites (Generic API)
 */

const axios = require('axios');

// ============================================
// SHOPIFY ADAPTER
// ============================================

const ShopifyAdapter = {
  name: 'shopify',

  /**
   * Fetch orders from Shopify Admin API
   */
  async fetchOrders(config, sinceDate) {
    const { shop_url, api_key, api_secret, api_version = '2024-01' } = config;

    if (!shop_url || !api_key || !api_secret) {
      throw new Error('Shopify requires shop_url, api_key, and api_secret');
    }

    const url = `https://${shop_url}/admin/api/${api_version}/orders.json`;

    const response = await axios.get(url, {
      params: {
        created_at_min: sinceDate,
        status: 'any',
        limit: 250
      },
      auth: {
        username: api_key,
        password: api_secret
      },
      timeout: 30000
    });

    return (response.data.orders || []).map(order => this.normalizeOrder(order));
  },

  /**
   * Register webhook with Shopify
   */
  async registerWebhook(config, webhookUrl, topic = 'orders/create') {
    const { shop_url, api_key, api_secret, api_version = '2024-01' } = config;

    const url = `https://${shop_url}/admin/api/${api_version}/webhooks.json`;

    const response = await axios.post(url, {
      webhook: {
        topic,
        address: webhookUrl,
        format: 'json'
      }
    }, {
      auth: {
        username: api_key,
        password: api_secret
      },
      timeout: 10000
    });

    return response.data.webhook;
  },

  /**
   * Push inventory levels to Shopify
   */
  async pushInventory(config, inventoryItems) {
    const { shop_url, api_key, api_secret, api_version = '2024-01' } = config;

    const results = [];
    for (const item of inventoryItems) {
      const url = `https://${shop_url}/admin/api/${api_version}/inventory_levels/set.json`;

      const response = await axios.post(url, {
        location_id: item.location_id,
        inventory_item_id: item.inventory_item_id,
        available: item.quantity
      }, {
        auth: {
          username: api_key,
          password: api_secret
        },
        timeout: 10000
      });

      results.push(response.data);
    }

    return results;
  },

  /**
   * Normalize Shopify order to common format
   */
  normalizeOrder(order) {
    return {
      id: `SHOP-${order.id}`,
      platform: 'shopify',
      platform_order_id: order.id,
      order_number: order.order_number,
      customerEmail: order.email,
      customerName: order.customer
        ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim()
        : order.billing_address?.name || 'Customer',
      customerPhone: order.phone || order.billing_address?.phone,
      total: parseFloat(order.total_price) || 0,
      subtotal: parseFloat(order.subtotal_price) || 0,
      tax: parseFloat(order.total_tax) || 0,
      shipping: parseFloat(order.total_shipping_price_set?.shop_money?.amount) || 0,
      currency: order.currency,
      status: order.financial_status,
      fulfillment_status: order.fulfillment_status,
      items: (order.line_items || []).map(item => ({
        id: item.id,
        name: item.name,
        sku: item.sku,
        quantity: item.quantity,
        price: parseFloat(item.price),
        variant_id: item.variant_id,
        product_id: item.product_id
      })),
      shipping_address: order.shipping_address ? {
        name: order.shipping_address.name,
        address1: order.shipping_address.address1,
        address2: order.shipping_address.address2,
        city: order.shipping_address.city,
        state: order.shipping_address.province,
        zip: order.shipping_address.zip,
        country: order.shipping_address.country
      } : null,
      created_at: order.created_at,
      updated_at: order.updated_at,
      raw: order
    };
  }
};

// ============================================
// WOOCOMMERCE ADAPTER
// ============================================

const WooCommerceAdapter = {
  name: 'woocommerce',

  /**
   * Fetch orders from WooCommerce REST API
   */
  async fetchOrders(config, sinceDate) {
    const { shop_url, consumer_key, consumer_secret } = config;

    if (!shop_url || !consumer_key || !consumer_secret) {
      throw new Error('WooCommerce requires shop_url, consumer_key, and consumer_secret');
    }

    // Remove trailing slash
    const baseUrl = shop_url.replace(/\/$/, '');
    const url = `${baseUrl}/wp-json/wc/v3/orders`;

    const response = await axios.get(url, {
      params: {
        after: sinceDate,
        per_page: 100,
        orderby: 'date',
        order: 'desc'
      },
      auth: {
        username: consumer_key,
        password: consumer_secret
      },
      timeout: 30000
    });

    return (response.data || []).map(order => this.normalizeOrder(order));
  },

  /**
   * Register webhook with WooCommerce
   */
  async registerWebhook(config, webhookUrl, topic = 'order.created') {
    const { shop_url, consumer_key, consumer_secret } = config;

    const baseUrl = shop_url.replace(/\/$/, '');
    const url = `${baseUrl}/wp-json/wc/v3/webhooks`;

    const response = await axios.post(url, {
      name: `Niyam ${topic} webhook`,
      topic,
      delivery_url: webhookUrl,
      status: 'active'
    }, {
      auth: {
        username: consumer_key,
        password: consumer_secret
      },
      timeout: 10000
    });

    return response.data;
  },

  /**
   * Push inventory to WooCommerce
   */
  async pushInventory(config, inventoryItems) {
    const { shop_url, consumer_key, consumer_secret } = config;
    const baseUrl = shop_url.replace(/\/$/, '');

    const results = [];
    for (const item of inventoryItems) {
      const url = `${baseUrl}/wp-json/wc/v3/products/${item.product_id}`;

      const response = await axios.put(url, {
        stock_quantity: item.quantity,
        manage_stock: true
      }, {
        auth: {
          username: consumer_key,
          password: consumer_secret
        },
        timeout: 10000
      });

      results.push(response.data);
    }

    return results;
  },

  /**
   * Normalize WooCommerce order to common format
   */
  normalizeOrder(order) {
    return {
      id: `WOO-${order.id}`,
      platform: 'woocommerce',
      platform_order_id: order.id,
      order_number: order.number,
      customerEmail: order.billing?.email,
      customerName: `${order.billing?.first_name || ''} ${order.billing?.last_name || ''}`.trim() || 'Customer',
      customerPhone: order.billing?.phone,
      total: parseFloat(order.total) || 0,
      subtotal: parseFloat(order.subtotal) || 0,
      tax: parseFloat(order.total_tax) || 0,
      shipping: parseFloat(order.shipping_total) || 0,
      currency: order.currency,
      status: order.status,
      fulfillment_status: order.status === 'completed' ? 'fulfilled' : 'unfulfilled',
      items: (order.line_items || []).map(item => ({
        id: item.id,
        name: item.name,
        sku: item.sku,
        quantity: item.quantity,
        price: parseFloat(item.price),
        product_id: item.product_id,
        variation_id: item.variation_id
      })),
      shipping_address: order.shipping ? {
        name: `${order.shipping.first_name} ${order.shipping.last_name}`.trim(),
        address1: order.shipping.address_1,
        address2: order.shipping.address_2,
        city: order.shipping.city,
        state: order.shipping.state,
        zip: order.shipping.postcode,
        country: order.shipping.country
      } : null,
      created_at: order.date_created,
      updated_at: order.date_modified,
      raw: order
    };
  }
};

// ============================================
// CUSTOM/GENERIC API ADAPTER
// ============================================

const CustomAdapter = {
  name: 'custom',

  /**
   * Fetch orders from custom API endpoint
   * Supports flexible configuration for any self-hosted website
   */
  async fetchOrders(config, sinceDate) {
    const {
      api_url,
      api_key,
      auth_type = 'bearer', // bearer, basic, api_key_header, api_key_query
      auth_header_name = 'Authorization',
      api_key_param_name = 'api_key',
      orders_endpoint = '/orders',
      date_param_name = 'since',
      date_format = 'iso', // iso, timestamp, unix
      method = 'GET',
      extra_headers = {},
      extra_params = {},
      response_path = 'orders' // Path to orders array in response (e.g., 'data.orders')
    } = config;

    if (!api_url) {
      throw new Error('Custom API requires api_url');
    }

    // Build URL
    const baseUrl = api_url.replace(/\/$/, '');
    const url = `${baseUrl}${orders_endpoint}`;

    // Build headers based on auth type
    const headers = { ...extra_headers };
    if (auth_type === 'bearer' && api_key) {
      headers[auth_header_name] = `Bearer ${api_key}`;
    } else if (auth_type === 'api_key_header' && api_key) {
      headers[auth_header_name] = api_key;
    }

    // Build params
    const params = { ...extra_params };
    if (sinceDate) {
      if (date_format === 'timestamp') {
        params[date_param_name] = new Date(sinceDate).getTime();
      } else if (date_format === 'unix') {
        params[date_param_name] = Math.floor(new Date(sinceDate).getTime() / 1000);
      } else {
        params[date_param_name] = sinceDate;
      }
    }
    if (auth_type === 'api_key_query' && api_key) {
      params[api_key_param_name] = api_key;
    }

    // Build auth for basic auth
    const auth = auth_type === 'basic' && api_key ? {
      username: api_key.split(':')[0],
      password: api_key.split(':')[1] || ''
    } : undefined;

    const response = await axios({
      method,
      url,
      headers,
      params,
      auth,
      timeout: 30000
    });

    // Extract orders from response using response_path
    let orders = response.data;
    if (response_path) {
      const pathParts = response_path.split('.');
      for (const part of pathParts) {
        orders = orders?.[part];
      }
    }

    if (!Array.isArray(orders)) {
      console.warn('Custom API response is not an array, wrapping:', typeof orders);
      orders = orders ? [orders] : [];
    }

    // Normalize using field mapping
    return orders.map(order => this.normalizeOrder(order, config.field_mapping));
  },

  /**
   * Normalize custom order using field mapping
   */
  normalizeOrder(order, fieldMapping = {}) {
    const mapping = {
      id: 'id',
      order_number: 'order_number',
      email: 'email',
      customer_name: 'customer_name',
      phone: 'phone',
      total: 'total',
      items: 'items',
      status: 'status',
      created_at: 'created_at',
      // Item fields
      item_name: 'name',
      item_sku: 'sku',
      item_quantity: 'quantity',
      item_price: 'price',
      ...fieldMapping
    };

    const getValue = (obj, path) => {
      if (!path) return undefined;
      const parts = path.split('.');
      let value = obj;
      for (const part of parts) {
        value = value?.[part];
      }
      return value;
    };

    const orderId = getValue(order, mapping.id) || `CUSTOM-${Date.now()}`;
    const items = getValue(order, mapping.items) || [];

    return {
      id: `CUSTOM-${orderId}`,
      platform: 'custom',
      platform_order_id: orderId,
      order_number: getValue(order, mapping.order_number) || orderId,
      customerEmail: getValue(order, mapping.email),
      customerName: getValue(order, mapping.customer_name) || 'Customer',
      customerPhone: getValue(order, mapping.phone),
      total: parseFloat(getValue(order, mapping.total)) || 0,
      status: getValue(order, mapping.status) || 'pending',
      items: items.map(item => ({
        name: getValue(item, mapping.item_name),
        sku: getValue(item, mapping.item_sku),
        quantity: parseInt(getValue(item, mapping.item_quantity)) || 1,
        price: parseFloat(getValue(item, mapping.item_price)) || 0
      })),
      created_at: getValue(order, mapping.created_at),
      raw: order
    };
  },

  /**
   * Custom APIs typically don't support webhook registration
   * Return instructions instead
   */
  async registerWebhook(config, webhookUrl) {
    return {
      success: false,
      message: 'Custom APIs require manual webhook configuration',
      webhook_url: webhookUrl,
      instructions: 'Configure your website to POST order data to this URL when orders are created'
    };
  },

  /**
   * Push inventory to custom API
   */
  async pushInventory(config, inventoryItems) {
    const {
      api_url,
      api_key,
      auth_type = 'bearer',
      auth_header_name = 'Authorization',
      inventory_endpoint = '/inventory/update',
      extra_headers = {}
    } = config;

    if (!api_url) {
      throw new Error('Custom API requires api_url');
    }

    const baseUrl = api_url.replace(/\/$/, '');
    const url = `${baseUrl}${inventory_endpoint}`;

    const headers = { 'Content-Type': 'application/json', ...extra_headers };
    if (auth_type === 'bearer' && api_key) {
      headers[auth_header_name] = `Bearer ${api_key}`;
    } else if (auth_type === 'api_key_header' && api_key) {
      headers[auth_header_name] = api_key;
    }

    const response = await axios.post(url, {
      items: inventoryItems
    }, {
      headers,
      timeout: 30000
    });

    return response.data;
  }
};

// ============================================
// ADAPTER REGISTRY
// ============================================

const adapters = {
  shopify: ShopifyAdapter,
  woocommerce: WooCommerceAdapter,
  custom: CustomAdapter
};

/**
 * Get adapter for a platform
 */
function getAdapter(platform) {
  const adapter = adapters[platform?.toLowerCase()];
  if (!adapter) {
    throw new Error(`Unknown platform: ${platform}. Supported: shopify, woocommerce, custom`);
  }
  return adapter;
}

/**
 * Fetch orders from any platform
 */
async function fetchOrders(platform, config, sinceDate) {
  const adapter = getAdapter(platform);
  return adapter.fetchOrders(config, sinceDate);
}

/**
 * Register webhook with platform
 */
async function registerWebhook(platform, config, webhookUrl, topic) {
  const adapter = getAdapter(platform);
  return adapter.registerWebhook(config, webhookUrl, topic);
}

/**
 * Push inventory to platform
 */
async function pushInventory(platform, config, inventoryItems) {
  const adapter = getAdapter(platform);
  return adapter.pushInventory(config, inventoryItems);
}

/**
 * Normalize incoming webhook data from any platform
 * @param {Object} webhookData - Raw webhook payload
 * @param {string} platform - Platform type (shopify, woocommerce, custom)
 * @param {Object} config - Optional platform config (needed for custom field mapping)
 */
function normalizeWebhookOrder(webhookData, platform, config = {}) {
  const adapter = getAdapter(platform);
  // Pass field_mapping for custom adapter
  if (platform === 'custom' && config.field_mapping) {
    return adapter.normalizeOrder(webhookData, config.field_mapping);
  }
  return adapter.normalizeOrder(webhookData);
}

module.exports = {
  ShopifyAdapter,
  WooCommerceAdapter,
  CustomAdapter,
  getAdapter,
  fetchOrders,
  registerWebhook,
  pushInventory,
  normalizeWebhookOrder
};
