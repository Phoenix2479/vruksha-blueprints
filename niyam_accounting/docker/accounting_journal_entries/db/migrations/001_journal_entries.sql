-- Journal Entries schema (Double-Entry Bookkeeping)
-- Extracted from db/migrations/014_accounting_full.sql

CREATE TABLE IF NOT EXISTS acc_journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    entry_number VARCHAR(50) NOT NULL,
    entry_date DATE NOT NULL,
    fiscal_period_id UUID REFERENCES acc_fiscal_periods(id),
    entry_type VARCHAR(20) DEFAULT 'manual',
    source_type VARCHAR(50),
    source_id UUID,
    source_number VARCHAR(100),
    description TEXT,
    reference VARCHAR(200),
    total_debit DECIMAL(18,2) NOT NULL DEFAULT 0,
    total_credit DECIMAL(18,2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'INR',
    exchange_rate DECIMAL(18,6) DEFAULT 1,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'reversed', 'voided')),
    posted_at TIMESTAMPTZ,
    posted_by UUID,
    is_reversing BOOLEAN DEFAULT false,
    reversed_entry_id UUID REFERENCES acc_journal_entries(id),
    reversal_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    UNIQUE(tenant_id, entry_number),
    CONSTRAINT chk_balanced CHECK (total_debit = total_credit OR status = 'draft')
);

CREATE INDEX IF NOT EXISTS idx_acc_journal_entries_tenant ON acc_journal_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_acc_journal_entries_date ON acc_journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_acc_journal_entries_source ON acc_journal_entries(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_acc_journal_entries_status ON acc_journal_entries(status);

CREATE TABLE IF NOT EXISTS acc_journal_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    journal_entry_id UUID NOT NULL REFERENCES acc_journal_entries(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    account_id UUID NOT NULL REFERENCES acc_accounts(id),
    description TEXT,
    debit_amount DECIMAL(18,2) DEFAULT 0,
    credit_amount DECIMAL(18,2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'INR',
    fc_debit_amount DECIMAL(18,2) DEFAULT 0,
    fc_credit_amount DECIMAL(18,2) DEFAULT 0,
    exchange_rate DECIMAL(18,6) DEFAULT 1,
    cost_center_id UUID,
    project_id UUID,
    department_id UUID,
    tax_code VARCHAR(20),
    tax_amount DECIMAL(18,2) DEFAULT 0,
    reference VARCHAR(200),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(journal_entry_id, line_number),
    CONSTRAINT chk_debit_or_credit CHECK (
        (debit_amount > 0 AND credit_amount = 0) OR
        (credit_amount > 0 AND debit_amount = 0) OR
        (debit_amount = 0 AND credit_amount = 0)
    )
);

CREATE INDEX IF NOT EXISTS idx_acc_journal_lines_entry ON acc_journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_acc_journal_lines_account ON acc_journal_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_acc_journal_lines_tenant ON acc_journal_lines(tenant_id);
