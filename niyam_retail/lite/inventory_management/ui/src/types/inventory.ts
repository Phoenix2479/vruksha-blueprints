export interface Product {
  id: string
  tenant_id: string
  sku: string
  name: string
  description?: string
  category_id?: string
  category_name?: string
  unit_price: number
  cost_price?: number
  quantity: number
  reorder_level?: number
  reorder_quantity?: number
  location?: string
  barcode?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface StockAdjustment {
  id: string
  product_id: string
  quantity_change: number
  reason: StockAdjustmentReason
  notes?: string
  reference_id?: string
  created_by?: string
  created_at: string
}

export type StockAdjustmentReason = 
  | 'purchase'
  | 'sale'
  | 'return'
  | 'damage'
  | 'theft'
  | 'correction'
  | 'transfer_in'
  | 'transfer_out'
  | 'production'
  | 'expired'

export interface Category {
  id: string
  name: string
  parent_id?: string
}

export interface InventoryStats {
  total_products: number
  total_value: number
  low_stock_count: number
  out_of_stock_count: number
}

export interface StockHistoryEntry {
  id: string
  product_id: string
  quantity_before: number
  quantity_after: number
  quantity_change: number
  reason: string
  notes?: string
  created_at: string
}

// Low Stock Alert
export interface LowStockAlert {
  id: string
  product_id: string
  product_name: string
  sku: string
  current_stock: number
  reorder_level: number
  reorder_quantity: number
  shortage: number
  days_of_stock: number
  last_sale_date?: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  status: 'active' | 'dismissed' | 'ordered'
  created_at: string
}

// Stock Count / Cycle Counting
export interface StockCount {
  id: string
  reference_number: string
  type: 'full' | 'cycle' | 'spot'
  status: 'draft' | 'in_progress' | 'completed' | 'cancelled'
  location_id?: string
  location_name?: string
  category_id?: string
  assigned_to?: string
  started_at?: string
  completed_at?: string
  total_items: number
  counted_items: number
  variance_count: number
  variance_value: number
  notes?: string
  created_at: string
}

export interface StockCountItem {
  id: string
  count_id: string
  product_id: string
  product_name: string
  sku: string
  location?: string
  system_quantity: number
  counted_quantity?: number
  variance?: number
  variance_value?: number
  status: 'pending' | 'counted' | 'verified'
  notes?: string
}

// Goods Receiving (GRN)
export interface GoodsReceipt {
  id: string
  grn_number: string
  po_number?: string
  supplier_id?: string
  supplier_name?: string
  status: 'draft' | 'pending_inspection' | 'partial' | 'completed' | 'cancelled'
  receipt_date: string
  expected_date?: string
  location_id?: string
  location_name?: string
  total_items: number
  total_quantity: number
  total_value: number
  received_by?: string
  notes?: string
  created_at: string
}

export interface GoodsReceiptItem {
  id: string
  receipt_id: string
  product_id: string
  product_name: string
  sku: string
  ordered_quantity: number
  received_quantity: number
  rejected_quantity: number
  unit_cost: number
  total_cost: number
  batch_number?: string
  expiry_date?: string
  serial_numbers?: string[]
  inspection_status: 'pending' | 'passed' | 'failed' | 'partial'
  notes?: string
}

// Stock Transfers
export interface StockTransfer {
  id: string
  transfer_number: string
  from_location_id: string
  from_location_name: string
  to_location_id: string
  to_location_name: string
  status: 'draft' | 'pending' | 'in_transit' | 'partial' | 'completed' | 'cancelled'
  priority: 'low' | 'normal' | 'high' | 'urgent'
  requested_date: string
  shipped_date?: string
  received_date?: string
  total_items: number
  total_quantity: number
  requested_by?: string
  shipped_by?: string
  received_by?: string
  notes?: string
  created_at: string
}

export interface StockTransferItem {
  id: string
  transfer_id: string
  product_id: string
  product_name: string
  sku: string
  requested_quantity: number
  shipped_quantity: number
  received_quantity: number
  batch_number?: string
  serial_numbers?: string[]
  status: 'pending' | 'shipped' | 'received' | 'partial'
}

// Locations / Bins
export interface Location {
  id: string
  code: string
  name: string
  type: 'warehouse' | 'store' | 'zone' | 'aisle' | 'rack' | 'shelf' | 'bin'
  parent_id?: string
  parent_name?: string
  warehouse_id?: string
  warehouse_name?: string
  capacity?: number
  current_utilization?: number
  is_active: boolean
  is_pickable: boolean
  is_receivable: boolean
  address?: string
  notes?: string
  created_at: string
}

export interface LocationInventory {
  location_id: string
  product_id: string
  product_name: string
  sku: string
  quantity: number
  reserved_quantity: number
  available_quantity: number
  last_movement?: string
}

// Serial Numbers
export interface SerialNumber {
  id: string
  serial_number: string
  product_id: string
  product_name: string
  status: 'available' | 'sold' | 'reserved' | 'damaged' | 'returned' | 'warranty'
  location_id?: string
  location_name?: string
  purchase_date?: string
  sale_date?: string
  customer_id?: string
  warranty_expiry?: string
  notes?: string
  created_at: string
}

// Batch / Lot Tracking
export interface Batch {
  id: string
  batch_number: string
  product_id: string
  product_name: string
  quantity: number
  available_quantity: number
  reserved_quantity: number
  manufacturing_date?: string
  expiry_date?: string
  supplier_id?: string
  supplier_name?: string
  cost_price?: number
  location_id?: string
  location_name?: string
  status: 'active' | 'expired' | 'recalled' | 'depleted'
  notes?: string
  created_at: string
}

// Inventory Valuation
export interface ValuationSummary {
  total_value: number
  total_cost: number
  total_retail: number
  gross_margin: number
  gross_margin_percent: number
  total_items: number
  total_units: number
  valuation_method: 'fifo' | 'lifo' | 'weighted_avg' | 'specific'
  as_of_date: string
}

export interface ValuationByCategory {
  category_id: string
  category_name: string
  total_value: number
  total_units: number
  percent_of_total: number
  avg_cost: number
}

export interface ValuationByLocation {
  location_id: string
  location_name: string
  total_value: number
  total_units: number
  percent_of_total: number
}

// ABC Analysis
export interface ABCAnalysis {
  summary: {
    a_items: number
    a_value: number
    a_percent: number
    b_items: number
    b_value: number
    b_percent: number
    c_items: number
    c_value: number
    c_percent: number
  }
  items: ABCItem[]
}

export interface ABCItem {
  product_id: string
  product_name: string
  sku: string
  category: 'A' | 'B' | 'C'
  revenue: number
  quantity_sold: number
  percent_of_revenue: number
  cumulative_percent: number
  rank: number
}

// Dead Stock
export interface DeadStockItem {
  product_id: string
  product_name: string
  sku: string
  quantity: number
  value: number
  last_sale_date?: string
  days_since_sale: number
  days_in_stock: number
  recommended_action: 'discount' | 'bundle' | 'return_to_vendor' | 'write_off'
}

// Stock Aging
export interface StockAgingBracket {
  bracket: string
  min_days: number
  max_days: number
  item_count: number
  total_quantity: number
  total_value: number
  percent_of_value: number
}

export interface StockAgingItem {
  product_id: string
  product_name: string
  sku: string
  quantity: number
  value: number
  age_days: number
  bracket: string
  receipt_date: string
}

// Reorder Suggestions
export interface ReorderSuggestion {
  product_id: string
  product_name: string
  sku: string
  current_stock: number
  reorder_level: number
  suggested_quantity: number
  supplier_id?: string
  supplier_name?: string
  unit_cost: number
  total_cost: number
  lead_time_days: number
  urgency: 'critical' | 'high' | 'medium' | 'low'
  last_ordered?: string
  avg_daily_sales: number
  days_of_stock: number
}

// Write-offs
export interface WriteOff {
  id: string
  reference_number: string
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'completed'
  reason: 'damaged' | 'expired' | 'lost' | 'theft' | 'obsolete' | 'other'
  total_items: number
  total_quantity: number
  total_value: number
  requested_by: string
  approved_by?: string
  approval_date?: string
  notes?: string
  created_at: string
}

export interface WriteOffItem {
  id: string
  writeoff_id: string
  product_id: string
  product_name: string
  sku: string
  quantity: number
  unit_cost: number
  total_cost: number
  batch_number?: string
  serial_numbers?: string[]
  reason: string
  notes?: string
}

// Demand Forecast
export interface DemandForecast {
  product_id: string
  product_name: string
  sku: string
  current_stock: number
  avg_daily_demand: number
  forecast_periods: ForecastPeriod[]
  recommended_order_quantity: number
  stockout_risk: 'low' | 'medium' | 'high'
}

export interface ForecastPeriod {
  period: string
  start_date: string
  end_date: string
  forecasted_demand: number
  confidence_low: number
  confidence_high: number
}
