-- Project / Job Costing schema
-- Extracted from db/migrations/017_accounting_phase2_3.sql

CREATE TABLE IF NOT EXISTS acc_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    code VARCHAR(50),
    name VARCHAR(200) NOT NULL,
    customer_id UUID,
    manager_id UUID,
    budget DECIMAL(18,2) DEFAULT 0,
    start_date DATE,
    end_date DATE,
    status VARCHAR(20) DEFAULT 'active',
    billing_type VARCHAR(20) DEFAULT 'fixed',
    company_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_acc_project_status ON acc_projects(status);

CREATE TABLE IF NOT EXISTS acc_project_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    project_id UUID NOT NULL REFERENCES acc_projects(id),
    cost_type VARCHAR(50),
    source_type VARCHAR(50),
    source_id UUID,
    description TEXT,
    amount DECIMAL(18,2) DEFAULT 0,
    cost_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acc_project_costs_project ON acc_project_costs(project_id);

CREATE TABLE IF NOT EXISTS acc_project_revenue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    project_id UUID NOT NULL REFERENCES acc_projects(id),
    invoice_id UUID,
    amount DECIMAL(18,2) DEFAULT 0,
    revenue_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
