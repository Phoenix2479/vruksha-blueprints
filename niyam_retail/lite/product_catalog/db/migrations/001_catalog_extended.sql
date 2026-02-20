-- Product Catalog Extended Tables
-- Migration: 001_catalog_extended.sql
-- Date: 2025-01-21

-- ============================================
-- PRODUCT CATEGORIES (Enhanced)
-- ============================================

-- Category hierarchy (if not exists)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES categories(id);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 0;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS path TEXT; -- Materialized path: "/root/parent/child"
ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(tenant_id, parent_id);

-- ============================================
-- PRODUCT ATTRIBUTES
-- ============================================

CREATE TABLE IF NOT EXISTS product_attributes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name VARCHAR(100) NOT NULL, -- e.g., "Color", "Size", "Material"
  code VARCHAR(50) NOT NULL, -- e.g., "color", "size"
  attribute_type VARCHAR(30) NOT NULL, -- text, number, boolean, select, multiselect
  options JSONB, -- For select/multiselect: ["Red", "Blue", "Green"]
  unit VARCHAR(20), -- e.g., "cm", "kg"
  is_filterable BOOLEAN DEFAULT false,
  is_visible BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_attributes_tenant ON product_attributes(tenant_id);

-- Product attribute values
CREATE TABLE IF NOT EXISTS product_attribute_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  attribute_id UUID NOT NULL REFERENCES product_attributes(id) ON DELETE CASCADE,
  value_text TEXT,
  value_number DECIMAL(15,4),
  value_boolean BOOLEAN,
  value_json JSONB, -- For multiselect
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, attribute_id)
);

CREATE INDEX IF NOT EXISTS idx_attr_values_product ON product_attribute_values(product_id);
CREATE INDEX IF NOT EXISTS idx_attr_values_attribute ON product_attribute_values(attribute_id);

-- ============================================
-- PRODUCT VARIANTS (Size/Color combinations)
-- ============================================

CREATE TABLE IF NOT EXISTS product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku VARCHAR(100) NOT NULL,
  name VARCHAR(255),
  attributes JSONB NOT NULL, -- {"color": "Red", "size": "M"}
  price DECIMAL(15,2), -- Override parent price
  cost DECIMAL(15,2),
  weight DECIMAL(10,3),
  barcode VARCHAR(100),
  image_url TEXT,
  stock_quantity INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_tenant ON product_variants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_variants_barcode ON product_variants(barcode);

-- ============================================
-- PRODUCT MEDIA
-- ============================================

CREATE TABLE IF NOT EXISTS product_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  media_type VARCHAR(30) NOT NULL, -- image, video, document, 3d_model
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  alt_text VARCHAR(255),
  title VARCHAR(255),
  sort_order INTEGER DEFAULT 0,
  is_primary BOOLEAN DEFAULT false,
  metadata JSONB, -- width, height, file_size, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_product ON product_media(product_id);

-- ============================================
-- PRODUCT PRICING
-- ============================================

CREATE TABLE IF NOT EXISTS product_price_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  min_quantity INTEGER NOT NULL DEFAULT 1,
  price DECIMAL(15,2) NOT NULL,
  customer_group VARCHAR(50), -- wholesale, retail, vip
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_tiers_product ON product_price_tiers(product_id);

CREATE TABLE IF NOT EXISTS product_special_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  special_price DECIMAL(15,2) NOT NULL,
  discount_percent DECIMAL(5,2),
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  customer_group VARCHAR(50),
  store_id UUID, -- NULL = all stores
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_special_prices_product ON product_special_prices(product_id);
CREATE INDEX IF NOT EXISTS idx_special_prices_dates ON product_special_prices(start_date, end_date);

-- ============================================
-- PRODUCT BUNDLES & KITS
-- ============================================

CREATE TABLE IF NOT EXISTS product_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  bundle_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  bundle_type VARCHAR(30) DEFAULT 'fixed', -- fixed, configurable
  discount_type VARCHAR(30), -- percentage, fixed
  discount_value DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, bundle_product_id)
);

CREATE TABLE IF NOT EXISTS product_bundle_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES product_bundles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  variant_id UUID REFERENCES product_variants(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  is_optional BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_bundle_items_bundle ON product_bundle_items(bundle_id);

-- ============================================
-- RELATED PRODUCTS
-- ============================================

CREATE TABLE IF NOT EXISTS product_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  related_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  relation_type VARCHAR(30) NOT NULL, -- related, upsell, cross_sell, accessory
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, related_product_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_relations_product ON product_relations(product_id);

-- ============================================
-- PRODUCT REVIEWS
-- ============================================

CREATE TABLE IF NOT EXISTS product_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id UUID,
  customer_name VARCHAR(100),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title VARCHAR(255),
  review_text TEXT,
  pros TEXT,
  cons TEXT,
  is_verified_purchase BOOLEAN DEFAULT false,
  status VARCHAR(30) DEFAULT 'pending', -- pending, approved, rejected
  helpful_count INTEGER DEFAULT 0,
  images JSONB, -- Array of image URLs
  reviewed_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reviews_product ON product_reviews(product_id, status);
CREATE INDEX IF NOT EXISTS idx_reviews_tenant ON product_reviews(tenant_id);

-- ============================================
-- PRODUCT TAGS & LABELS
-- ============================================

CREATE TABLE IF NOT EXISTS product_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  color VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS product_tag_links (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES product_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, tag_id)
);

-- ============================================
-- PRODUCT AUDIT LOG
-- ============================================

CREATE TABLE IF NOT EXISTS product_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL,
  action VARCHAR(30) NOT NULL, -- create, update, delete, price_change, stock_change
  old_values JSONB,
  new_values JSONB,
  changed_fields TEXT[],
  performed_by UUID,
  performed_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address VARCHAR(45)
);

CREATE INDEX IF NOT EXISTS idx_product_audit_product ON product_audit_log(product_id);
CREATE INDEX IF NOT EXISTS idx_product_audit_tenant ON product_audit_log(tenant_id, performed_at);
