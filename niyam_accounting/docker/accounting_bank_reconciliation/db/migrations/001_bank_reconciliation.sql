-- Bank Reconciliation schema
-- Extracted from db/migrations/014_accounting_full.sql + 017_accounting_phase2_3.sql

CREATE TABLE IF NOT EXISTS acc_bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    account_id UUID NOT NULL REFERENCES acc_accounts(id),
    bank_name VARCHAR(200) NOT NULL,
    branch_name VARCHAR(200),
    account_number VARCHAR(50) NOT NULL,
    ifsc_code VARCHAR(20),
    swift_code VARCHAR(20),
    account_type VARCHAR(50) DEFAULT 'current',
    currency VARCHAR(3) DEFAULT 'INR',
    book_balance DECIMAL(18,2) DEFAULT 0,
    last_reconciled_date DATE,
    last_reconciled_balance DECIMAL(18,2),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, account_number)
);

CREATE TABLE IF NOT EXISTS acc_bank_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    bank_account_id UUID NOT NULL REFERENCES acc_bank_accounts(id),
    transaction_date DATE NOT NULL,
    value_date DATE,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('debit', 'credit')),
    amount DECIMAL(18,2) NOT NULL,
    description TEXT,
    reference VARCHAR(200),
    cheque_number VARCHAR(50),
    running_balance DECIMAL(18,2),
    is_reconciled BOOLEAN DEFAULT false,
    reconciled_at TIMESTAMPTZ,
    reconciled_by UUID,
    matched_journal_line_id UUID REFERENCES acc_journal_lines(id),
    import_batch_id UUID,
    raw_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acc_bank_transactions_bank ON acc_bank_transactions(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_acc_bank_transactions_date ON acc_bank_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_acc_bank_transactions_reconciled ON acc_bank_transactions(is_reconciled);

CREATE TABLE IF NOT EXISTS acc_bank_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    bank_account_id UUID NOT NULL REFERENCES acc_bank_accounts(id),
    statement_date DATE NOT NULL,
    statement_balance DECIMAL(18,2) NOT NULL,
    book_balance DECIMAL(18,2) NOT NULL,
    uncleared_deposits DECIMAL(18,2) DEFAULT 0,
    uncleared_payments DECIMAL(18,2) DEFAULT 0,
    bank_charges DECIMAL(18,2) DEFAULT 0,
    bank_interest DECIMAL(18,2) DEFAULT 0,
    adjusted_bank_balance DECIMAL(18,2),
    difference DECIMAL(18,2),
    status VARCHAR(20) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'approved')),
    completed_at TIMESTAMPTZ,
    completed_by UUID,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bank Statement Imports (from 017)
CREATE TABLE IF NOT EXISTS acc_bank_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    bank_account_id UUID,
    file_name VARCHAR(200) NOT NULL,
    file_format VARCHAR(10) NOT NULL CHECK (file_format IN ('csv','ofx','mt940')),
    total_records INT DEFAULT 0,
    imported_records INT DEFAULT 0,
    skipped_records INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','preview','imported','failed')),
    column_mapping JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
