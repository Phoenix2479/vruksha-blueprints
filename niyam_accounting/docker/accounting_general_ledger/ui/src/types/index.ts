export interface LedgerEntry {
  id: string;
  tenant_id: string;
  journal_entry_id: string;
  account_id: string;
  account_code: string;
  account_name: string;
  entry_date: string;
  debit_amount: number;
  credit_amount: number;
  balance: number;
  description: string | null;
  reference_number: string | null;
  created_at: string;
}

export interface AccountLedger {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  normal_balance: 'DEBIT' | 'CREDIT';
  opening_balance: number;
  closing_balance: number;
  total_debits: number;
  total_credits: number;
  entries: LedgerEntry[];
}

export interface TrialBalance {
  as_of_date: string;
  accounts: Array<{
    account_id: string;
    account_code: string;
    account_name: string;
    account_type: string;
    debit_balance: number;
    credit_balance: number;
  }>;
  total_debits: number;
  total_credits: number;
  is_balanced: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
