export type JournalEntryStatus = 'DRAFT' | 'PENDING' | 'POSTED' | 'REVERSED';
export type JournalEntryType = 'STANDARD' | 'ADJUSTING' | 'CLOSING' | 'REVERSING' | 'RECURRING';

export interface JournalEntryLine {
  id: string;
  journal_entry_id: string;
  account_id: string;
  account_code?: string;
  account_name?: string;
  debit_amount: number;
  credit_amount: number;
  description: string | null;
  cost_center_id: string | null;
}

export interface JournalEntry {
  id: string;
  tenant_id: string;
  entry_number: string;
  entry_date: string;
  entry_type: JournalEntryType;
  status: JournalEntryStatus;
  description: string;
  reference_number: string | null;
  source_module: string | null;
  source_document_id: string | null;
  fiscal_year_id: string | null;
  fiscal_period_id: string | null;
  total_debit: number;
  total_credit: number;
  is_balanced: boolean;
  posted_at: string | null;
  posted_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  lines: JournalEntryLine[];
}

export interface CreateJournalEntryInput {
  entry_date: string;
  entry_type?: JournalEntryType;
  description: string;
  reference_number?: string;
  lines: Array<{
    account_id: string;
    debit_amount?: number;
    credit_amount?: number;
    description?: string;
  }>;
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
