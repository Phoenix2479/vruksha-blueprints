-- Payment Gateway Tables
-- Migration: 001_payment_gateway.sql

-- ============================================
-- GATEWAY CONFIGURATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS gateway_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  provider VARCHAR(100) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  credentials JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  supported_methods JSONB DEFAULT '["card"]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gateway_configs_tenant ON gateway_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gateway_configs_active ON gateway_configs(tenant_id, is_active);

-- ============================================
-- TRANSACTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  order_id UUID,
  gateway_id UUID REFERENCES gateway_configs(id),
  type VARCHAR(30) NOT NULL DEFAULT 'charge',
  amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  payment_method VARCHAR(50),
  card_last_four VARCHAR(4),
  reference_id VARCHAR(255),
  parent_transaction_id UUID REFERENCES transactions(id),
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_tenant ON transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_order ON transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_gateway ON transactions(gateway_id);
CREATE INDEX IF NOT EXISTS idx_transactions_parent ON transactions(parent_transaction_id);
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(reference_id);
