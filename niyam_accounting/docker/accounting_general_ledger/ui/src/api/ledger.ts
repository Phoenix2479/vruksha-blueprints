import axios from 'axios';
import type { AccountLedger, TrialBalance, LedgerEntry, ApiResponse, PaginatedResponse } from '@/types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
    'x-tenant-id': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  },
});

export const ledgerApi = {
  // Get all ledger entries
  getEntries: async (params?: {
    account_id?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<LedgerEntry>> => {
    const { data } = await api.get('/ledger/entries', { params });
    return data;
  },

  // Get account ledger with running balance
  getAccountLedger: async (
    accountId: string,
    params?: {
      start_date?: string;
      end_date?: string;
    }
  ): Promise<ApiResponse<AccountLedger>> => {
    const { data } = await api.get(`/ledger/account/${accountId}`, { params });
    return data;
  },

  // Get trial balance
  getTrialBalance: async (asOfDate?: string): Promise<ApiResponse<TrialBalance>> => {
    const { data } = await api.get('/ledger/trial-balance', {
      params: asOfDate ? { as_of_date: asOfDate } : undefined,
    });
    return data;
  },

  // Get account balances summary
  getAccountBalances: async (params?: {
    account_type?: string;
    as_of_date?: string;
  }): Promise<ApiResponse<Array<{
    account_id: string;
    account_code: string;
    account_name: string;
    account_type: string;
    debit_total: number;
    credit_total: number;
    balance: number;
  }>>> => {
    const { data } = await api.get('/ledger/balances', { params });
    return data;
  },

  // Post entries (from journal)
  postEntries: async (journalEntryId: string): Promise<ApiResponse<{ posted: number }>> => {
    const { data } = await api.post(`/ledger/post/${journalEntryId}`);
    return data;
  },

  // Reverse entries
  reverseEntries: async (journalEntryId: string): Promise<ApiResponse<{ reversed: number }>> => {
    const { data } = await api.post(`/ledger/reverse/${journalEntryId}`);
    return data;
  },
};
