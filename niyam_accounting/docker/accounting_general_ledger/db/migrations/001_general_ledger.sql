-- General Ledger schema (Posting Summary)
-- Extracted from db/migrations/014_accounting_full.sql

CREATE TABLE IF NOT EXISTS acc_ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    account_id UUID NOT NULL REFERENCES acc_accounts(id),
    journal_line_id UUID REFERENCES acc_journal_lines(id),
    fiscal_period_id UUID REFERENCES acc_fiscal_periods(id),
    entry_date DATE NOT NULL,
    debit_amount DECIMAL(18,2) DEFAULT 0,
    credit_amount DECIMAL(18,2) DEFAULT 0,
    balance DECIMAL(18,2) DEFAULT 0,
    description TEXT,
    reference VARCHAR(200),
    source_type VARCHAR(50),
    source_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acc_ledger_entries_account ON acc_ledger_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_acc_ledger_entries_date ON acc_ledger_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_acc_ledger_entries_tenant ON acc_ledger_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_acc_ledger_entries_period ON acc_ledger_entries(fiscal_period_id);
