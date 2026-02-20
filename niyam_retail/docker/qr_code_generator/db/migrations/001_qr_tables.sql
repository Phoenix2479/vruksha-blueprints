-- QR Code Generator Tables
-- PostgreSQL migration

-- QR Codes table
CREATE TABLE IF NOT EXISTS qr_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  type VARCHAR(50) NOT NULL,
  label VARCHAR(255) NOT NULL,
  target_url TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  branding JSONB DEFAULT '{}',
  scan_count INTEGER DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- QR Settings table (per tenant)
CREATE TABLE IF NOT EXISTS qr_settings (
  id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
  tenant_id UUID NOT NULL DEFAULT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  business_name VARCHAR(255),
  base_url VARCHAR(500) DEFAULT 'http://localhost:8852',
  default_branding JSONB DEFAULT '{"foreground_color": "#000000", "background_color": "#FFFFFF", "error_correction": "M", "size": 300}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- QR Scan Log table
CREATE TABLE IF NOT EXISTS qr_scan_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_id UUID NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL DEFAULT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  scanned_at TIMESTAMPTZ DEFAULT NOW(),
  user_agent TEXT,
  ip_address VARCHAR(45),
  referrer TEXT,
  country VARCHAR(2),
  city VARCHAR(100)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_qr_codes_tenant ON qr_codes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_type ON qr_codes(tenant_id, type);
CREATE INDEX IF NOT EXISTS idx_qr_codes_created ON qr_codes(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qr_scan_log_qr_id ON qr_scan_log(qr_id);
CREATE INDEX IF NOT EXISTS idx_qr_scan_log_tenant ON qr_scan_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_qr_scan_log_date ON qr_scan_log(tenant_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_qr_settings_tenant ON qr_settings(tenant_id);

-- Insert default settings if not exists
INSERT INTO qr_settings (id, tenant_id, business_name, base_url)
VALUES ('default', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'My Business', 'http://localhost:8852')
ON CONFLICT (id) DO NOTHING;
