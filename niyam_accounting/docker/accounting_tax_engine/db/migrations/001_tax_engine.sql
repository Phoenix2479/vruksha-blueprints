-- Tax Engine schema (GST/TDS/TCS)
-- Extracted from db/migrations/014_accounting_full.sql + 017_accounting_phase2_3.sql

CREATE TABLE IF NOT EXISTS acc_tax_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    tax_type VARCHAR(20) NOT NULL CHECK (tax_type IN ('gst', 'igst', 'vat', 'service_tax', 'cess', 'tds', 'tcs', 'other')),
    rate DECIMAL(5,2) NOT NULL,
    cgst_rate DECIMAL(5,2) DEFAULT 0,
    sgst_rate DECIMAL(5,2) DEFAULT 0,
    igst_rate DECIMAL(5,2) DEFAULT 0,
    cess_rate DECIMAL(5,2) DEFAULT 0,
    tax_payable_account_id UUID REFERENCES acc_accounts(id),
    tax_receivable_account_id UUID REFERENCES acc_accounts(id),
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    effective_from DATE,
    effective_to DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE TABLE IF NOT EXISTS acc_gst_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    return_type VARCHAR(20) NOT NULL CHECK (return_type IN ('GSTR1', 'GSTR3B', 'GSTR9', 'GSTR2A', 'GSTR2B')),
    return_period VARCHAR(10) NOT NULL,
    total_taxable_value DECIMAL(18,2) DEFAULT 0,
    total_igst DECIMAL(18,2) DEFAULT 0,
    total_cgst DECIMAL(18,2) DEFAULT 0,
    total_sgst DECIMAL(18,2) DEFAULT 0,
    total_cess DECIMAL(18,2) DEFAULT 0,
    itc_igst DECIMAL(18,2) DEFAULT 0,
    itc_cgst DECIMAL(18,2) DEFAULT 0,
    itc_sgst DECIMAL(18,2) DEFAULT 0,
    itc_cess DECIMAL(18,2) DEFAULT 0,
    net_tax_payable DECIMAL(18,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'filed', 'accepted', 'rejected')),
    filed_at TIMESTAMPTZ,
    arn VARCHAR(50),
    data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, return_type, return_period)
);

CREATE TABLE IF NOT EXISTS acc_tds_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    transaction_type VARCHAR(10) NOT NULL CHECK (transaction_type IN ('TDS', 'TCS')),
    party_type VARCHAR(20) NOT NULL CHECK (party_type IN ('vendor', 'customer')),
    party_id UUID,
    party_name VARCHAR(200),
    party_pan VARCHAR(20),
    section VARCHAR(20) NOT NULL,
    base_amount DECIMAL(18,2) NOT NULL,
    rate DECIMAL(5,2) NOT NULL,
    tax_amount DECIMAL(18,2) NOT NULL,
    source_type VARCHAR(50),
    source_id UUID,
    transaction_date DATE NOT NULL,
    due_date DATE,
    challan_number VARCHAR(50),
    challan_date DATE,
    deposited_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'deposited', 'filed')),
    journal_entry_id UUID REFERENCES acc_journal_entries(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acc_tds_transactions_party ON acc_tds_transactions(party_id);
CREATE INDEX IF NOT EXISTS idx_acc_tds_transactions_date ON acc_tds_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_acc_tds_transactions_status ON acc_tds_transactions(status);

-- Tax Transactions (from 017)
CREATE TABLE IF NOT EXISTS acc_tax_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    tax_code_id UUID,
    journal_entry_id UUID,
    transaction_date DATE NOT NULL,
    taxable_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
    cgst_amount DECIMAL(18,2) DEFAULT 0,
    sgst_amount DECIMAL(18,2) DEFAULT 0,
    igst_amount DECIMAL(18,2) DEFAULT 0,
    cess_amount DECIMAL(18,2) DEFAULT 0,
    tax_direction VARCHAR(10) CHECK (tax_direction IN ('input','output')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acc_tax_txn_date ON acc_tax_transactions(transaction_date);

-- Seed default Indian GST tax codes
INSERT INTO acc_tax_codes (tenant_id, code, name, tax_type, rate, cgst_rate, sgst_rate, igst_rate, is_default) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'GST0', 'GST 0% (Exempt)', 'gst', 0, 0, 0, 0, false),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'GST5', 'GST 5%', 'gst', 5, 2.5, 2.5, 5, false),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'GST12', 'GST 12%', 'gst', 12, 6, 6, 12, false),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'GST18', 'GST 18%', 'gst', 18, 9, 9, 18, true),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'GST28', 'GST 28%', 'gst', 28, 14, 14, 28, false)
ON CONFLICT DO NOTHING;
