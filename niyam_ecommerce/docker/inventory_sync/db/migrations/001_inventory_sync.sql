-- Inventory Sync Tables
-- Migration: 001_inventory_sync.sql

-- ============================================
-- STOCK RECORDS
-- ============================================

CREATE TABLE IF NOT EXISTS stock_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL,
  variant_id UUID,
  location VARCHAR(255) DEFAULT 'default',
  quantity INTEGER NOT NULL DEFAULT 0,
  reserved INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER DEFAULT 10,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, product_id, variant_id, location)
);

CREATE INDEX IF NOT EXISTS idx_stock_records_tenant ON stock_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_records_product ON stock_records(tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_stock_records_location ON stock_records(tenant_id, location);

-- ============================================
-- STOCK RESERVATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS stock_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL,
  variant_id UUID,
  order_id UUID,
  quantity INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(30) DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_reservations_tenant ON stock_reservations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_product ON stock_reservations(tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_order ON stock_reservations(order_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_status ON stock_reservations(tenant_id, status);

-- ============================================
-- SYNC SOURCES
-- ============================================

CREATE TABLE IF NOT EXISTS sync_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  config JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_sources_tenant ON sync_sources(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sync_sources_active ON sync_sources(tenant_id, is_active);

-- ============================================
-- STOCK ALERTS
-- ============================================

CREATE TABLE IF NOT EXISTS stock_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL,
  variant_id UUID,
  type VARCHAR(50) NOT NULL DEFAULT 'low_stock',
  message TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_alerts_tenant ON stock_alerts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_alerts_product ON stock_alerts(tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_stock_alerts_unread ON stock_alerts(tenant_id, is_read) WHERE is_read = false;
