export interface TaxCode { id: string; code: string; name: string; rate: number; tax_type: string; hsn_code?: string; sac_code?: string; description?: string; is_active: boolean }
export interface TdsSection { section: string; description: string; rate: number; threshold: number }
export interface TdsTransaction { id: string; deductee_name: string; deductee_pan?: string; section: string; transaction_date: string; amount: number; tds_rate: number; tds_amount: number; deposited: boolean; challan_number?: string; deposit_date?: string }
export interface GstReturn { id: string; return_type: string; period: string; financial_year: string; status: string; filing_date?: string; arn?: string; tax_payable: number; tax_paid: number; created_at: string }
export interface ApiResponse<T> { success: boolean; data: T; error?: string }
