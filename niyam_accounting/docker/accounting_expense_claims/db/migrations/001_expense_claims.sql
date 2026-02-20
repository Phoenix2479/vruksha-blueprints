-- Expense Claims schema
-- Extracted from db/migrations/017_accounting_phase2_3.sql

CREATE TABLE IF NOT EXISTS acc_expense_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    claim_number VARCHAR(50),
    employee_id UUID,
    employee_name VARCHAR(200),
    claim_date DATE,
    total DECIMAL(18,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'draft',
    approved_by VARCHAR(200),
    approved_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    journal_entry_id UUID,
    notes TEXT,
    company_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, claim_number)
);

CREATE INDEX IF NOT EXISTS idx_acc_expense_status ON acc_expense_claims(status);

CREATE TABLE IF NOT EXISTS acc_expense_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    claim_id UUID NOT NULL REFERENCES acc_expense_claims(id) ON DELETE CASCADE,
    expense_date DATE,
    category VARCHAR(100),
    description TEXT,
    amount DECIMAL(18,2) DEFAULT 0,
    tax DECIMAL(18,2) DEFAULT 0,
    receipt_url TEXT,
    project_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acc_expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    gl_account_id UUID,
    requires_receipt BOOLEAN DEFAULT false,
    max_amount DECIMAL(18,2),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
