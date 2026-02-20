import axios from 'axios'
import type { LedgerEntry, TrialBalanceRow, AccountBalance, ApiResponse } from '@/types'

const api = axios.create({ baseURL: '/api' })

export const ledgerApi = {
  getLedger: async (accountId: string, params?: { from_date?: string; to_date?: string }) => {
    const { data } = await api.get<ApiResponse<LedgerEntry[]>>(`/ledger/${accountId}`, { params })
    return data
  },
  getTrialBalance: async (params?: { as_of_date?: string }) => {
    const { data } = await api.get<ApiResponse<TrialBalanceRow[]>>('/trial-balance', { params })
    return data
  },
  getBalances: async () => {
    const { data } = await api.get<ApiResponse<AccountBalance[]>>('/balances')
    return data
  },
}
