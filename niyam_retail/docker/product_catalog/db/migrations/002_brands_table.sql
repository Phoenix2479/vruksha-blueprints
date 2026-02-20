-- Product Catalog - Brands Table
-- Migration: 002_brands_table.sql
-- Date: 2025-01-22

-- Create brands table if not exists
CREATE TABLE IF NOT EXISTS brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  description TEXT,
  logo_url TEXT,
  website_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_brands_tenant ON brands(tenant_id);
CREATE INDEX IF NOT EXISTS idx_brands_slug ON brands(tenant_id, slug);

-- Add brand_id to products if not exists
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);

-- Add additional product columns if not exist
ALTER TABLE products ADD COLUMN IF NOT EXISTS compare_at_price DECIMAL(15,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost DECIMAL(15,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight DECIMAL(10,3);
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_unit VARCHAR(10);
ALTER TABLE products ADD COLUMN IF NOT EXISTS dimensions JSONB;
ALTER TABLE products ADD COLUMN IF NOT EXISTS track_inventory BOOLEAN DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER DEFAULT 10;
ALTER TABLE products ADD COLUMN IF NOT EXISTS allow_backorder BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_title VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_description TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Product-Category many-to-many link table
CREATE TABLE IF NOT EXISTS product_category_links (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  PRIMARY KEY (product_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_product_category_links_product ON product_category_links(product_id);
CREATE INDEX IF NOT EXISTS idx_product_category_links_category ON product_category_links(category_id);
