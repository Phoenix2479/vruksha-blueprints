export interface GSTRate { id: string; hsn_sac_code: string; description: string; rate: number; cgst_rate: number; sgst_rate: number; igst_rate: number; cess_rate: number; effective_from: string; is_active: boolean; }
export interface TDSSection { id: string; section_code: string; section_name: string; description: string; threshold_amount: number; rate_individual: number; rate_company: number; rate_no_pan: number; is_active: boolean; }
export interface TDSEntry { id: string; section_id: string; section_code?: string; deductee_name: string; deductee_pan: string; base_amount: number; tds_rate: number; tds_amount: number; transaction_date: string; payment_date: string | null; status: 'PENDING' | 'DEDUCTED' | 'DEPOSITED' | 'FILED'; }
export interface GSTCalculation { base_amount: number; tax_type: 'INTRASTATE' | 'INTERSTATE'; cgst: number; sgst: number; igst: number; cess: number; total_tax: number; total_amount: number; }
export interface GSTR1Data { period: string; b2b_invoices: number; b2c_large: number; b2c_small: number; total_taxable: number; total_tax: number; }
export interface ApiResponse<T> { success: boolean; data?: T; error?: { code: string; message: string }; }
