export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'

export interface Account {
  id: string
  account_code: string
  account_name: string
  account_type: AccountType
  parent_account_id: string | null
  description: string | null
  is_active: boolean
  currency: string
  opening_balance: number
  current_balance: number
  normal_balance: 'DEBIT' | 'CREDIT'
  created_at: string
  updated_at: string
}

export interface AccountTreeNode extends Account {
  children: AccountTreeNode[]
}

export interface ApiResponse<T> {
  success: boolean
  data: T
  error?: string
}
