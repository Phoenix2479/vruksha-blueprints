-- Sales Analytics Tables
-- Migration: 001_sales_analytics.sql

-- ============================================
-- DAILY SALES SNAPSHOT
-- ============================================

CREATE TABLE IF NOT EXISTS daily_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  date DATE NOT NULL,
  total_orders INTEGER DEFAULT 0,
  total_revenue DECIMAL(15,2) DEFAULT 0,
  total_items_sold INTEGER DEFAULT 0,
  avg_order_value DECIMAL(15,2) DEFAULT 0,
  total_refunds DECIMAL(15,2) DEFAULT 0,
  net_revenue DECIMAL(15,2) DEFAULT 0,
  new_customers INTEGER DEFAULT 0,
  returning_customers INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_sales_tenant ON daily_sales(tenant_id, date);

-- ============================================
-- PRODUCT PERFORMANCE
-- ============================================

CREATE TABLE IF NOT EXISTS product_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL,
  period VARCHAR(20) NOT NULL,
  units_sold INTEGER DEFAULT 0,
  revenue DECIMAL(15,2) DEFAULT 0,
  views INTEGER DEFAULT 0,
  conversion_rate DECIMAL(5,4) DEFAULT 0,
  avg_rating DECIMAL(3,2) DEFAULT 0,
  return_rate DECIMAL(5,4) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, product_id, period)
);

CREATE INDEX IF NOT EXISTS idx_product_perf_tenant ON product_performance(tenant_id, period);
CREATE INDEX IF NOT EXISTS idx_product_perf_product ON product_performance(product_id, period);
