export interface VoucherType {
  type: string;
  label: string;
  shortcut: string;
  description: string;
  dr: string;
  cr: string;
}

export interface VoucherLine {
  id?: string;
  account_id: string;
  account_code?: string;
  account_name?: string;
  amount: number;
  dr_cr: 'dr' | 'cr';
  description?: string;
  hsn_code?: string;
  tax_code_id?: string;
  tax_amount?: number;
}

export interface Voucher {
  id: string;
  voucher_number: string;
  voucher_type: string;
  voucher_date: string;
  party_id?: string;
  party_type?: string;
  amount: number;
  narration?: string;
  reference?: string;
  status: 'draft' | 'posted' | 'void';
  journal_entry_id?: string;
  lines?: VoucherLine[];
  created_at: string;
}

export interface Account {
  id: string;
  account_code: string;
  account_name: string;
  category?: string;
}

export interface Party {
  id: string;
  code: string;
  name: string;
  party_type: 'customer' | 'vendor';
}

export interface RecurringTemplate {
  id: string;
  name: string;
  voucher_type: string;
  frequency: string;
  start_date: string;
  end_date?: string;
  next_run_date: string;
  last_run_date?: string;
  amount: number;
  narration?: string;
  is_active: number;
  auto_post: number;
  run_count: number;
  lines?: { account_id: string; amount: number; dr_cr: string; description?: string; account_code?: string; account_name?: string }[];
}

export interface RecurringLog {
  id: string;
  template_id: string;
  generated_voucher_id?: string;
  voucher_number?: string;
  voucher_status?: string;
  generated_date: string;
  status: string;
}
