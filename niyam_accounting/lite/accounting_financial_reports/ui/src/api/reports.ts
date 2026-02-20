import axios from 'axios'
import type { ProfitLoss, BalanceSheet, CashFlow, Dashboard, ApiResponse } from '@/types'

const api = axios.create({ baseURL: '/api' })

export const reportsApi = {
  getProfitLoss: async (params?: { from_date?: string; to_date?: string }) => { const { data } = await api.get<ApiResponse<ProfitLoss>>('/reports/profit-loss', { params }); return data },
  getBalanceSheet: async (params?: { as_of_date?: string }) => { const { data } = await api.get<ApiResponse<BalanceSheet>>('/reports/balance-sheet', { params }); return data },
  getTrialBalance: async (params?: { as_of_date?: string }) => { const { data } = await api.get<ApiResponse<any>>('/reports/trial-balance', { params }); return data },
  getCashFlow: async (params?: { from_date?: string; to_date?: string }) => { const { data } = await api.get<ApiResponse<CashFlow>>('/reports/cash-flow', { params }); return data },
  getDashboard: async () => { const { data } = await api.get<ApiResponse<Dashboard>>('/reports/dashboard'); return data },
}
