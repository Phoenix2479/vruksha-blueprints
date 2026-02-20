-- Smart Inventory Import Tables
-- Migration: 002_smart_import.sql
-- Features: Supplier Templates, Ingestion Sessions, AI Usage Tracking

-- ============================================
-- SUPPLIER TEMPLATES
-- Remembers column mappings for recurring suppliers
-- ============================================

CREATE TABLE IF NOT EXISTS supplier_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  supplier_name VARCHAR(255) NOT NULL,
  supplier_fingerprint TEXT,
  filename_pattern TEXT,
  header_pattern JSONB,
  column_mapping JSONB NOT NULL DEFAULT '{}',
  default_values JSONB DEFAULT '{}',
  ai_prompt_template TEXT,
  use_count INTEGER DEFAULT 0,
  confidence_score DECIMAL(5,2) DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used TIMESTAMPTZ,
  UNIQUE(tenant_id, supplier_name)
);

CREATE INDEX IF NOT EXISTS idx_supplier_templates_tenant 
  ON supplier_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_supplier_templates_fingerprint 
  ON supplier_templates(tenant_id, supplier_fingerprint);
CREATE INDEX IF NOT EXISTS idx_supplier_templates_usage 
  ON supplier_templates(tenant_id, use_count DESC, last_used DESC);

-- ============================================
-- INGESTION SESSIONS
-- Persistent staging area for imports (30-day default expiry)
-- ============================================

CREATE TABLE IF NOT EXISTS ingestion_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  supplier_template_id UUID REFERENCES supplier_templates(id) ON DELETE SET NULL,
  source_type VARCHAR(30), -- csv, xlsx, ai_vision, pdf_ocr, image_ocr
  original_filename TEXT,
  raw_data JSONB,
  mapped_data JSONB,
  column_mapping JSONB,
  warnings JSONB DEFAULT '[]',
  ai_confidence DECIMAL(5,2),
  ai_mode VARCHAR(20), -- local, cloud
  status VARCHAR(20) DEFAULT 'pending', -- pending, committed, cancelled, expired
  import_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  committed_at TIMESTAMPTZ,
  committed_by UUID
);

CREATE INDEX IF NOT EXISTS idx_ingestion_sessions_tenant 
  ON ingestion_sessions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_ingestion_sessions_expiry 
  ON ingestion_sessions(expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_ingestion_sessions_template 
  ON ingestion_sessions(supplier_template_id);

-- ============================================
-- AI USAGE LOG
-- Tracks AI API usage for transparency and billing
-- ============================================

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  service VARCHAR(50) NOT NULL, -- openai, anthropic, tesseract, ollama
  model VARCHAR(100),
  operation VARCHAR(50), -- extract_inventory, parse_document
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  tokens_total INTEGER DEFAULT 0,
  cost_estimate DECIMAL(10,6) DEFAULT 0,
  duration_ms INTEGER,
  session_id UUID REFERENCES ingestion_sessions(id) ON DELETE SET NULL,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant 
  ON ai_usage_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_service 
  ON ai_usage_log(service, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_session 
  ON ai_usage_log(session_id);

-- ============================================
-- HELPER FUNCTION: Cleanup expired sessions
-- Can be called by cron or scheduled task
-- ============================================

CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  UPDATE ingestion_sessions 
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'pending' 
    AND expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- HELPER FUNCTION: Get expiring sessions warning
-- Returns sessions expiring within N days
-- ============================================

CREATE OR REPLACE FUNCTION get_expiring_sessions(
  p_tenant_id UUID,
  p_days_threshold INTEGER DEFAULT 7
)
RETURNS TABLE (
  id UUID,
  original_filename TEXT,
  expires_at TIMESTAMPTZ,
  expires_in_days INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.original_filename,
    s.expires_at,
    EXTRACT(DAY FROM (s.expires_at - NOW()))::INTEGER as expires_in_days
  FROM ingestion_sessions s
  WHERE s.tenant_id = p_tenant_id
    AND s.status = 'pending'
    AND s.expires_at <= (NOW() + (p_days_threshold || ' days')::INTERVAL)
  ORDER BY s.expires_at ASC;
END;
$$ LANGUAGE plpgsql;
