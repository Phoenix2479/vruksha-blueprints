-- Fixed Assets & Depreciation schema
-- Extracted from db/migrations/017_accounting_phase2_3.sql

CREATE TABLE IF NOT EXISTS acc_asset_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(200) NOT NULL,
    default_useful_life INT DEFAULT 60,
    default_method VARCHAR(10) DEFAULT 'SLM',
    gl_asset_account UUID,
    gl_depreciation_account UUID,
    gl_expense_account UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acc_fixed_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    asset_code VARCHAR(50),
    name VARCHAR(200) NOT NULL,
    category_id UUID,
    purchase_date DATE,
    purchase_value DECIMAL(18,2) DEFAULT 0,
    salvage_value DECIMAL(18,2) DEFAULT 0,
    useful_life_months INT DEFAULT 60,
    depreciation_method VARCHAR(10) DEFAULT 'SLM',
    gl_asset_account UUID,
    gl_depreciation_account UUID,
    gl_expense_account UUID,
    status VARCHAR(20) DEFAULT 'active',
    disposed_date DATE,
    disposed_value DECIMAL(18,2),
    company_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, asset_code)
);

CREATE INDEX IF NOT EXISTS idx_acc_asset_status ON acc_fixed_assets(status);

CREATE TABLE IF NOT EXISTS acc_depreciation_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    asset_id UUID NOT NULL REFERENCES acc_fixed_assets(id),
    period VARCHAR(10),
    depreciation_amount DECIMAL(18,2) DEFAULT 0,
    accumulated DECIMAL(18,2) DEFAULT 0,
    book_value DECIMAL(18,2) DEFAULT 0,
    journal_entry_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acc_depreciation_asset ON acc_depreciation_entries(asset_id);
