-- Fiscal Periods schema
-- Extracted from db/migrations/014_accounting_full.sql

CREATE TABLE IF NOT EXISTS acc_fiscal_years (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'closed', 'locked')),
    is_current BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

CREATE TABLE IF NOT EXISTS acc_fiscal_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    fiscal_year_id UUID REFERENCES acc_fiscal_years(id),
    period_number INT NOT NULL,
    name VARCHAR(50) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'closed', 'locked')),
    is_adjustment_period BOOLEAN DEFAULT false,
    period_type VARCHAR(20) DEFAULT 'month',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, fiscal_year_id, period_number)
);

CREATE INDEX IF NOT EXISTS idx_acc_fiscal_periods_tenant ON acc_fiscal_periods(tenant_id);
CREATE INDEX IF NOT EXISTS idx_acc_fiscal_periods_dates ON acc_fiscal_periods(start_date, end_date);

-- Seed default fiscal year
INSERT INTO acc_fiscal_years (tenant_id, name, start_date, end_date, is_current) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'FY 2025-26', '2025-04-01', '2026-03-31', true)
ON CONFLICT DO NOTHING;

-- Create fiscal periods for FY 2025-26
DO $$
DECLARE
    v_tenant_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    v_fy_id UUID;
    v_month_names TEXT[] := ARRAY['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
    v_start_dates DATE[] := ARRAY['2025-04-01', '2025-05-01', '2025-06-01', '2025-07-01', '2025-08-01', '2025-09-01', '2025-10-01', '2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01', '2026-03-01']::DATE[];
    v_end_dates DATE[] := ARRAY['2025-04-30', '2025-05-31', '2025-06-30', '2025-07-31', '2025-08-31', '2025-09-30', '2025-10-31', '2025-11-30', '2025-12-31', '2026-01-31', '2026-02-28', '2026-03-31']::DATE[];
    i INT;
BEGIN
    SELECT id INTO v_fy_id FROM acc_fiscal_years WHERE tenant_id = v_tenant_id AND name = 'FY 2025-26';
    IF v_fy_id IS NOT NULL THEN
        FOR i IN 1..12 LOOP
            INSERT INTO acc_fiscal_periods (tenant_id, fiscal_year_id, period_number, name, start_date, end_date)
            VALUES (v_tenant_id, v_fy_id, i, v_month_names[i] || ' 2025', v_start_dates[i], v_end_dates[i])
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;
END $$;
