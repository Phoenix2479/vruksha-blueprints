import axios from 'axios';
import type { BankAccount, BankTransaction, Reconciliation, ApiResponse } from '@/types';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json', 'x-tenant-id': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
});

export const bankApi = {
  getBankAccounts: async (): Promise<ApiResponse<BankAccount[]>> => {
    const { data } = await api.get('/bank-accounts');
    return data;
  },
  getBankAccount: async (id: string): Promise<ApiResponse<BankAccount>> => {
    const { data } = await api.get(`/bank-accounts/${id}`);
    return data;
  },
  createBankAccount: async (input: Partial<BankAccount>): Promise<ApiResponse<BankAccount>> => {
    const { data } = await api.post('/bank-accounts', input);
    return data;
  },
  getTransactions: async (bankAccountId: string, params?: { status?: string; start_date?: string; end_date?: string }): Promise<ApiResponse<BankTransaction[]>> => {
    const { data } = await api.get(`/bank-accounts/${bankAccountId}/transactions`, { params });
    return data;
  },
  importTransactions: async (bankAccountId: string, transactions: Partial<BankTransaction>[]): Promise<ApiResponse<{ imported: number }>> => {
    const { data } = await api.post(`/bank-accounts/${bankAccountId}/transactions/import`, { transactions });
    return data;
  },
  matchTransaction: async (transactionId: string, ledgerEntryId: string): Promise<ApiResponse<BankTransaction>> => {
    const { data } = await api.post(`/transactions/${transactionId}/match`, { ledger_entry_id: ledgerEntryId });
    return data;
  },
  getReconciliations: async (bankAccountId: string): Promise<ApiResponse<Reconciliation[]>> => {
    const { data } = await api.get(`/bank-accounts/${bankAccountId}/reconciliations`);
    return data;
  },
  startReconciliation: async (bankAccountId: string, statementDate: string, statementBalance: number): Promise<ApiResponse<Reconciliation>> => {
    const { data } = await api.post(`/bank-accounts/${bankAccountId}/reconciliations`, { statement_date: statementDate, statement_balance: statementBalance });
    return data;
  },
  completeReconciliation: async (reconciliationId: string): Promise<ApiResponse<Reconciliation>> => {
    const { data } = await api.post(`/reconciliations/${reconciliationId}/complete`);
    return data;
  },
};
