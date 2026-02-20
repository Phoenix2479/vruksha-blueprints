export interface LedgerEntry {
  id: string
  journal_entry_id: string
  entry_number: string
  account_id: string
  account_code: string
  account_name: string
  entry_date: string
  description: string
  debit_amount: number
  credit_amount: number
  running_balance: number
}

export interface TrialBalanceRow {
  account_id: string
  account_code: string
  account_name: string
  account_type: string
  debit_total: number
  credit_total: number
  balance: number
}

export interface AccountBalance {
  account_id: string
  account_code: string
  account_name: string
  account_type: string
  current_balance: number
}

export interface ApiResponse<T> {
  success: boolean
  data: T
  error?: string
}
