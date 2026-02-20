export interface FiscalYear { id: string; year_name: string; start_date: string; end_date: string; status: 'OPEN' | 'CLOSED' | 'LOCKED'; is_current: boolean; }
export interface FiscalPeriod { id: string; fiscal_year_id: string; period_number: number; period_name: string; start_date: string; end_date: string; status: 'OPEN' | 'CLOSED' | 'LOCKED'; }
export interface Budget { id: string; budget_name: string; fiscal_year_id: string; fiscal_year_name?: string; account_id: string; account_name?: string; cost_center_id: string | null; cost_center_name?: string; budgeted_amount: number; actual_amount: number; variance: number; variance_percentage: number; }
export interface CostCenter { id: string; code: string; name: string; description: string | null; parent_id: string | null; is_active: boolean; }
export interface ApiResponse<T> { success: boolean; data?: T; error?: { code: string; message: string }; }
