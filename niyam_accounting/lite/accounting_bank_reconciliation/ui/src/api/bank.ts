import axios from 'axios'
import type { BankAccount, BankTransaction, ReconciliationSummary, ApiResponse } from '@/types'

const api = axios.create({ baseURL: '/api' })

export const bankApi = {
  getBankAccounts: async () => { const { data } = await api.get<ApiResponse<BankAccount[]>>('/bank-accounts'); return data },
  createBankAccount: async (input: Partial<BankAccount>) => { const { data } = await api.post<ApiResponse<BankAccount>>('/bank-accounts', input); return data },
  getTransactions: async (bankId: string) => { const { data } = await api.get<ApiResponse<BankTransaction[]>>(`/bank-accounts/${bankId}/transactions`); return data },
  createTransaction: async (bankId: string, input: any) => { const { data } = await api.post<ApiResponse<BankTransaction>>(`/bank-accounts/${bankId}/transactions`, input); return data },
  reconcile: async (id: string, input?: any) => { const { data } = await api.post<ApiResponse<BankTransaction>>(`/bank-transactions/${id}/reconcile`, input); return data },
  getUnreconciled: async () => { const { data } = await api.get<ApiResponse<BankTransaction[]>>('/unreconciled'); return data },
  getSummary: async (bankId: string) => { const { data } = await api.get<ApiResponse<ReconciliationSummary>>(`/reconciliation-summary/${bankId}`); return data },
}
