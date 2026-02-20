export interface Customer {
  id: string; customer_code: string; customer_name: string; display_name?: string; customer_type?: string
  gstin?: string; pan?: string; contact_person?: string; email?: string; phone?: string; mobile?: string
  billing_address?: string; city?: string; state_code?: string; pincode?: string
  payment_terms: number; credit_limit: number; current_balance: number; is_active: boolean; created_at: string
}

export interface Invoice {
  id: string; invoice_number: string; customer_id: string; customer_name?: string
  invoice_date: string; due_date: string; status: string; total_amount: number; tax_amount: number
  balance_due: number; is_interstate?: boolean; place_of_supply?: string
  lines?: InvoiceLine[]; posted_at?: string; created_at: string
}

export interface InvoiceLine {
  id?: string; description: string; account_id: string; quantity: number; unit_price: number; amount: number
  tax_code_id?: string; gst_rate?: number; cgst_amount?: number; sgst_amount?: number; igst_amount?: number
  hsn_sac_code?: string
}

export interface AgingRow {
  customer_id: string; customer_name: string; current: number; days_1_30: number; days_31_60: number
  days_61_90: number; over_90: number; total: number
}

export interface ApiResponse<T> { success: boolean; data: T; error?: string }
