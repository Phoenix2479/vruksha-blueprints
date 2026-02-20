export interface BankAccount {
  id: string;
  account_name: string;
  bank_name: string;
  account_number: string;
  account_type: 'SAVINGS' | 'CURRENT' | 'CASH_CREDIT' | 'OVERDRAFT';
  ifsc_code: string | null;
  gl_account_id: string;
  current_balance: number;
  last_reconciled_date: string | null;
  last_reconciled_balance: number;
  is_active: boolean;
}

export interface BankTransaction {
  id: string;
  bank_account_id: string;
  transaction_date: string;
  value_date: string | null;
  transaction_type: 'DEBIT' | 'CREDIT';
  amount: number;
  description: string;
  reference_number: string | null;
  cheque_number: string | null;
  status: 'PENDING' | 'MATCHED' | 'RECONCILED' | 'UNMATCHED';
  matched_ledger_entry_id: string | null;
}

export interface Reconciliation {
  id: string;
  bank_account_id: string;
  statement_date: string;
  statement_balance: number;
  book_balance: number;
  reconciled_balance: number;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'APPROVED';
  difference: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}
