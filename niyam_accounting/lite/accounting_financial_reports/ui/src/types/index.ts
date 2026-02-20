export interface ReportSection { label: string; items: { account_code?: string; account_name: string; amount: number }[]; total: number }
export interface ProfitLoss { revenue: ReportSection; expenses: ReportSection; net_income: number; period: { from: string; to: string } }
export interface BalanceSheet { assets: ReportSection; liabilities: ReportSection; equity: ReportSection; as_of_date: string }
export interface CashFlow { operating: ReportSection; investing: ReportSection; financing: ReportSection; net_change: number; period: { from: string; to: string } }
export interface Dashboard { total_revenue: number; total_expenses: number; net_income: number; total_assets: number; total_liabilities: number; total_equity: number; cash_balance: number; accounts_receivable: number; accounts_payable: number }
export interface ApiResponse<T> { success: boolean; data: T; error?: string }
