import axios from 'axios';
import type { Account, CreateAccountInput, UpdateAccountInput, ApiResponse, PaginatedResponse, AccountTreeNode } from '@/types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
    'x-tenant-id': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  },
});

export const accountsApi = {
  // Get all accounts (flat list)
  getAccounts: async (params?: {
    type?: string;
    is_active?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<Account>> => {
    const { data } = await api.get('/accounts', { params });
    return data;
  },

  // Get account tree (hierarchical)
  getAccountTree: async (): Promise<ApiResponse<AccountTreeNode[]>> => {
    const { data } = await api.get('/accounts/tree');
    return data;
  },

  // Get single account
  getAccount: async (id: string): Promise<ApiResponse<Account>> => {
    const { data } = await api.get(`/accounts/${id}`);
    return data;
  },

  // Get account by code
  getAccountByCode: async (code: string): Promise<ApiResponse<Account>> => {
    const { data } = await api.get(`/accounts/code/${code}`);
    return data;
  },

  // Create account
  createAccount: async (input: CreateAccountInput): Promise<ApiResponse<Account>> => {
    const { data } = await api.post('/accounts', input);
    return data;
  },

  // Update account
  updateAccount: async (id: string, input: UpdateAccountInput): Promise<ApiResponse<Account>> => {
    const { data } = await api.put(`/accounts/${id}`, input);
    return data;
  },

  // Delete account
  deleteAccount: async (id: string): Promise<ApiResponse<null>> => {
    const { data } = await api.delete(`/accounts/${id}`);
    return data;
  },

  // Get account balance
  getAccountBalance: async (id: string, asOfDate?: string): Promise<ApiResponse<{
    account_id: string;
    account_code: string;
    account_name: string;
    debit_total: number;
    credit_total: number;
    balance: number;
    normal_balance: string;
  }>> => {
    const { data } = await api.get(`/accounts/${id}/balance`, {
      params: asOfDate ? { as_of_date: asOfDate } : undefined,
    });
    return data;
  },

  // Initialize default chart of accounts
  initializeDefaults: async (): Promise<ApiResponse<{ created: number }>> => {
    const { data } = await api.post('/accounts/initialize-defaults');
    return data;
  },
};
