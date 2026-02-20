-- Returns Management tables

CREATE TABLE IF NOT EXISTS returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  order_id UUID NOT NULL,
  customer_id UUID,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  reason VARCHAR(500),
  reason_category VARCHAR(50),
  refund_amount NUMERIC(12,2) DEFAULT 0,
  refund_method VARCHAR(30) DEFAULT 'original_payment',
  notes TEXT,
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_returns_tenant ON returns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_returns_order ON returns(tenant_id, order_id);
CREATE INDEX IF NOT EXISTS idx_returns_customer ON returns(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_returns_status ON returns(tenant_id, status);

CREATE TABLE IF NOT EXISTS return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  return_id UUID NOT NULL REFERENCES returns(id),
  product_id UUID NOT NULL,
  variant_id UUID,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) DEFAULT 0,
  reason VARCHAR(500),
  condition VARCHAR(30) DEFAULT 'unopened',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_return_items_return ON return_items(tenant_id, return_id);

CREATE TABLE IF NOT EXISTS exchanges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  return_id UUID NOT NULL REFERENCES returns(id),
  original_product_id UUID NOT NULL,
  original_variant_id UUID,
  new_product_id UUID NOT NULL,
  new_variant_id UUID,
  quantity INTEGER NOT NULL DEFAULT 1,
  price_difference NUMERIC(12,2) DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exchanges_return ON exchanges(tenant_id, return_id);
