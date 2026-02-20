-- Financial Reports & Audit schema
-- Extracted from db/migrations/014_accounting_full.sql + 017_accounting_phase2_3.sql

CREATE TABLE IF NOT EXISTS acc_cost_centers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    parent_id UUID REFERENCES acc_cost_centers(id),
    manager_id UUID,
    budget DECIMAL(18,2),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE TABLE IF NOT EXISTS acc_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    old_data JSONB,
    new_data JSONB,
    user_id UUID,
    user_name VARCHAR(200),
    ip_address VARCHAR(50),
    user_agent TEXT,
    table_name VARCHAR(100),
    record_id VARCHAR(100),
    old_values JSONB,
    new_values JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acc_audit_log_entity ON acc_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_acc_audit_log_tenant ON acc_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_acc_audit_log_date ON acc_audit_log(created_at);

-- Audit Settings (from 017)
CREATE TABLE IF NOT EXISTS acc_audit_settings (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
    tenant_id UUID NOT NULL,
    retention_days INT DEFAULT 1095,
    enabled BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Saved Reports (from 017)
CREATE TABLE IF NOT EXISTS acc_saved_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    query_config JSONB,
    columns JSONB,
    filters JSONB,
    created_by UUID,
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acc_report_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    report_id UUID NOT NULL REFERENCES acc_saved_reports(id),
    frequency VARCHAR(20) DEFAULT 'monthly',
    recipients JSONB,
    last_run TIMESTAMPTZ,
    next_run TIMESTAMPTZ,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Approval workflows (from 017)
CREATE TABLE IF NOT EXISTS acc_approval_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    min_amount DECIMAL(18,2) DEFAULT 0,
    max_amount DECIMAL(18,2),
    approver_role VARCHAR(50) NOT NULL,
    sequence INT DEFAULT 1,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acc_approval_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    actor_id UUID,
    actor_name VARCHAR(200),
    comments TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acc_approval_entity ON acc_approval_history(entity_type, entity_id);
