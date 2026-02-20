export interface FiscalYear { id: string; name: string; start_date: string; end_date: string; status: string; is_active: boolean; created_at: string }
export interface FiscalPeriod { id: string; fiscal_year_id: string; name: string; start_date: string; end_date: string; status: string; period_number: number }
export interface Budget { id: string; account_id: string; account_name?: string; fiscal_year_id: string; period_id?: string; amount: number; actual_amount?: number }
export interface CostCenter { id: string; code: string; name: string; description?: string; is_active: boolean }
export interface ApiResponse<T> { success: boolean; data: T; error?: string }
