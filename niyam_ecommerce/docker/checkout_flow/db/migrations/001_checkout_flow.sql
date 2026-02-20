-- Checkout Flow Schema
-- Checkout Sessions with multi-step state

CREATE TABLE IF NOT EXISTS checkout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  cart_id UUID NOT NULL,
  customer_id UUID,
  customer_email VARCHAR(255),

  -- Current step: address, shipping, payment, confirm, completed, failed
  current_step VARCHAR(20) DEFAULT 'address' CHECK (current_step IN ('address', 'shipping', 'payment', 'confirm', 'completed', 'failed')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'expired', 'cancelled')),

  -- Shipping address
  shipping_address_line1 VARCHAR(255),
  shipping_address_line2 VARCHAR(255),
  shipping_city VARCHAR(100),
  shipping_state VARCHAR(100),
  shipping_postal_code VARCHAR(20),
  shipping_country VARCHAR(2),
  shipping_phone VARCHAR(30),
  shipping_name VARCHAR(255),

  -- Billing address
  billing_address_line1 VARCHAR(255),
  billing_address_line2 VARCHAR(255),
  billing_city VARCHAR(100),
  billing_state VARCHAR(100),
  billing_postal_code VARCHAR(20),
  billing_country VARCHAR(2),
  billing_same_as_shipping BOOLEAN DEFAULT true,

  -- Shipping method
  shipping_method VARCHAR(50),
  shipping_carrier VARCHAR(100),
  shipping_cost NUMERIC(12, 2) DEFAULT 0,
  estimated_delivery_date DATE,

  -- Payment
  payment_method VARCHAR(50),
  payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'authorized', 'captured', 'failed', 'refunded')),
  payment_reference VARCHAR(255),
  payment_amount NUMERIC(12, 2) DEFAULT 0,

  -- Order totals (snapshot from cart at checkout time)
  subtotal NUMERIC(12, 2) DEFAULT 0,
  tax_amount NUMERIC(12, 2) DEFAULT 0,
  discount_amount NUMERIC(12, 2) DEFAULT 0,
  total NUMERIC(12, 2) DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'USD',

  -- Cart snapshot (items at time of checkout)
  cart_snapshot JSONB DEFAULT '[]',

  -- Order reference (set on completion)
  order_id UUID,
  order_number VARCHAR(50),

  notes TEXT,
  metadata JSONB DEFAULT '{}',

  expires_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkout_tenant_cart ON checkout_sessions(tenant_id, cart_id);
CREATE INDEX IF NOT EXISTS idx_checkout_tenant_customer ON checkout_sessions(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_checkout_tenant_status ON checkout_sessions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_checkout_order ON checkout_sessions(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_checkout_expires ON checkout_sessions(expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_checkout_created ON checkout_sessions(created_at DESC);
