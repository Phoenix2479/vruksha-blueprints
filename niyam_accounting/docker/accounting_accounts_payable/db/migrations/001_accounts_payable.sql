-- Accounts Payable schema
-- Extracted from db/migrations/014_accounting_full.sql + 017_accounting_phase2_3.sql

CREATE TABLE IF NOT EXISTS acc_vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    vendor_code VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    legal_name VARCHAR(200),
    email VARCHAR(200),
    phone VARCHAR(50),
    website VARCHAR(200),
    address_line1 VARCHAR(200),
    address_line2 VARCHAR(200),
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'India',
    gstin VARCHAR(20),
    pan VARCHAR(20),
    tax_registration_number VARCHAR(50),
    payment_terms_days INT DEFAULT 30,
    credit_limit DECIMAL(18,2),
    default_expense_account_id UUID REFERENCES acc_accounts(id),
    default_payable_account_id UUID REFERENCES acc_accounts(id),
    currency VARCHAR(3) DEFAULT 'INR',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, vendor_code)
);

CREATE INDEX IF NOT EXISTS idx_acc_vendors_tenant ON acc_vendors(tenant_id);
CREATE INDEX IF NOT EXISTS idx_acc_vendors_gstin ON acc_vendors(gstin);

CREATE TABLE IF NOT EXISTS acc_bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    bill_number VARCHAR(50) NOT NULL,
    vendor_id UUID NOT NULL REFERENCES acc_vendors(id),
    bill_date DATE NOT NULL,
    due_date DATE NOT NULL,
    received_date DATE,
    vendor_invoice_number VARCHAR(100),
    vendor_invoice_date DATE,
    subtotal DECIMAL(18,2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(18,2) DEFAULT 0,
    discount_amount DECIMAL(18,2) DEFAULT 0,
    total_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
    amount_paid DECIMAL(18,2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'INR',
    exchange_rate DECIMAL(18,6) DEFAULT 1,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'paid', 'partial', 'overdue', 'cancelled')),
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    payable_account_id UUID REFERENCES acc_accounts(id),
    journal_entry_id UUID REFERENCES acc_journal_entries(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, bill_number)
);

CREATE INDEX IF NOT EXISTS idx_acc_bills_vendor ON acc_bills(vendor_id);
CREATE INDEX IF NOT EXISTS idx_acc_bills_tenant ON acc_bills(tenant_id);
CREATE INDEX IF NOT EXISTS idx_acc_bills_status ON acc_bills(status);
CREATE INDEX IF NOT EXISTS idx_acc_bills_due_date ON acc_bills(due_date);

CREATE TABLE IF NOT EXISTS acc_bill_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    bill_id UUID NOT NULL REFERENCES acc_bills(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    description TEXT NOT NULL,
    account_id UUID REFERENCES acc_accounts(id),
    quantity DECIMAL(18,4) DEFAULT 1,
    unit_price DECIMAL(18,4) NOT NULL,
    amount DECIMAL(18,2) NOT NULL,
    tax_code VARCHAR(20),
    tax_rate DECIMAL(5,2) DEFAULT 0,
    tax_amount DECIMAL(18,2) DEFAULT 0,
    cost_center_id UUID,
    project_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(bill_id, line_number)
);

CREATE TABLE IF NOT EXISTS acc_bill_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    payment_number VARCHAR(50) NOT NULL,
    bill_id UUID NOT NULL REFERENCES acc_bills(id),
    vendor_id UUID NOT NULL REFERENCES acc_vendors(id),
    payment_date DATE NOT NULL,
    amount DECIMAL(18,2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    bank_account_id UUID REFERENCES acc_accounts(id),
    reference VARCHAR(200),
    cheque_number VARCHAR(50),
    transaction_ref VARCHAR(200),
    tds_amount DECIMAL(18,2) DEFAULT 0,
    tds_rate DECIMAL(5,2) DEFAULT 0,
    tds_section VARCHAR(20),
    journal_entry_id UUID REFERENCES acc_journal_entries(id),
    status VARCHAR(20) DEFAULT 'completed',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, payment_number)
);

CREATE INDEX IF NOT EXISTS idx_acc_bill_payments_bill ON acc_bill_payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_acc_bill_payments_vendor ON acc_bill_payments(vendor_id);

-- Debit Notes (from 017)
CREATE TABLE IF NOT EXISTS acc_debit_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    debit_note_number VARCHAR(50) NOT NULL,
    vendor_id UUID,
    original_bill_id UUID,
    debit_note_date DATE NOT NULL,
    reason VARCHAR(200) DEFAULT 'return',
    reason_detail TEXT,
    subtotal DECIMAL(18,2) DEFAULT 0,
    cgst_amount DECIMAL(18,2) DEFAULT 0,
    sgst_amount DECIMAL(18,2) DEFAULT 0,
    igst_amount DECIMAL(18,2) DEFAULT 0,
    total_tax DECIMAL(18,2) DEFAULT 0,
    total_amount DECIMAL(18,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','posted','applied','void')),
    applied_to_bill_id UUID,
    journal_entry_id UUID,
    hsn_summary TEXT,
    notes TEXT,
    company_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, debit_note_number)
);

CREATE INDEX IF NOT EXISTS idx_acc_debit_notes_vendor ON acc_debit_notes(vendor_id);
CREATE INDEX IF NOT EXISTS idx_acc_debit_notes_status ON acc_debit_notes(status);

CREATE TABLE IF NOT EXISTS acc_debit_note_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    debit_note_id UUID NOT NULL REFERENCES acc_debit_notes(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    account_id UUID NOT NULL,
    description TEXT,
    hsn_code VARCHAR(20),
    quantity DECIMAL(18,4) DEFAULT 1,
    unit_price DECIMAL(18,2) DEFAULT 0,
    amount DECIMAL(18,2) DEFAULT 0,
    tax_code_id UUID,
    cgst_amount DECIMAL(18,2) DEFAULT 0,
    sgst_amount DECIMAL(18,2) DEFAULT 0,
    igst_amount DECIMAL(18,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
