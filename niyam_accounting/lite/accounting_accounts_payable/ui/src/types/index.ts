export interface Vendor {
  id: string; vendor_code: string; vendor_name: string; display_name?: string; vendor_type?: string
  gstin?: string; pan?: string; tan?: string; contact_person?: string; email?: string; phone?: string; mobile?: string
  address?: string; city?: string; state_code?: string; pincode?: string
  tds_applicable?: boolean; tds_section?: string; tds_rate?: number
  bank_name?: string; bank_account_number?: string; bank_ifsc?: string
  payment_terms: number; credit_limit: number; current_balance: number; is_active: boolean; created_at: string
}

export interface Bill {
  id: string; bill_number: string; vendor_id: string; vendor_name?: string
  bill_date: string; due_date: string; status: string; total_amount: number; tax_amount: number
  balance_due: number; is_interstate?: boolean; reference_number?: string
  lines?: BillLine[]; posted_at?: string; created_at: string
}

export interface BillLine {
  id?: string; description: string; account_id: string; quantity: number; unit_price: number; amount: number
  tax_code_id?: string; tax_rate?: number; cgst_amount?: number; sgst_amount?: number; igst_amount?: number
  hsn_sac_code?: string
}

export interface Payment {
  id: string; payment_number: string; vendor_id: string; vendor_name?: string; bill_id?: string
  payment_date: string; amount: number; payment_method: string; reference_number?: string
  bank_account_id?: string; tds_amount?: number; tds_section?: string; notes?: string; created_at: string
}

export interface AgingRow {
  vendor_id: string; vendor_name: string; current: number; days_1_30: number; days_31_60: number
  days_61_90: number; over_90: number; total: number
}

export interface ApiResponse<T> { success: boolean; data: T; error?: string }
