-- E-commerce Integration Tables
-- Migration: 001_ecommerce_tables.sql
-- Date: 2025-01-21

-- ============================================
-- CONNECTED CHANNELS
-- ============================================

CREATE TABLE IF NOT EXISTS ecommerce_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  channel_id VARCHAR(100) NOT NULL, -- User-defined identifier
  platform VARCHAR(30) NOT NULL, -- shopify, woocommerce, custom
  display_name VARCHAR(255),
  shop_url TEXT,
  config_encrypted TEXT, -- Encrypted JSON with API keys
  webhook_secret VARCHAR(100),
  status VARCHAR(30) DEFAULT 'connected', -- connected, disconnected, error
  last_sync_at TIMESTAMPTZ,
  sync_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_ecom_channels_tenant ON ecommerce_channels(tenant_id);

-- ============================================
-- AUTO-SYNC CONFIGURATION
-- ============================================

CREATE TABLE IF NOT EXISTS ecommerce_sync_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES ecommerce_channels(id) ON DELETE CASCADE,
  auto_sync_orders BOOLEAN DEFAULT false,
  auto_sync_inventory BOOLEAN DEFAULT false,
  auto_sync_products BOOLEAN DEFAULT false,
  sync_interval_minutes INTEGER DEFAULT 5,
  use_webhooks BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(channel_id)
);

-- ============================================
-- SYNC LOG
-- ============================================

CREATE TABLE IF NOT EXISTS ecommerce_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES ecommerce_channels(id) ON DELETE CASCADE,
  sync_type VARCHAR(30) NOT NULL, -- orders, inventory, products
  source VARCHAR(30) NOT NULL, -- webhook, polling, manual
  status VARCHAR(20) NOT NULL, -- started, completed, failed
  records_processed INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_log_channel ON ecommerce_sync_log(channel_id, started_at DESC);

-- ============================================
-- IMPORTED ORDERS
-- ============================================

CREATE TABLE IF NOT EXISTS ecommerce_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  channel_id UUID NOT NULL REFERENCES ecommerce_channels(id),
  external_order_id VARCHAR(255) NOT NULL, -- Order ID from platform
  external_order_number VARCHAR(100),
  platform VARCHAR(30) NOT NULL,
  customer_email VARCHAR(255),
  customer_name VARCHAR(255),
  customer_phone VARCHAR(50),
  shipping_address JSONB,
  billing_address JSONB,
  items JSONB NOT NULL,
  subtotal DECIMAL(15,2) DEFAULT 0,
  shipping_total DECIMAL(10,2) DEFAULT 0,
  tax_total DECIMAL(10,2) DEFAULT 0,
  discount_total DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(15,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  status VARCHAR(30) DEFAULT 'pending', -- pending, processing, shipped, delivered, cancelled, refunded
  fulfillment_status VARCHAR(30), -- unfulfilled, partial, fulfilled
  payment_status VARCHAR(30), -- pending, paid, refunded, failed
  payment_method VARCHAR(50),
  notes TEXT,
  tags JSONB,
  source VARCHAR(30) DEFAULT 'webhook', -- webhook, import, manual
  external_created_at TIMESTAMPTZ,
  raw_data JSONB,
  pos_transaction_id UUID, -- Link to POS if converted
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(channel_id, external_order_id)
);

CREATE INDEX IF NOT EXISTS idx_ecom_orders_tenant ON ecommerce_orders(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ecom_orders_channel ON ecommerce_orders(channel_id, status);
CREATE INDEX IF NOT EXISTS idx_ecom_orders_customer ON ecommerce_orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_ecom_orders_external ON ecommerce_orders(external_order_id);

-- ============================================
-- ORDER FULFILLMENT
-- ============================================

CREATE TABLE IF NOT EXISTS ecommerce_fulfillments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES ecommerce_orders(id) ON DELETE CASCADE,
  tracking_number VARCHAR(100),
  carrier VARCHAR(100),
  tracking_url TEXT,
  shipped_at TIMESTAMPTZ,
  estimated_delivery TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  status VARCHAR(30) DEFAULT 'pending', -- pending, shipped, in_transit, delivered, failed
  items JSONB, -- Which items are included in this shipment
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fulfillments_order ON ecommerce_fulfillments(order_id);

-- ============================================
-- PRODUCT MAPPING
-- ============================================

CREATE TABLE IF NOT EXISTS ecommerce_product_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  channel_id UUID NOT NULL REFERENCES ecommerce_channels(id) ON DELETE CASCADE,
  local_product_id UUID NOT NULL,
  local_sku VARCHAR(100) NOT NULL,
  external_product_id VARCHAR(255),
  external_sku VARCHAR(255),
  external_variant_id VARCHAR(255),
  sync_enabled BOOLEAN DEFAULT true,
  sync_inventory BOOLEAN DEFAULT true,
  sync_price BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(channel_id, local_sku)
);

CREATE INDEX IF NOT EXISTS idx_product_mapping_channel ON ecommerce_product_mapping(channel_id);
CREATE INDEX IF NOT EXISTS idx_product_mapping_external ON ecommerce_product_mapping(external_product_id);

-- ============================================
-- INVENTORY SYNC QUEUE
-- ============================================

CREATE TABLE IF NOT EXISTS ecommerce_inventory_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES ecommerce_channels(id) ON DELETE CASCADE,
  product_mapping_id UUID REFERENCES ecommerce_product_mapping(id) ON DELETE CASCADE,
  sku VARCHAR(100) NOT NULL,
  quantity INTEGER NOT NULL,
  operation VARCHAR(20) DEFAULT 'set', -- set, adjust
  status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_inventory_queue_status ON ecommerce_inventory_queue(status, created_at);

-- ============================================
-- WEBHOOK EVENTS LOG
-- ============================================

CREATE TABLE IF NOT EXISTS ecommerce_webhook_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES ecommerce_channels(id) ON DELETE SET NULL,
  channel_identifier VARCHAR(100), -- Store channel_id string even if channel deleted
  event_type VARCHAR(50), -- orders/create, inventory_levels/update, etc.
  signature_valid BOOLEAN,
  payload JSONB,
  processing_status VARCHAR(20) DEFAULT 'received', -- received, processed, failed
  error_message TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_log_channel ON ecommerce_webhook_log(channel_identifier, received_at DESC);

-- ============================================
-- STATISTICS (Aggregated)
-- ============================================

CREATE TABLE IF NOT EXISTS ecommerce_daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  channel_id UUID REFERENCES ecommerce_channels(id) ON DELETE CASCADE,
  stat_date DATE NOT NULL,
  orders_received INTEGER DEFAULT 0,
  orders_total DECIMAL(15,2) DEFAULT 0,
  items_sold INTEGER DEFAULT 0,
  inventory_syncs INTEGER DEFAULT 0,
  webhooks_received INTEGER DEFAULT 0,
  sync_errors INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, channel_id, stat_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON ecommerce_daily_stats(stat_date);
