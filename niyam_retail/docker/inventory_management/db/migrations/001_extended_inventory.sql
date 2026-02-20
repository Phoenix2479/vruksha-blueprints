-- Extended Inventory Management Tables
-- Migration: 001_extended_inventory.sql
-- Date: 2025-01-21

-- ============================================
-- WAREHOUSE LOCATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS warehouse_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  store_id UUID NOT NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  zone VARCHAR(50),
  aisle VARCHAR(20),
  shelf VARCHAR(20),
  bin VARCHAR(20),
  type VARCHAR(30) DEFAULT 'shelf', -- warehouse, zone, aisle, shelf, bin
  parent_id UUID REFERENCES warehouse_locations(id),
  capacity INTEGER DEFAULT 0,
  current_utilization INTEGER DEFAULT 0,
  is_pickable BOOLEAN DEFAULT true,
  is_receivable BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, store_id, code)
);

CREATE INDEX IF NOT EXISTS idx_warehouse_locations_tenant ON warehouse_locations(tenant_id, store_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_locations_zone ON warehouse_locations(tenant_id, zone);

-- ============================================
-- INVENTORY BY LOCATION
-- ============================================

CREATE TABLE IF NOT EXISTS inventory_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id),
  location_id UUID NOT NULL REFERENCES warehouse_locations(id),
  quantity INTEGER DEFAULT 0,
  reserved_quantity INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_locations_product ON inventory_locations(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_locations_location ON inventory_locations(location_id);

-- ============================================
-- SERIAL NUMBERS
-- ============================================

CREATE TABLE IF NOT EXISTS serial_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id),
  serial_number VARCHAR(100) NOT NULL,
  status VARCHAR(30) DEFAULT 'available', -- available, reserved, sold, returned, defective
  location_id UUID REFERENCES warehouse_locations(id),
  received_date DATE,
  sold_date DATE,
  transaction_id UUID,
  customer_id UUID,
  warranty_start DATE,
  warranty_end DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, serial_number)
);

CREATE INDEX IF NOT EXISTS idx_serial_numbers_product ON serial_numbers(product_id, status);
CREATE INDEX IF NOT EXISTS idx_serial_numbers_serial ON serial_numbers(tenant_id, serial_number);

-- ============================================
-- BATCH / LOT TRACKING
-- ============================================

CREATE TABLE IF NOT EXISTS batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id),
  batch_number VARCHAR(100) NOT NULL,
  lot_number VARCHAR(100),
  quantity INTEGER DEFAULT 0,
  reserved_quantity INTEGER DEFAULT 0,
  manufacture_date DATE,
  expiry_date DATE,
  supplier_id UUID,
  cost_per_unit DECIMAL(15,2),
  location_id UUID REFERENCES warehouse_locations(id),
  status VARCHAR(30) DEFAULT 'active', -- active, expired, recalled, depleted
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, product_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_batches_product ON batches(product_id);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON batches(expiry_date) WHERE status = 'active';

-- ============================================
-- STOCK TRANSFERS
-- ============================================

CREATE TABLE IF NOT EXISTS stock_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  transfer_number VARCHAR(50) NOT NULL,
  from_store_id UUID,
  from_location_id UUID REFERENCES warehouse_locations(id),
  to_store_id UUID,
  to_location_id UUID REFERENCES warehouse_locations(id),
  status VARCHAR(30) DEFAULT 'pending', -- pending, approved, in_transit, completed, cancelled
  priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high, urgent
  reason TEXT,
  requested_by UUID,
  approved_by UUID,
  shipped_by UUID,
  received_by UUID,
  tracking_number VARCHAR(100),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, transfer_number)
);

CREATE INDEX IF NOT EXISTS idx_transfers_tenant ON stock_transfers(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_transfers_from ON stock_transfers(from_store_id, status);
CREATE INDEX IF NOT EXISTS idx_transfers_to ON stock_transfers(to_store_id, status);

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  requested_quantity INTEGER NOT NULL,
  shipped_quantity INTEGER DEFAULT 0,
  received_quantity INTEGER DEFAULT 0,
  batch_id UUID REFERENCES batches(id),
  serial_numbers TEXT[], -- Array of serial numbers
  variance_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transfer_items_transfer ON stock_transfer_items(transfer_id);

-- ============================================
-- STOCK COUNTS
-- ============================================

CREATE TABLE IF NOT EXISTS stock_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  count_number VARCHAR(50) NOT NULL,
  type VARCHAR(30) DEFAULT 'cycle', -- full, cycle, spot
  store_id UUID,
  status VARCHAR(30) DEFAULT 'draft', -- draft, in_progress, pending_approval, completed, cancelled
  assigned_to UUID,
  scheduled_date DATE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, count_number)
);

CREATE INDEX IF NOT EXISTS idx_stock_counts_tenant ON stock_counts(tenant_id, status);

CREATE TABLE IF NOT EXISTS stock_count_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id UUID NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  location_id UUID REFERENCES warehouse_locations(id),
  system_quantity INTEGER NOT NULL DEFAULT 0,
  counted_quantity INTEGER,
  variance INTEGER GENERATED ALWAYS AS (counted_quantity - system_quantity) STORED,
  variance_value DECIMAL(15,2),
  counted_by UUID,
  counted_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_count_items_count ON stock_count_items(count_id);

-- ============================================
-- GOODS RECEIVING (GRN)
-- ============================================

CREATE TABLE IF NOT EXISTS goods_receiving (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  grn_number VARCHAR(50) NOT NULL,
  purchase_order_id UUID,
  supplier_id UUID,
  store_id UUID,
  status VARCHAR(30) DEFAULT 'draft', -- draft, inspecting, completed, cancelled
  delivery_note_number VARCHAR(100),
  received_by UUID,
  inspected_by UUID,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, grn_number)
);

CREATE INDEX IF NOT EXISTS idx_grn_tenant ON goods_receiving(tenant_id, status);

CREATE TABLE IF NOT EXISTS goods_receiving_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id UUID NOT NULL REFERENCES goods_receiving(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  expected_quantity INTEGER NOT NULL,
  received_quantity INTEGER DEFAULT 0,
  rejected_quantity INTEGER DEFAULT 0,
  batch_number VARCHAR(100),
  expiry_date DATE,
  serial_numbers TEXT[],
  condition VARCHAR(30) DEFAULT 'good', -- good, damaged, defective
  rejection_reason TEXT,
  put_away_location_id UUID REFERENCES warehouse_locations(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grn_items_grn ON goods_receiving_items(grn_id);

-- ============================================
-- STOCK RESERVATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS stock_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  order_id UUID,
  order_type VARCHAR(30), -- sales_order, transfer, production
  session_id VARCHAR(100),
  location_id UUID REFERENCES warehouse_locations(id),
  batch_id UUID REFERENCES batches(id),
  status VARCHAR(30) DEFAULT 'active', -- active, fulfilled, released, expired
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservations_product ON stock_reservations(product_id, status);
CREATE INDEX IF NOT EXISTS idx_reservations_order ON stock_reservations(order_id);
CREATE INDEX IF NOT EXISTS idx_reservations_expires ON stock_reservations(expires_at) WHERE status = 'active';

-- ============================================
-- STOCK WRITE-OFFS
-- ============================================

CREATE TABLE IF NOT EXISTS stock_writeoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  writeoff_number VARCHAR(50) NOT NULL,
  store_id UUID,
  reason_category VARCHAR(50) NOT NULL, -- damaged, expired, lost, stolen, obsolete, sample, other
  status VARCHAR(30) DEFAULT 'pending', -- pending, approved, rejected
  total_value DECIMAL(15,2) DEFAULT 0,
  requested_by UUID,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, writeoff_number)
);

CREATE INDEX IF NOT EXISTS idx_writeoffs_tenant ON stock_writeoffs(tenant_id, status);

CREATE TABLE IF NOT EXISTS stock_writeoff_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  writeoff_id UUID NOT NULL REFERENCES stock_writeoffs(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_cost DECIMAL(15,2),
  total_cost DECIMAL(15,2),
  batch_id UUID REFERENCES batches(id),
  serial_numbers TEXT[],
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_writeoff_items_writeoff ON stock_writeoff_items(writeoff_id);

-- ============================================
-- INVENTORY AUDIT LOG
-- ============================================

CREATE TABLE IF NOT EXISTS inventory_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL,
  store_id UUID,
  location_id UUID,
  action VARCHAR(50) NOT NULL, -- adjustment, transfer_in, transfer_out, sale, return, receiving, writeoff, count_adjustment
  quantity_change INTEGER NOT NULL,
  quantity_before INTEGER,
  quantity_after INTEGER,
  reference_type VARCHAR(50), -- transaction, transfer, grn, count, writeoff
  reference_id UUID,
  batch_id UUID,
  serial_number VARCHAR(100),
  performed_by UUID,
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON inventory_audit_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_product ON inventory_audit_log(product_id, created_at DESC);

-- ============================================
-- LOW STOCK ALERTS
-- ============================================

CREATE TABLE IF NOT EXISTS low_stock_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id),
  store_id UUID,
  current_stock INTEGER NOT NULL,
  reorder_level INTEGER NOT NULL,
  velocity DECIMAL(10,2), -- units per day
  days_until_stockout INTEGER,
  severity VARCHAR(20) DEFAULT 'normal', -- normal, high, critical
  status VARCHAR(20) DEFAULT 'active', -- active, snoozed, dismissed, resolved
  snoozed_until TIMESTAMPTZ,
  dismissed_by UUID,
  dismissed_at TIMESTAMPTZ,
  dismissed_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partial unique index for active alerts (replaces UNIQUE constraint with WHERE)
CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_unique_active ON low_stock_alerts(tenant_id, product_id, store_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_alerts_tenant ON low_stock_alerts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON low_stock_alerts(severity) WHERE status = 'active';

-- ============================================
-- PRODUCT VARIANTS
-- ============================================

CREATE TABLE IF NOT EXISTS product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  parent_product_id UUID NOT NULL REFERENCES products(id),
  sku VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  attributes JSONB NOT NULL DEFAULT '{}', -- { "size": "M", "color": "Blue" }
  price DECIMAL(15,2),
  cost DECIMAL(15,2),
  barcode VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_variants_parent ON product_variants(parent_product_id);

-- ============================================
-- BUNDLE PRODUCTS
-- ============================================

CREATE TABLE IF NOT EXISTS product_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  bundle_price DECIMAL(15,2) NOT NULL,
  regular_price DECIMAL(15,2),
  sku VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bundle_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES product_bundles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  is_optional BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bundle_components_bundle ON bundle_components(bundle_id);

-- ============================================
-- ITEM MODIFIERS
-- ============================================

CREATE TABLE IF NOT EXISTS modifier_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name VARCHAR(100) NOT NULL,
  required BOOLEAN DEFAULT false,
  min_select INTEGER DEFAULT 0,
  max_select INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS modifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  price_adjustment DECIMAL(15,2) DEFAULT 0,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_modifier_groups (
  product_id UUID NOT NULL REFERENCES products(id),
  modifier_group_id UUID NOT NULL REFERENCES modifier_groups(id),
  PRIMARY KEY (product_id, modifier_group_id)
);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to generate sequential numbers
CREATE OR REPLACE FUNCTION generate_sequence_number(prefix TEXT, tenant UUID)
RETURNS TEXT AS $$
DECLARE
  today_str TEXT;
  seq_num INTEGER;
  result TEXT;
BEGIN
  today_str := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');
  
  -- Get next sequence for today
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(transfer_number FROM LENGTH(prefix) + 10) AS INTEGER)
  ), 0) + 1
  INTO seq_num
  FROM stock_transfers
  WHERE tenant_id = tenant
    AND transfer_number LIKE prefix || today_str || '%';
  
  result := prefix || today_str || '-' || LPAD(seq_num::TEXT, 3, '0');
  RETURN result;
END;
$$ LANGUAGE plpgsql;
