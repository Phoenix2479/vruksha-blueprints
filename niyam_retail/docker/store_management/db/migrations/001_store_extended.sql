-- Store Management Extended Tables
-- Migration: 001_store_extended.sql
-- Date: 2025-01-21

-- ============================================
-- STORE HOURS & HOLIDAYS
-- ============================================

CREATE TABLE IF NOT EXISTS store_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 6=Saturday
  open_time TIME,
  close_time TIME,
  is_closed BOOLEAN DEFAULT false,
  break_start TIME,
  break_end TIME,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_store_hours_store ON store_hours(store_id);

CREATE TABLE IF NOT EXISTS store_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  tenant_id UUID, -- NULL = all stores
  holiday_date DATE NOT NULL,
  name VARCHAR(100) NOT NULL,
  is_closed BOOLEAN DEFAULT true,
  special_hours_open TIME,
  special_hours_close TIME,
  recurring BOOLEAN DEFAULT false, -- Repeat yearly
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_holidays_store ON store_holidays(store_id, holiday_date);
CREATE INDEX IF NOT EXISTS idx_holidays_tenant ON store_holidays(tenant_id, holiday_date);

-- ============================================
-- EMPLOYEE SCHEDULING
-- ============================================

CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID REFERENCES users(id), -- Link to users table
  employee_number VARCHAR(50),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(50),
  role VARCHAR(50) NOT NULL, -- cashier, manager, stock_clerk, etc.
  department VARCHAR(50),
  primary_store_id UUID REFERENCES stores(id),
  hourly_rate DECIMAL(10,2),
  employment_type VARCHAR(30) DEFAULT 'full_time', -- full_time, part_time, contract
  hire_date DATE,
  termination_date DATE,
  status VARCHAR(30) DEFAULT 'active', -- active, inactive, on_leave, terminated
  emergency_contact VARCHAR(255),
  emergency_phone VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, employee_number)
);

CREATE INDEX IF NOT EXISTS idx_employees_tenant ON employees(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_employees_store ON employees(primary_store_id);

CREATE TABLE IF NOT EXISTS employee_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  available_from TIME,
  available_to TIME,
  is_unavailable BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_availability_employee ON employee_availability(employee_id);

CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  store_id UUID NOT NULL REFERENCES stores(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  shift_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_minutes INTEGER DEFAULT 0,
  role VARCHAR(50), -- Role for this shift
  status VARCHAR(30) DEFAULT 'scheduled', -- scheduled, confirmed, started, completed, no_show, cancelled
  actual_start TIMESTAMPTZ,
  actual_end TIMESTAMPTZ,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shifts_tenant ON shifts(tenant_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_shifts_store ON shifts(store_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_shifts_employee ON shifts(employee_id, shift_date);

CREATE TABLE IF NOT EXISTS shift_swaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_shift_id UUID NOT NULL REFERENCES shifts(id),
  requesting_employee_id UUID NOT NULL REFERENCES employees(id),
  receiving_employee_id UUID REFERENCES employees(id),
  status VARCHAR(30) DEFAULT 'pending', -- pending, accepted, rejected, approved, cancelled
  reason TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_swaps_shift ON shift_swaps(original_shift_id);

CREATE TABLE IF NOT EXISTS time_off_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES employees(id),
  request_type VARCHAR(30) NOT NULL, -- vacation, sick, personal, bereavement, other
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  hours_requested DECIMAL(5,2),
  reason TEXT,
  status VARCHAR(30) DEFAULT 'pending', -- pending, approved, rejected, cancelled
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timeoff_employee ON time_off_requests(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_timeoff_dates ON time_off_requests(start_date, end_date);

-- ============================================
-- STORE PERFORMANCE METRICS
-- ============================================

CREATE TABLE IF NOT EXISTS store_daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  store_id UUID NOT NULL REFERENCES stores(id),
  metric_date DATE NOT NULL,
  total_sales DECIMAL(15,2) DEFAULT 0,
  total_transactions INTEGER DEFAULT 0,
  total_items_sold INTEGER DEFAULT 0,
  total_returns DECIMAL(15,2) DEFAULT 0,
  return_count INTEGER DEFAULT 0,
  net_sales DECIMAL(15,2) DEFAULT 0,
  average_transaction DECIMAL(10,2) DEFAULT 0,
  items_per_transaction DECIMAL(5,2) DEFAULT 0,
  foot_traffic INTEGER, -- If tracked
  conversion_rate DECIMAL(5,2), -- transactions / foot_traffic
  labor_hours DECIMAL(6,2) DEFAULT 0,
  labor_cost DECIMAL(10,2) DEFAULT 0,
  sales_per_labor_hour DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, store_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_metrics_store ON store_daily_metrics(store_id, metric_date);

-- ============================================
-- STORE CONFIGURATION & SETTINGS
-- ============================================

CREATE TABLE IF NOT EXISTS store_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  setting_key VARCHAR(100) NOT NULL,
  setting_value JSONB,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, setting_key)
);

CREATE INDEX IF NOT EXISTS idx_settings_store ON store_settings(store_id);

-- Default settings examples:
-- receipt_header, receipt_footer, auto_logout_minutes, require_manager_void,
-- allow_negative_inventory, price_override_requires_manager, etc.

-- ============================================
-- AUDIT LOG FOR STORE OPERATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS store_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  store_id UUID,
  entity_type VARCHAR(50) NOT NULL, -- store, employee, shift, setting
  entity_id UUID NOT NULL,
  action VARCHAR(30) NOT NULL, -- create, update, delete
  old_values JSONB,
  new_values JSONB,
  performed_by UUID,
  performed_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address VARCHAR(45)
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON store_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON store_audit_log(tenant_id, performed_at);

-- ============================================
-- REGISTER/TERMINAL MANAGEMENT
-- ============================================

CREATE TABLE IF NOT EXISTS registers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id),
  register_number VARCHAR(20) NOT NULL,
  name VARCHAR(100),
  hardware_id VARCHAR(100), -- Device identifier
  ip_address VARCHAR(45),
  status VARCHAR(30) DEFAULT 'active', -- active, inactive, maintenance
  last_seen_at TIMESTAMPTZ,
  capabilities JSONB, -- cash_drawer, receipt_printer, barcode_scanner, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, register_number)
);

CREATE INDEX IF NOT EXISTS idx_registers_store ON registers(store_id);
