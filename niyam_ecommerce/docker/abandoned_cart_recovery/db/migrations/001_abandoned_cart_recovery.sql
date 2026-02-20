-- Abandoned Cart Recovery Tables
-- Migration: 001_abandoned_cart_recovery.sql

-- ============================================
-- ABANDONED CARTS
-- ============================================

CREATE TABLE IF NOT EXISTS abandoned_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  cart_id UUID NOT NULL,
  customer_id UUID,
  customer_email VARCHAR(255),
  cart_total DECIMAL(15,2) DEFAULT 0,
  items_count INTEGER DEFAULT 0,
  cart_items JSONB DEFAULT '[]',
  recovery_status VARCHAR(30) DEFAULT 'pending',
  recovery_attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  recovered_at TIMESTAMPTZ,
  recovered_order_id UUID,
  abandoned_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_tenant ON abandoned_carts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_status ON abandoned_carts(tenant_id, recovery_status);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_customer ON abandoned_carts(customer_id);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_email ON abandoned_carts(customer_email);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_date ON abandoned_carts(abandoned_at);

-- ============================================
-- RECOVERY ATTEMPTS
-- ============================================

CREATE TABLE IF NOT EXISTS recovery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  abandoned_cart_id UUID NOT NULL REFERENCES abandoned_carts(id) ON DELETE CASCADE,
  channel VARCHAR(30) DEFAULT 'email',
  template_id UUID,
  status VARCHAR(30) DEFAULT 'sent',
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recovery_attempts_tenant ON recovery_attempts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recovery_attempts_cart ON recovery_attempts(abandoned_cart_id);
CREATE INDEX IF NOT EXISTS idx_recovery_attempts_status ON recovery_attempts(status);

-- ============================================
-- RECOVERY TEMPLATES
-- ============================================

CREATE TABLE IF NOT EXISTS recovery_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  channel VARCHAR(30) DEFAULT 'email',
  subject VARCHAR(500),
  body TEXT,
  delay_hours INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recovery_templates_tenant ON recovery_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recovery_templates_active ON recovery_templates(tenant_id, is_active);
