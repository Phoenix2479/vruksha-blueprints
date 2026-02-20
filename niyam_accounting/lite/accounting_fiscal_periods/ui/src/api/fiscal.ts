import axios from 'axios'
import type { FiscalYear, FiscalPeriod, Budget, CostCenter, ApiResponse } from '@/types'

const api = axios.create({ baseURL: '/api' })

export const fiscalApi = {
  getFiscalYears: async () => { const { data } = await api.get<ApiResponse<FiscalYear[]>>('/fiscal-years'); return data },
  createFiscalYear: async (input: any) => { const { data } = await api.post<ApiResponse<FiscalYear>>('/fiscal-years', input); return data },
  closeFiscalYear: async (id: string) => { const { data } = await api.post<ApiResponse<any>>(`/fiscal-years/${id}/close`); return data },
  getPeriods: async (params?: { fiscal_year_id?: string }) => { const { data } = await api.get<ApiResponse<FiscalPeriod[]>>('/periods', { params }); return data },
  closePeriod: async (id: string) => { const { data } = await api.post<ApiResponse<FiscalPeriod>>(`/periods/${id}/close`); return data },
  reopenPeriod: async (id: string) => { const { data } = await api.post<ApiResponse<FiscalPeriod>>(`/periods/${id}/reopen`); return data },
  getBudgets: async () => { const { data } = await api.get<ApiResponse<Budget[]>>('/budgets'); return data },
  createBudget: async (input: any) => { const { data } = await api.post<ApiResponse<Budget>>('/budgets', input); return data },
  getCostCenters: async () => { const { data } = await api.get<ApiResponse<CostCenter[]>>('/cost-centers'); return data },
  createCostCenter: async (input: any) => { const { data } = await api.post<ApiResponse<CostCenter>>('/cost-centers', input); return data },
}
