-- CRM 360 Persistence Migration
-- Converts in-memory stores to persistent PostgreSQL tables
-- Ensures ZERO data loss on crash/restart

-- ============================================
-- DEALS PIPELINE (was in-memory dealsStore)
-- ============================================
CREATE TABLE IF NOT EXISTS crm_deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    title TEXT NOT NULL,
    value NUMERIC(15,2) DEFAULT 0,
    stage TEXT DEFAULT 'qualification' CHECK (stage IN ('qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost')),
    probability INTEGER DEFAULT 20 CHECK (probability >= 0 AND probability <= 100),
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    expected_close_date TIMESTAMPTZ,
    assigned_to UUID,
    tags JSONB DEFAULT '[]',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_deals_tenant ON crm_deals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_stage ON crm_deals(tenant_id, stage);
CREATE INDEX IF NOT EXISTS idx_crm_deals_customer ON crm_deals(tenant_id, customer_id);

-- ============================================
-- ACTIVITIES (was in-memory activitiesStore)
-- ============================================
CREATE TABLE IF NOT EXISTS crm_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    type TEXT DEFAULT 'task' CHECK (type IN ('task', 'call', 'email', 'meeting', 'note')),
    title TEXT NOT NULL,
    description TEXT,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    deal_id UUID REFERENCES crm_deals(id) ON DELETE SET NULL,
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    due_date TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    assigned_to UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_activities_tenant ON crm_activities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_customer ON crm_activities(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_deal ON crm_activities(tenant_id, deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_due ON crm_activities(tenant_id, due_date) WHERE completed_at IS NULL;

-- ============================================
-- AI ACTIONS QUEUE (was in-memory aiActionsStore)
-- ============================================
CREATE TABLE IF NOT EXISTS crm_ai_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    action_type TEXT NOT NULL,
    target_id TEXT,
    target_type TEXT,
    reasoning TEXT,
    parameters JSONB DEFAULT '{}',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'executed')),
    confidence_score NUMERIC(3,2) DEFAULT 0.70,
    approved_at TIMESTAMPTZ,
    approved_by TEXT,
    override_reason TEXT,
    executed_at TIMESTAMPTZ,
    result JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_ai_actions_tenant ON crm_ai_actions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_crm_ai_actions_status ON crm_ai_actions(tenant_id, status);

-- ============================================
-- PRIVACY CONSENTS (was in-memory consentStore)
-- GDPR compliance - must be persistent!
-- ============================================
CREATE TABLE IF NOT EXISTS crm_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    consent_type TEXT NOT NULL CHECK (consent_type IN ('marketing_email', 'sms', 'data_processing', 'third_party_sharing', 'analytics')),
    granted BOOLEAN DEFAULT TRUE,
    source TEXT DEFAULT 'manual',
    ip_address INET,
    user_agent TEXT,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    UNIQUE(tenant_id, customer_id, consent_type)
);

CREATE INDEX IF NOT EXISTS idx_crm_consents_customer ON crm_consents(tenant_id, customer_id);

-- ============================================
-- AUDIT TRAIL (was in-memory auditLog)
-- Critical for compliance - must be persistent!
-- ============================================
CREATE TABLE IF NOT EXISTS crm_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    event_type TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    user_id TEXT,
    details JSONB DEFAULT '{}',
    ip_address INET,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_audit_tenant ON crm_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_crm_audit_entity ON crm_audit_log(tenant_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_crm_audit_timestamp ON crm_audit_log(tenant_id, timestamp DESC);

-- ============================================
-- CUSTOMER JOURNEY EVENTS
-- ============================================
CREATE TABLE IF NOT EXISTS crm_journey_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    channel TEXT DEFAULT 'pos',
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_journey_customer ON crm_journey_events(tenant_id, customer_id);

-- ============================================
-- SEGMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS crm_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    name TEXT NOT NULL,
    description TEXT,
    filter JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

-- ============================================
-- TAGS
-- ============================================
CREATE TABLE IF NOT EXISTS crm_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

-- ============================================
-- CUSTOMER TAG LINKS
-- ============================================
CREATE TABLE IF NOT EXISTS crm_customer_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES crm_tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, customer_id, tag_id)
);

-- ============================================
-- CAMPAIGNS
-- ============================================
CREATE TABLE IF NOT EXISTS crm_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    name TEXT NOT NULL,
    type TEXT,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'completed')),
    target_segment TEXT,
    message_template TEXT,
    channel TEXT DEFAULT 'email',
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    metrics JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_campaigns_tenant ON crm_campaigns(tenant_id);

-- ============================================
-- AUTOMATION TRIGGERS
-- ============================================
CREATE TABLE IF NOT EXISTS crm_automation_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    name TEXT NOT NULL,
    event_type TEXT NOT NULL,
    conditions JSONB DEFAULT '{}',
    actions JSONB NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    last_triggered TIMESTAMPTZ,
    trigger_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SEED SAMPLE DEALS (only if table is empty)
-- ============================================
INSERT INTO crm_deals (tenant_id, title, value, stage, probability, tags, created_at, updated_at)
SELECT 
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    title, value, stage, probability, tags::jsonb, 
    NOW() - (random() * interval '60 days'),
    NOW() - (random() * interval '10 days')
FROM (VALUES
    ('TechCorp Enterprise License', 250000, 'negotiation', 75, '["enterprise"]'),
    ('RetailMax POS Upgrade', 85000, 'proposal', 50, '["upgrade"]'),
    ('FoodChain Pilot Program', 45000, 'qualification', 25, '["pilot"]'),
    ('MegaMart Multi-Store Deal', 450000, 'negotiation', 80, '["enterprise","multi-store"]'),
    ('StartupXYZ Starter Pack', 15000, 'proposal', 40, '["starter"]'),
    ('Retail Analytics Add-on', 35000, 'closed_won', 100, '["addon"]')
) AS v(title, value, stage, probability, tags)
WHERE NOT EXISTS (SELECT 1 FROM crm_deals LIMIT 1);

-- ============================================
-- SEED SAMPLE ACTIVITIES (only if table is empty)
-- ============================================
INSERT INTO crm_activities (tenant_id, type, title, description, priority, created_at)
SELECT 
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    type, title, description, priority,
    NOW() - (random() * interval '10 days')
FROM (VALUES
    ('call', 'Follow-up call', 'Discuss enterprise pricing', 'high'),
    ('email', 'Send proposal', NULL, 'medium'),
    ('meeting', 'Product demo', 'Online demo of hospitality features', 'high'),
    ('task', 'Prepare contract', NULL, 'urgent'),
    ('note', 'Customer interested in inventory module', 'Has 2 stores, planning to expand', 'low')
) AS v(type, title, description, priority)
WHERE NOT EXISTS (SELECT 1 FROM crm_activities LIMIT 1);

-- Add updated_at trigger for deals
CREATE OR REPLACE FUNCTION update_crm_deals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_crm_deals_updated_at ON crm_deals;
CREATE TRIGGER trigger_crm_deals_updated_at
    BEFORE UPDATE ON crm_deals
    FOR EACH ROW
    EXECUTE FUNCTION update_crm_deals_updated_at();

-- Add updated_at trigger for campaigns
DROP TRIGGER IF EXISTS trigger_crm_campaigns_updated_at ON crm_campaigns;
CREATE TRIGGER trigger_crm_campaigns_updated_at
    BEFORE UPDATE ON crm_campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_crm_deals_updated_at();
