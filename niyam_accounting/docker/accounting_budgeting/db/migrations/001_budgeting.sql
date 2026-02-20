-- Budgeting schema
-- Extracted from db/migrations/014_accounting_full.sql + 017_accounting_phase2_3.sql

-- Basic budgets (from 014)
CREATE TABLE IF NOT EXISTS acc_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(200) NOT NULL,
    fiscal_year_id UUID REFERENCES acc_fiscal_years(id),
    budget_type VARCHAR(20) DEFAULT 'annual' CHECK (budget_type IN ('annual', 'quarterly', 'monthly')),
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'active', 'closed')),
    total_amount DECIMAL(18,2) DEFAULT 0,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, name, fiscal_year_id)
);

CREATE TABLE IF NOT EXISTS acc_budget_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    budget_id UUID NOT NULL REFERENCES acc_budgets(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES acc_accounts(id),
    cost_center_id UUID REFERENCES acc_cost_centers(id),
    fiscal_period_id UUID REFERENCES acc_fiscal_periods(id),
    budgeted_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
    actual_amount DECIMAL(18,2) DEFAULT 0,
    variance DECIMAL(18,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(budget_id, account_id, cost_center_id, fiscal_period_id)
);

-- Advanced Budget Versions (from 017)
CREATE TABLE IF NOT EXISTS acc_budget_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(200) NOT NULL,
    fiscal_year_id UUID,
    version INT DEFAULT 1,
    status VARCHAR(20) DEFAULT 'draft',
    created_by UUID,
    company_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acc_budget_version_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    version_id UUID NOT NULL REFERENCES acc_budget_versions(id) ON DELETE CASCADE,
    account_id UUID,
    cost_center_id UUID,
    period VARCHAR(20),
    amount DECIMAL(18,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
