export interface BankAccount { id: string; bank_name: string; account_number: string; account_name: string; ifsc_code?: string; current_balance: number; is_active: boolean }
export interface BankTransaction { id: string; bank_account_id: string; transaction_date: string; description: string; reference_number?: string; debit_amount: number; credit_amount: number; balance: number; is_reconciled: boolean; reconciled_at?: string; journal_entry_id?: string }
export interface ReconciliationSummary { bank_balance: number; book_balance: number; unreconciled_count: number; unreconciled_amount: number }
export interface ApiResponse<T> { success: boolean; data: T; error?: string }
