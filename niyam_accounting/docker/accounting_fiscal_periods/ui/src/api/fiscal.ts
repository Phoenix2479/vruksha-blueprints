import axios from 'axios';
import type { FiscalYear, FiscalPeriod, Budget, CostCenter, ApiResponse } from '@/types';
const api = axios.create({ baseURL: '/api', headers: { 'Content-Type': 'application/json', 'x-tenant-id': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } });

export const fiscalApi = {
  getFiscalYears: async (): Promise<ApiResponse<FiscalYear[]>> => { const { data } = await api.get('/fiscal-years'); return data; },
  createFiscalYear: async (input: { year_name: string; start_date: string; end_date: string }): Promise<ApiResponse<FiscalYear>> => { const { data } = await api.post('/fiscal-years', input); return data; },
  closeFiscalYear: async (id: string): Promise<ApiResponse<FiscalYear>> => { const { data } = await api.post(`/fiscal-years/${id}/close`); return data; },
  performYearEndClosing: async (id: string, retainedEarningsAccountId: string): Promise<ApiResponse<{ closed: boolean }>> => { const { data } = await api.post(`/fiscal-years/${id}/year-end-closing`, { retained_earnings_account_id: retainedEarningsAccountId }); return data; },
  getFiscalPeriods: async (fiscalYearId: string): Promise<ApiResponse<FiscalPeriod[]>> => { const { data } = await api.get(`/fiscal-years/${fiscalYearId}/periods`); return data; },
  closePeriod: async (periodId: string): Promise<ApiResponse<FiscalPeriod>> => { const { data } = await api.post(`/periods/${periodId}/close`); return data; },
  reopenPeriod: async (periodId: string): Promise<ApiResponse<FiscalPeriod>> => { const { data } = await api.post(`/periods/${periodId}/reopen`); return data; },
  getBudgets: async (fiscalYearId?: string): Promise<ApiResponse<Budget[]>> => { const { data } = await api.get('/budgets', { params: fiscalYearId ? { fiscal_year_id: fiscalYearId } : undefined }); return data; },
  createBudget: async (input: Partial<Budget>): Promise<ApiResponse<Budget>> => { const { data } = await api.post('/budgets', input); return data; },
  getCostCenters: async (): Promise<ApiResponse<CostCenter[]>> => { const { data } = await api.get('/cost-centers'); return data; },
  createCostCenter: async (input: Partial<CostCenter>): Promise<ApiResponse<CostCenter>> => { const { data } = await api.post('/cost-centers', input); return data; },
};
