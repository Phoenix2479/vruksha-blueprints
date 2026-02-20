-- Voucher Entry schema (Tally-style entry)
-- Extracted from db/migrations/017_accounting_phase2_3.sql

CREATE TABLE IF NOT EXISTS acc_vouchers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    voucher_number VARCHAR(50) NOT NULL,
    voucher_type VARCHAR(20) NOT NULL CHECK (voucher_type IN ('sales','purchase','payment','receipt','contra','journal')),
    voucher_date DATE NOT NULL,
    party_id UUID,
    party_type VARCHAR(20),
    amount DECIMAL(18,2) NOT NULL DEFAULT 0,
    narration TEXT,
    reference VARCHAR(200),
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','posted','void')),
    journal_entry_id UUID,
    company_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, voucher_number)
);

CREATE INDEX IF NOT EXISTS idx_acc_vouchers_tenant ON acc_vouchers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_acc_vouchers_type ON acc_vouchers(voucher_type);
CREATE INDEX IF NOT EXISTS idx_acc_vouchers_date ON acc_vouchers(voucher_date);
CREATE INDEX IF NOT EXISTS idx_acc_vouchers_status ON acc_vouchers(status);

CREATE TABLE IF NOT EXISTS acc_voucher_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    voucher_id UUID NOT NULL REFERENCES acc_vouchers(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    account_id UUID NOT NULL,
    amount DECIMAL(18,2) NOT NULL DEFAULT 0,
    dr_cr VARCHAR(2) NOT NULL CHECK (dr_cr IN ('dr','cr')),
    description TEXT,
    hsn_code VARCHAR(20),
    tax_code_id UUID,
    tax_amount DECIMAL(18,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acc_voucher_lines_voucher ON acc_voucher_lines(voucher_id);

-- Recurring Transaction Templates
CREATE TABLE IF NOT EXISTS acc_recurring_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(200) NOT NULL,
    voucher_type VARCHAR(20) NOT NULL,
    frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('daily','weekly','monthly','quarterly','yearly')),
    day_of_month INT,
    day_of_week INT,
    start_date DATE NOT NULL,
    end_date DATE,
    next_run_date DATE NOT NULL,
    last_run_date DATE,
    party_id UUID,
    party_type VARCHAR(20),
    amount DECIMAL(18,2) NOT NULL DEFAULT 0,
    narration TEXT,
    is_active BOOLEAN DEFAULT true,
    auto_post BOOLEAN DEFAULT false,
    run_count INT DEFAULT 0,
    company_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acc_recurring_next ON acc_recurring_templates(next_run_date);

CREATE TABLE IF NOT EXISTS acc_recurring_template_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    template_id UUID NOT NULL REFERENCES acc_recurring_templates(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    account_id UUID NOT NULL,
    amount DECIMAL(18,2) NOT NULL DEFAULT 0,
    dr_cr VARCHAR(2) NOT NULL CHECK (dr_cr IN ('dr','cr')),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acc_recurring_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    template_id UUID NOT NULL REFERENCES acc_recurring_templates(id),
    generated_voucher_id UUID,
    generated_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'success' CHECK (status IN ('success','failed','skipped')),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
