-- Inventory Valuation schema
-- Extracted from db/migrations/017_accounting_phase2_3.sql

CREATE TABLE IF NOT EXISTS acc_inventory_valuation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    product_id VARCHAR(100) NOT NULL,
    product_name VARCHAR(200),
    valuation_method VARCHAR(20) DEFAULT 'weighted_avg' CHECK (valuation_method IN ('fifo','lifo','weighted_avg','specific')),
    unit_cost DECIMAL(18,4) DEFAULT 0,
    total_qty DECIMAL(18,4) DEFAULT 0,
    total_value DECIMAL(18,2) DEFAULT 0,
    account_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acc_inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    product_id VARCHAR(100) NOT NULL,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('purchase','sale','adjustment','return_in','return_out')),
    quantity DECIMAL(18,4) NOT NULL,
    unit_cost DECIMAL(18,4) NOT NULL,
    total_cost DECIMAL(18,2) NOT NULL,
    journal_entry_id UUID,
    reference_id VARCHAR(100),
    reference_type VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
