-- Product Reviews Tables
-- Migration: 001_product_reviews.sql

-- ============================================
-- REVIEWS
-- ============================================

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL,
  customer_id UUID,
  customer_name VARCHAR(200),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title VARCHAR(255),
  body TEXT,
  is_verified_purchase BOOLEAN DEFAULT false,
  status VARCHAR(20) DEFAULT 'pending',
  helpful_count INTEGER DEFAULT 0,
  reported_count INTEGER DEFAULT 0,
  admin_response TEXT,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_tenant ON reviews(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_customer ON reviews(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(product_id, rating);
