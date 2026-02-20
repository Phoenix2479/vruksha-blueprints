-- Purchase Orders schema
-- Extracted from db/migrations/017_accounting_phase2_3.sql

CREATE TABLE IF NOT EXISTS acc_purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    po_number VARCHAR(50),
    vendor_id UUID,
    order_date DATE,
    expected_date DATE,
    items JSONB,
    subtotal DECIMAL(18,2) DEFAULT 0,
    tax DECIMAL(18,2) DEFAULT 0,
    total DECIMAL(18,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'draft',
    approved_by VARCHAR(200),
    approved_at TIMESTAMPTZ,
    notes TEXT,
    company_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, po_number)
);

CREATE INDEX IF NOT EXISTS idx_acc_po_vendor ON acc_purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_acc_po_status ON acc_purchase_orders(status);

CREATE TABLE IF NOT EXISTS acc_po_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    po_id UUID NOT NULL REFERENCES acc_purchase_orders(id),
    receipt_date DATE,
    items_received JSONB,
    received_by VARCHAR(200),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
