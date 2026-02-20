-- Accounts Receivable schema
-- Extracted from db/migrations/014_accounting_full.sql + 017_accounting_phase2_3.sql

CREATE TABLE IF NOT EXISTS acc_customer_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    invoice_number VARCHAR(50) NOT NULL,
    customer_id UUID,
    customer_name VARCHAR(200),
    invoice_date DATE NOT NULL,
    due_date DATE NOT NULL,
    subtotal DECIMAL(18,2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(18,2) DEFAULT 0,
    discount_amount DECIMAL(18,2) DEFAULT 0,
    total_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
    amount_paid DECIMAL(18,2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'INR',
    exchange_rate DECIMAL(18,6) DEFAULT 1,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'partial', 'overdue', 'cancelled', 'written_off')),
    irn VARCHAR(100),
    irn_date TIMESTAMPTZ,
    ack_number VARCHAR(50),
    qr_code TEXT,
    e_invoice_status VARCHAR(20),
    receivable_account_id UUID REFERENCES acc_accounts(id),
    revenue_account_id UUID REFERENCES acc_accounts(id),
    journal_entry_id UUID REFERENCES acc_journal_entries(id),
    source_type VARCHAR(50),
    source_id UUID,
    notes TEXT,
    terms TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_acc_customer_invoices_tenant ON acc_customer_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_acc_customer_invoices_customer ON acc_customer_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_acc_customer_invoices_status ON acc_customer_invoices(status);
CREATE INDEX IF NOT EXISTS idx_acc_customer_invoices_due ON acc_customer_invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_acc_customer_invoices_irn ON acc_customer_invoices(irn);

CREATE TABLE IF NOT EXISTS acc_customer_invoice_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    invoice_id UUID NOT NULL REFERENCES acc_customer_invoices(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    description TEXT NOT NULL,
    account_id UUID REFERENCES acc_accounts(id),
    hsn_sac_code VARCHAR(20),
    quantity DECIMAL(18,4) DEFAULT 1,
    unit_price DECIMAL(18,4) NOT NULL,
    amount DECIMAL(18,2) NOT NULL,
    tax_code VARCHAR(20),
    tax_rate DECIMAL(5,2) DEFAULT 0,
    cgst_amount DECIMAL(18,2) DEFAULT 0,
    sgst_amount DECIMAL(18,2) DEFAULT 0,
    igst_amount DECIMAL(18,2) DEFAULT 0,
    cess_amount DECIMAL(18,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(invoice_id, line_number)
);

CREATE TABLE IF NOT EXISTS acc_customer_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    receipt_number VARCHAR(50) NOT NULL,
    invoice_id UUID REFERENCES acc_customer_invoices(id),
    customer_id UUID,
    receipt_date DATE NOT NULL,
    amount DECIMAL(18,2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    bank_account_id UUID REFERENCES acc_accounts(id),
    reference VARCHAR(200),
    cheque_number VARCHAR(50),
    transaction_ref VARCHAR(200),
    tcs_amount DECIMAL(18,2) DEFAULT 0,
    tcs_rate DECIMAL(5,2) DEFAULT 0,
    journal_entry_id UUID REFERENCES acc_journal_entries(id),
    status VARCHAR(20) DEFAULT 'completed',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, receipt_number)
);

CREATE INDEX IF NOT EXISTS idx_acc_customer_receipts_invoice ON acc_customer_receipts(invoice_id);
CREATE INDEX IF NOT EXISTS idx_acc_customer_receipts_customer ON acc_customer_receipts(customer_id);

-- Credit Notes (from 017)
CREATE TABLE IF NOT EXISTS acc_credit_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    credit_note_number VARCHAR(50) NOT NULL,
    customer_id UUID,
    original_invoice_id UUID,
    credit_note_date DATE NOT NULL,
    reason VARCHAR(200) DEFAULT 'return',
    reason_detail TEXT,
    subtotal DECIMAL(18,2) DEFAULT 0,
    cgst_amount DECIMAL(18,2) DEFAULT 0,
    sgst_amount DECIMAL(18,2) DEFAULT 0,
    igst_amount DECIMAL(18,2) DEFAULT 0,
    total_tax DECIMAL(18,2) DEFAULT 0,
    total_amount DECIMAL(18,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','posted','applied','void')),
    applied_to_invoice_id UUID,
    journal_entry_id UUID,
    hsn_summary TEXT,
    notes TEXT,
    company_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, credit_note_number)
);

CREATE INDEX IF NOT EXISTS idx_acc_credit_notes_customer ON acc_credit_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_acc_credit_notes_status ON acc_credit_notes(status);

CREATE TABLE IF NOT EXISTS acc_credit_note_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    credit_note_id UUID NOT NULL REFERENCES acc_credit_notes(id) ON DELETE CASCADE,
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

-- Customers (from 017)
CREATE TABLE IF NOT EXISTS acc_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    contact_person VARCHAR(200),
    email VARCHAR(200),
    phone VARCHAR(50),
    address_line1 VARCHAR(200),
    address_line2 VARCHAR(200),
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'India',
    gstin VARCHAR(20),
    pan VARCHAR(20),
    payment_terms INT DEFAULT 30,
    credit_limit DECIMAL(18,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    company_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

-- Extended invoices (from 017)
CREATE TABLE IF NOT EXISTS acc_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    invoice_number VARCHAR(50) NOT NULL,
    customer_id UUID,
    invoice_date DATE NOT NULL,
    due_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','sent','partial','paid','overdue','void')),
    subtotal DECIMAL(18,2) DEFAULT 0,
    tax_amount DECIMAL(18,2) DEFAULT 0,
    total_amount DECIMAL(18,2) DEFAULT 0,
    balance_due DECIMAL(18,2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'INR',
    notes TEXT,
    journal_entry_id UUID,
    irn VARCHAR(100),
    irn_date DATE,
    signed_qr TEXT,
    ack_number VARCHAR(50),
    einvoice_status VARCHAR(20) DEFAULT 'none',
    einvoice_json JSONB,
    is_interstate BOOLEAN DEFAULT false,
    place_of_supply VARCHAR(10),
    company_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS acc_invoice_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    invoice_id UUID NOT NULL REFERENCES acc_invoices(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    account_id UUID NOT NULL,
    description TEXT,
    quantity DECIMAL(18,4) DEFAULT 1,
    unit_price DECIMAL(18,2) DEFAULT 0,
    amount DECIMAL(18,2) DEFAULT 0,
    tax_code_id UUID,
    tax_amount DECIMAL(18,2) DEFAULT 0,
    hsn_sac_code VARCHAR(20),
    cgst_amount DECIMAL(18,2) DEFAULT 0,
    sgst_amount DECIMAL(18,2) DEFAULT 0,
    igst_amount DECIMAL(18,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acc_invoice_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    invoice_id UUID NOT NULL REFERENCES acc_invoices(id) ON DELETE CASCADE,
    payment_date DATE NOT NULL,
    amount DECIMAL(18,2) NOT NULL,
    payment_method VARCHAR(50) DEFAULT 'bank_transfer',
    reference VARCHAR(200),
    journal_entry_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- E-Invoicing settings (from 017)
CREATE TABLE IF NOT EXISTS acc_einvoice_settings (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
    tenant_id UUID NOT NULL,
    mode VARCHAR(10) DEFAULT 'manual' CHECK (mode IN ('manual','api')),
    gsp_provider VARCHAR(100),
    gsp_username VARCHAR(200),
    gsp_password_enc TEXT,
    api_base_url VARCHAR(500),
    auth_token TEXT,
    token_expires_at TIMESTAMPTZ,
    enabled BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id)
);

-- E-Way Bills (from 017)
CREATE TABLE IF NOT EXISTS acc_ewaybills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    invoice_id UUID,
    bill_id UUID,
    ewb_number VARCHAR(50),
    ewb_date DATE,
    valid_until DATE,
    from_place VARCHAR(200),
    from_state VARCHAR(100),
    from_pincode VARCHAR(10),
    to_place VARCHAR(200),
    to_state VARCHAR(100),
    to_pincode VARCHAR(10),
    vehicle_number VARCHAR(20),
    vehicle_type VARCHAR(2) DEFAULT 'R' CHECK (vehicle_type IN ('R','S')),
    transporter_id VARCHAR(50),
    transporter_name VARCHAR(200),
    transport_mode VARCHAR(2) DEFAULT '1' CHECK (transport_mode IN ('1','2','3','4')),
    distance_km INT DEFAULT 0,
    supply_type VARCHAR(2) DEFAULT 'O' CHECK (supply_type IN ('O','I')),
    sub_supply_type VARCHAR(10),
    doc_type VARCHAR(10) DEFAULT 'INV',
    doc_number VARCHAR(100),
    doc_date DATE,
    total_value DECIMAL(18,2) DEFAULT 0,
    cgst_amount DECIMAL(18,2) DEFAULT 0,
    sgst_amount DECIMAL(18,2) DEFAULT 0,
    igst_amount DECIMAL(18,2) DEFAULT 0,
    cess_amount DECIMAL(18,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','generated','active','cancelled','expired')),
    json_payload JSONB,
    cancel_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payment Links (from 017)
CREATE TABLE IF NOT EXISTS acc_payment_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    invoice_id UUID,
    gateway VARCHAR(20) NOT NULL CHECK (gateway IN ('razorpay','stripe','upi')),
    amount DECIMAL(18,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'INR',
    payment_link_url TEXT,
    short_url TEXT,
    status VARCHAR(20) DEFAULT 'created' CHECK (status IN ('created','sent','paid','expired','cancelled')),
    gateway_order_id VARCHAR(200),
    gateway_payment_id VARCHAR(200),
    paid_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
