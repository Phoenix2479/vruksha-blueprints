-- Chart of Accounts schema
-- Extracted from db/migrations/014_accounting_full.sql

CREATE TABLE IF NOT EXISTS acc_account_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
    normal_balance VARCHAR(10) NOT NULL CHECK (normal_balance IN ('debit', 'credit')),
    description TEXT,
    display_order INT DEFAULT 0,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE TABLE IF NOT EXISTS acc_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    account_code VARCHAR(20) NOT NULL,
    account_name VARCHAR(200) NOT NULL,
    account_type_id UUID REFERENCES acc_account_types(id),
    parent_account_id UUID REFERENCES acc_accounts(id),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    is_system BOOLEAN DEFAULT false,
    is_header BOOLEAN DEFAULT false,
    is_bank_account BOOLEAN DEFAULT false,
    is_control_account BOOLEAN DEFAULT false,
    currency VARCHAR(3) DEFAULT 'INR',
    default_tax_code VARCHAR(20),
    is_tax_applicable BOOLEAN DEFAULT true,
    opening_balance DECIMAL(18,2) DEFAULT 0,
    opening_balance_date DATE,
    current_balance DECIMAL(18,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    UNIQUE(tenant_id, account_code)
);

CREATE INDEX IF NOT EXISTS idx_acc_accounts_tenant ON acc_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_acc_accounts_type ON acc_accounts(account_type_id);
CREATE INDEX IF NOT EXISTS idx_acc_accounts_parent ON acc_accounts(parent_account_id);
CREATE INDEX IF NOT EXISTS idx_acc_accounts_code ON acc_accounts(tenant_id, account_code);

-- Seed default account types
INSERT INTO acc_account_types (tenant_id, code, name, category, normal_balance, display_order, is_system) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ASSET', 'Assets', 'asset', 'debit', 1, true),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'LIABILITY', 'Liabilities', 'liability', 'credit', 2, true),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EQUITY', 'Equity', 'equity', 'credit', 3, true),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'REVENUE', 'Revenue', 'revenue', 'credit', 4, true),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EXPENSE', 'Expenses', 'expense', 'debit', 5, true)
ON CONFLICT DO NOTHING;

-- Seed default chart of accounts (Standard Indian)
DO $$
DECLARE
    v_tenant_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    v_asset_type_id UUID;
    v_liability_type_id UUID;
    v_equity_type_id UUID;
    v_revenue_type_id UUID;
    v_expense_type_id UUID;
BEGIN
    SELECT id INTO v_asset_type_id FROM acc_account_types WHERE tenant_id = v_tenant_id AND code = 'ASSET';
    SELECT id INTO v_liability_type_id FROM acc_account_types WHERE tenant_id = v_tenant_id AND code = 'LIABILITY';
    SELECT id INTO v_equity_type_id FROM acc_account_types WHERE tenant_id = v_tenant_id AND code = 'EQUITY';
    SELECT id INTO v_revenue_type_id FROM acc_account_types WHERE tenant_id = v_tenant_id AND code = 'REVENUE';
    SELECT id INTO v_expense_type_id FROM acc_account_types WHERE tenant_id = v_tenant_id AND code = 'EXPENSE';

    INSERT INTO acc_accounts (tenant_id, account_code, account_name, account_type_id, is_header, is_system) VALUES
    (v_tenant_id, '1000', 'Current Assets', v_asset_type_id, true, true),
    (v_tenant_id, '1100', 'Cash and Bank', v_asset_type_id, true, true),
    (v_tenant_id, '1101', 'Cash in Hand', v_asset_type_id, false, true),
    (v_tenant_id, '1102', 'Petty Cash', v_asset_type_id, false, true),
    (v_tenant_id, '1110', 'Bank Accounts', v_asset_type_id, true, true),
    (v_tenant_id, '1111', 'Primary Bank Account', v_asset_type_id, false, true),
    (v_tenant_id, '1200', 'Accounts Receivable', v_asset_type_id, true, true),
    (v_tenant_id, '1201', 'Trade Receivables', v_asset_type_id, false, true),
    (v_tenant_id, '1300', 'Inventory', v_asset_type_id, true, true),
    (v_tenant_id, '1301', 'Stock in Trade', v_asset_type_id, false, true),
    (v_tenant_id, '1400', 'Prepaid Expenses', v_asset_type_id, false, true),
    (v_tenant_id, '1500', 'Input GST', v_asset_type_id, true, true),
    (v_tenant_id, '1501', 'Input CGST', v_asset_type_id, false, true),
    (v_tenant_id, '1502', 'Input SGST', v_asset_type_id, false, true),
    (v_tenant_id, '1503', 'Input IGST', v_asset_type_id, false, true),
    (v_tenant_id, '1600', 'TDS Receivable', v_asset_type_id, false, true),
    (v_tenant_id, '2000', 'Fixed Assets', v_asset_type_id, true, true),
    (v_tenant_id, '2100', 'Property, Plant & Equipment', v_asset_type_id, false, true),
    (v_tenant_id, '2200', 'Accumulated Depreciation', v_asset_type_id, false, true)
    ON CONFLICT DO NOTHING;

    INSERT INTO acc_accounts (tenant_id, account_code, account_name, account_type_id, is_header, is_system) VALUES
    (v_tenant_id, '3000', 'Current Liabilities', v_liability_type_id, true, true),
    (v_tenant_id, '3100', 'Accounts Payable', v_liability_type_id, true, true),
    (v_tenant_id, '3101', 'Trade Payables', v_liability_type_id, false, true),
    (v_tenant_id, '3200', 'Output GST', v_liability_type_id, true, true),
    (v_tenant_id, '3201', 'Output CGST Payable', v_liability_type_id, false, true),
    (v_tenant_id, '3202', 'Output SGST Payable', v_liability_type_id, false, true),
    (v_tenant_id, '3203', 'Output IGST Payable', v_liability_type_id, false, true),
    (v_tenant_id, '3300', 'TDS Payable', v_liability_type_id, false, true),
    (v_tenant_id, '3400', 'TCS Payable', v_liability_type_id, false, true),
    (v_tenant_id, '3500', 'Accrued Expenses', v_liability_type_id, false, true),
    (v_tenant_id, '3600', 'Unearned Revenue', v_liability_type_id, false, true),
    (v_tenant_id, '4000', 'Long-term Liabilities', v_liability_type_id, true, true),
    (v_tenant_id, '4100', 'Long-term Loans', v_liability_type_id, false, true)
    ON CONFLICT DO NOTHING;

    INSERT INTO acc_accounts (tenant_id, account_code, account_name, account_type_id, is_header, is_system) VALUES
    (v_tenant_id, '5000', 'Owner''s Equity', v_equity_type_id, true, true),
    (v_tenant_id, '5100', 'Capital Account', v_equity_type_id, false, true),
    (v_tenant_id, '5200', 'Retained Earnings', v_equity_type_id, false, true),
    (v_tenant_id, '5300', 'Current Year Earnings', v_equity_type_id, false, true),
    (v_tenant_id, '5400', 'Drawings', v_equity_type_id, false, true)
    ON CONFLICT DO NOTHING;

    INSERT INTO acc_accounts (tenant_id, account_code, account_name, account_type_id, is_header, is_system) VALUES
    (v_tenant_id, '6000', 'Operating Revenue', v_revenue_type_id, true, true),
    (v_tenant_id, '6100', 'Sales Revenue', v_revenue_type_id, false, true),
    (v_tenant_id, '6200', 'Service Revenue', v_revenue_type_id, false, true),
    (v_tenant_id, '6300', 'Room Revenue', v_revenue_type_id, false, true),
    (v_tenant_id, '6400', 'Food & Beverage Revenue', v_revenue_type_id, false, true),
    (v_tenant_id, '6500', 'Sales Returns & Allowances', v_revenue_type_id, false, true),
    (v_tenant_id, '6600', 'Sales Discounts', v_revenue_type_id, false, true),
    (v_tenant_id, '7000', 'Other Income', v_revenue_type_id, true, true),
    (v_tenant_id, '7100', 'Interest Income', v_revenue_type_id, false, true),
    (v_tenant_id, '7200', 'Miscellaneous Income', v_revenue_type_id, false, true)
    ON CONFLICT DO NOTHING;

    INSERT INTO acc_accounts (tenant_id, account_code, account_name, account_type_id, is_header, is_system) VALUES
    (v_tenant_id, '8000', 'Cost of Goods Sold', v_expense_type_id, true, true),
    (v_tenant_id, '8100', 'Purchases', v_expense_type_id, false, true),
    (v_tenant_id, '8200', 'Purchase Returns', v_expense_type_id, false, true),
    (v_tenant_id, '8300', 'Direct Costs', v_expense_type_id, false, true),
    (v_tenant_id, '9000', 'Operating Expenses', v_expense_type_id, true, true),
    (v_tenant_id, '9100', 'Salaries & Wages', v_expense_type_id, false, true),
    (v_tenant_id, '9200', 'Rent Expense', v_expense_type_id, false, true),
    (v_tenant_id, '9300', 'Utilities', v_expense_type_id, false, true),
    (v_tenant_id, '9400', 'Insurance', v_expense_type_id, false, true),
    (v_tenant_id, '9500', 'Depreciation Expense', v_expense_type_id, false, true),
    (v_tenant_id, '9600', 'Office Supplies', v_expense_type_id, false, true),
    (v_tenant_id, '9700', 'Professional Fees', v_expense_type_id, false, true),
    (v_tenant_id, '9800', 'Bank Charges', v_expense_type_id, false, true),
    (v_tenant_id, '9900', 'Miscellaneous Expenses', v_expense_type_id, false, true)
    ON CONFLICT DO NOTHING;
END $$;
