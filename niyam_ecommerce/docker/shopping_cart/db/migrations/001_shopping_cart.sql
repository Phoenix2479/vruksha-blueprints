-- Shopping Cart Schema
-- Carts and Cart Items

CREATE TABLE IF NOT EXISTS carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  customer_id UUID,
  session_id VARCHAR(255),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'merged', 'converted', 'abandoned')),
  currency VARCHAR(3) DEFAULT 'USD',
  subtotal NUMERIC(12, 2) DEFAULT 0,
  tax_amount NUMERIC(12, 2) DEFAULT 0,
  discount_amount NUMERIC(12, 2) DEFAULT 0,
  total NUMERIC(12, 2) DEFAULT 0,
  coupon_code VARCHAR(100),
  coupon_discount NUMERIC(12, 2) DEFAULT 0,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  item_count INTEGER DEFAULT 0,
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_carts_tenant_customer ON carts(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_carts_tenant_session ON carts(tenant_id, session_id);
CREATE INDEX IF NOT EXISTS idx_carts_tenant_status ON carts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_carts_last_activity ON carts(last_activity_at);
CREATE INDEX IF NOT EXISTS idx_carts_expires ON carts(expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  variant_id UUID,
  product_name VARCHAR(255) NOT NULL,
  product_sku VARCHAR(100),
  product_image TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL,
  tax_rate NUMERIC(5, 2) DEFAULT 0,
  tax_amount NUMERIC(12, 2) DEFAULT 0,
  discount_amount NUMERIC(12, 2) DEFAULT 0,
  line_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  options JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_tenant_cart ON cart_items(tenant_id, cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product ON cart_items(product_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_items_cart_product_variant ON cart_items(cart_id, product_id, variant_id) WHERE variant_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_items_cart_product_no_variant ON cart_items(cart_id, product_id) WHERE variant_id IS NULL;
