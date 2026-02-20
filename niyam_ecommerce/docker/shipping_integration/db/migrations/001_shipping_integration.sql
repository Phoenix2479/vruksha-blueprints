-- Shipping Integration Tables
-- Migration: 001_shipping_integration.sql

-- ============================================
-- CARRIERS
-- ============================================

CREATE TABLE IF NOT EXISTS carriers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}'::jsonb,
  base_rate NUMERIC(10,2) DEFAULT 5.00,
  per_kg_rate NUMERIC(10,2) DEFAULT 2.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_carriers_tenant ON carriers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_carriers_active ON carriers(tenant_id, is_active);

-- ============================================
-- SHIPMENTS
-- ============================================

CREATE TABLE IF NOT EXISTS shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  order_id UUID NOT NULL,
  carrier_id UUID REFERENCES carriers(id),
  tracking_number VARCHAR(100),
  label_url TEXT,
  status VARCHAR(30) DEFAULT 'pending',
  estimated_delivery TIMESTAMPTZ,
  actual_delivery TIMESTAMPTZ,
  cost NUMERIC(10,2) DEFAULT 0,
  weight NUMERIC(10,3) DEFAULT 0,
  dimensions JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipments_tenant ON shipments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shipments_order ON shipments(tenant_id, order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_carrier ON shipments(carrier_id);
CREATE INDEX IF NOT EXISTS idx_shipments_tracking ON shipments(tracking_number);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(tenant_id, status);

-- ============================================
-- TRACKING EVENTS
-- ============================================

CREATE TABLE IF NOT EXISTS tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL,
  location VARCHAR(255),
  description TEXT,
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracking_events_tenant ON tracking_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tracking_events_shipment ON tracking_events(shipment_id);
CREATE INDEX IF NOT EXISTS idx_tracking_events_occurred ON tracking_events(shipment_id, occurred_at DESC);
