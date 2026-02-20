-- Point of Sale Extended Tables
-- Migration: 001_pos_extended.sql
-- Date: 2025-01-21

-- ============================================
-- RETURNS & REFUNDS
-- ============================================

CREATE TABLE IF NOT EXISTS pos_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  return_number VARCHAR(50) NOT NULL,
  original_transaction_id UUID REFERENCES pos_transactions(id),
  session_id UUID REFERENCES pos_sessions(id),
  store_id UUID NOT NULL,
  cashier_id UUID NOT NULL,
  customer_id UUID,
  return_type VARCHAR(30) DEFAULT 'refund', -- refund, exchange, store_credit
  status VARCHAR(30) DEFAULT 'pending', -- pending, approved, completed, rejected
  subtotal DECIMAL(15,2) DEFAULT 0,
  tax DECIMAL(15,2) DEFAULT 0,
  total DECIMAL(15,2) DEFAULT 0,
  refund_method VARCHAR(30), -- cash, card, store_credit, original_payment
  refund_amount DECIMAL(15,2) DEFAULT 0,
  store_credit_issued DECIMAL(15,2) DEFAULT 0,
  reason VARCHAR(100),
  notes TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, return_number)
);

CREATE INDEX IF NOT EXISTS idx_returns_tenant ON pos_returns(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_returns_original ON pos_returns(original_transaction_id);

CREATE TABLE IF NOT EXISTS pos_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES pos_returns(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  sku VARCHAR(100) NOT NULL,
  name VARCHAR(255),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(15,2) NOT NULL,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  subtotal DECIMAL(15,2) NOT NULL,
  tax_amount DECIMAL(15,2) DEFAULT 0,
  return_reason VARCHAR(100), -- defective, wrong_item, changed_mind, damaged, other
  condition VARCHAR(30) DEFAULT 'good', -- good, damaged, defective, opened
  restock BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_return_items_return ON pos_return_items(return_id);

-- ============================================
-- GIFT CARDS
-- ============================================

CREATE TABLE IF NOT EXISTS gift_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  card_number VARCHAR(50) NOT NULL,
  pin VARCHAR(10),
  initial_balance DECIMAL(15,2) NOT NULL,
  current_balance DECIMAL(15,2) NOT NULL,
  status VARCHAR(30) DEFAULT 'active', -- active, used, expired, cancelled
  purchased_by UUID, -- customer_id
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  issued_transaction_id UUID,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, card_number)
);

CREATE INDEX IF NOT EXISTS idx_gift_cards_tenant ON gift_cards(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_gift_cards_number ON gift_cards(card_number);

CREATE TABLE IF NOT EXISTS gift_card_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_card_id UUID NOT NULL REFERENCES gift_cards(id),
  transaction_type VARCHAR(30) NOT NULL, -- purchase, redemption, refund, adjustment
  amount DECIMAL(15,2) NOT NULL,
  balance_before DECIMAL(15,2) NOT NULL,
  balance_after DECIMAL(15,2) NOT NULL,
  reference_id UUID, -- pos_transaction_id
  reference_type VARCHAR(30),
  notes TEXT,
  performed_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gc_transactions_card ON gift_card_transactions(gift_card_id);

-- ============================================
-- LAYAWAY / INSTALLMENTS
-- ============================================

CREATE TABLE IF NOT EXISTS layaways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  layaway_number VARCHAR(50) NOT NULL,
  session_id UUID,
  store_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  status VARCHAR(30) DEFAULT 'active', -- active, completed, cancelled, expired
  items JSONB NOT NULL,
  subtotal DECIMAL(15,2) NOT NULL,
  tax DECIMAL(15,2) NOT NULL,
  total DECIMAL(15,2) NOT NULL,
  deposit_required DECIMAL(15,2) DEFAULT 0,
  deposit_paid DECIMAL(15,2) DEFAULT 0,
  balance_due DECIMAL(15,2) NOT NULL,
  duration_days INTEGER DEFAULT 30,
  expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, layaway_number)
);

CREATE INDEX IF NOT EXISTS idx_layaways_tenant ON layaways(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_layaways_customer ON layaways(customer_id);

CREATE TABLE IF NOT EXISTS layaway_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layaway_id UUID NOT NULL REFERENCES layaways(id) ON DELETE CASCADE,
  amount DECIMAL(15,2) NOT NULL,
  payment_method VARCHAR(30) NOT NULL,
  balance_before DECIMAL(15,2) NOT NULL,
  balance_after DECIMAL(15,2) NOT NULL,
  transaction_id UUID,
  received_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_layaway_payments_layaway ON layaway_payments(layaway_id);

-- ============================================
-- SUSPENDED TRANSACTIONS (HOLD)
-- ============================================

CREATE TABLE IF NOT EXISTS suspended_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  session_id UUID NOT NULL,
  store_id UUID NOT NULL,
  cashier_id UUID NOT NULL,
  customer_id UUID,
  cart_data JSONB NOT NULL,
  subtotal DECIMAL(15,2) DEFAULT 0,
  tax DECIMAL(15,2) DEFAULT 0,
  discount DECIMAL(15,2) DEFAULT 0,
  total DECIMAL(15,2) DEFAULT 0,
  hold_reason VARCHAR(100),
  recalled BOOLEAN DEFAULT false,
  recalled_at TIMESTAMPTZ,
  recalled_by UUID,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suspended_tenant ON suspended_transactions(tenant_id, recalled);
CREATE INDEX IF NOT EXISTS idx_suspended_session ON suspended_transactions(session_id);

-- ============================================
-- CASH MANAGEMENT
-- ============================================

CREATE TABLE IF NOT EXISTS cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  session_id UUID NOT NULL REFERENCES pos_sessions(id),
  movement_type VARCHAR(30) NOT NULL, -- paid_in, paid_out, drop, pickup, float
  amount DECIMAL(15,2) NOT NULL,
  reason VARCHAR(100),
  reference_number VARCHAR(50),
  performed_by UUID NOT NULL,
  approved_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_movements_session ON cash_movements(session_id);

-- ============================================
-- PRICE OVERRIDES
-- ============================================

CREATE TABLE IF NOT EXISTS price_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  transaction_id UUID,
  session_id UUID,
  product_id UUID NOT NULL,
  sku VARCHAR(100) NOT NULL,
  original_price DECIMAL(15,2) NOT NULL,
  override_price DECIMAL(15,2) NOT NULL,
  override_type VARCHAR(30) DEFAULT 'manual', -- manual, manager_discount, price_match
  reason VARCHAR(255),
  authorized_by UUID NOT NULL,
  authorization_code VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_overrides_tenant ON price_overrides(tenant_id);

-- ============================================
-- OFFLINE TRANSACTION QUEUE
-- ============================================

CREATE TABLE IF NOT EXISTS offline_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  store_id UUID NOT NULL,
  device_id VARCHAR(100),
  transaction_data JSONB NOT NULL,
  transaction_type VARCHAR(30) NOT NULL, -- sale, return, void
  offline_timestamp TIMESTAMPTZ NOT NULL,
  sync_status VARCHAR(30) DEFAULT 'pending', -- pending, synced, failed, conflict
  synced_at TIMESTAMPTZ,
  synced_transaction_id UUID,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offline_tenant ON offline_transactions(tenant_id, sync_status);
CREATE INDEX IF NOT EXISTS idx_offline_store ON offline_transactions(store_id, sync_status);

-- ============================================
-- DAILY RECONCILIATION
-- ============================================

CREATE TABLE IF NOT EXISTS daily_reconciliation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  store_id UUID NOT NULL,
  reconciliation_date DATE NOT NULL,
  status VARCHAR(30) DEFAULT 'pending', -- pending, completed, discrepancy
  total_transactions INTEGER DEFAULT 0,
  total_sales DECIMAL(15,2) DEFAULT 0,
  total_returns DECIMAL(15,2) DEFAULT 0,
  total_discounts DECIMAL(15,2) DEFAULT 0,
  cash_expected DECIMAL(15,2) DEFAULT 0,
  cash_actual DECIMAL(15,2),
  cash_variance DECIMAL(15,2),
  card_total DECIMAL(15,2) DEFAULT 0,
  other_payments DECIMAL(15,2) DEFAULT 0,
  sessions_included UUID[],
  reconciled_by UUID,
  reconciled_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, store_id, reconciliation_date)
);

CREATE INDEX IF NOT EXISTS idx_recon_tenant ON daily_reconciliation(tenant_id, reconciliation_date);
