export type JournalStatus = 'DRAFT' | 'POSTED' | 'VOID'

export interface JournalLine {
  id?: string
  account_id: string
  account_code?: string
  account_name?: string
  debit_amount: number
  credit_amount: number
  description?: string
}

export interface JournalEntry {
  id: string
  entry_number: string
  entry_date: string
  description: string
  status: JournalStatus
  reference_number?: string
  reference_type?: string
  source_system?: string
  total_debit: number
  total_credit: number
  is_balanced: boolean
  lines: JournalLine[]
  created_at: string
  posted_at?: string
}

export interface ApiResponse<T> {
  success: boolean
  data: T
  error?: string
}
