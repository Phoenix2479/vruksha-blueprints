export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type AccountSubType =
  | 'CURRENT_ASSET' | 'FIXED_ASSET' | 'OTHER_ASSET'
  | 'CURRENT_LIABILITY' | 'LONG_TERM_LIABILITY'
  | 'OWNERS_EQUITY' | 'RETAINED_EARNINGS'
  | 'OPERATING_REVENUE' | 'OTHER_REVENUE'
  | 'OPERATING_EXPENSE' | 'COST_OF_GOODS' | 'OTHER_EXPENSE';

export interface Account {
  id: string;
  tenant_id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  account_sub_type: AccountSubType;
  parent_account_id: string | null;
  description: string | null;
  is_active: boolean;
  is_system: boolean;
  currency: string;
  opening_balance: number;
  current_balance: number;
  normal_balance: 'DEBIT' | 'CREDIT';
  created_at: string;
  updated_at: string;
  children?: Account[];
  depth?: number;
}

export interface CreateAccountInput {
  account_code: string;
  account_name: string;
  account_type: AccountType;
  account_sub_type: AccountSubType;
  parent_account_id?: string | null;
  description?: string;
  currency?: string;
  opening_balance?: number;
}

export interface UpdateAccountInput {
  account_name?: string;
  description?: string;
  is_active?: boolean;
  parent_account_id?: string | null;
}

export interface AccountTreeNode extends Account {
  children: AccountTreeNode[];
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
