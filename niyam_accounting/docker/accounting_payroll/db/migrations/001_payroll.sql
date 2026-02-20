-- Payroll schema
-- Extracted from db/migrations/017_accounting_phase2_3.sql

CREATE TABLE IF NOT EXISTS acc_salary_structures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(200) NOT NULL,
    basic_pct DECIMAL(5,2) DEFAULT 50,
    hra_pct DECIMAL(5,2) DEFAULT 20,
    da_pct DECIMAL(5,2) DEFAULT 10,
    special_allowance DECIMAL(18,2) DEFAULT 0,
    pf_employer_pct DECIMAL(5,2) DEFAULT 12,
    esi_employer_pct DECIMAL(5,2) DEFAULT 3.25,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acc_employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    emp_code VARCHAR(50),
    name VARCHAR(200) NOT NULL,
    department VARCHAR(100),
    designation VARCHAR(100),
    date_of_joining DATE,
    pan VARCHAR(20),
    uan VARCHAR(30),
    esi_number VARCHAR(30),
    bank_account VARCHAR(50),
    bank_ifsc VARCHAR(20),
    salary_structure_id UUID,
    gross_salary DECIMAL(18,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    company_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, emp_code)
);

CREATE TABLE IF NOT EXISTS acc_payroll_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    run_number VARCHAR(50),
    period_month INT,
    period_year INT,
    status VARCHAR(20) DEFAULT 'draft',
    total_gross DECIMAL(18,2) DEFAULT 0,
    total_deductions DECIMAL(18,2) DEFAULT 0,
    total_net DECIMAL(18,2) DEFAULT 0,
    processed_by UUID,
    processed_at TIMESTAMPTZ,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    journal_entry_id UUID,
    company_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, run_number)
);

CREATE TABLE IF NOT EXISTS acc_payslips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    run_id UUID NOT NULL REFERENCES acc_payroll_runs(id),
    employee_id UUID NOT NULL,
    basic DECIMAL(18,2) DEFAULT 0,
    hra DECIMAL(18,2) DEFAULT 0,
    da DECIMAL(18,2) DEFAULT 0,
    special DECIMAL(18,2) DEFAULT 0,
    gross DECIMAL(18,2) DEFAULT 0,
    pf_employee DECIMAL(18,2) DEFAULT 0,
    pf_employer DECIMAL(18,2) DEFAULT 0,
    esi_employee DECIMAL(18,2) DEFAULT 0,
    esi_employer DECIMAL(18,2) DEFAULT 0,
    pt DECIMAL(18,2) DEFAULT 0,
    tds DECIMAL(18,2) DEFAULT 0,
    other_deductions DECIMAL(18,2) DEFAULT 0,
    net_pay DECIMAL(18,2) DEFAULT 0,
    journal_entry_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acc_payslip_run ON acc_payslips(run_id);
CREATE INDEX IF NOT EXISTS idx_acc_payslip_employee ON acc_payslips(employee_id);

CREATE TABLE IF NOT EXISTS acc_payroll_settings (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
    tenant_id UUID NOT NULL,
    pf_rate_employee DECIMAL(5,2) DEFAULT 12,
    pf_rate_employer DECIMAL(5,2) DEFAULT 12,
    pf_wage_ceiling DECIMAL(18,2) DEFAULT 15000,
    esi_rate_employee DECIMAL(5,2) DEFAULT 0.75,
    esi_rate_employer DECIMAL(5,2) DEFAULT 3.25,
    esi_wage_ceiling DECIMAL(18,2) DEFAULT 21000,
    pt_slabs JSONB,
    tds_slabs JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id)
);
