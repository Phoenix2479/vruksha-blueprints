import axios from 'axios';
import type { BalanceSheet, ProfitLoss, CashFlow, ApiResponse } from '@/types';
const api = axios.create({ baseURL: '/api', headers: { 'Content-Type': 'application/json', 'x-tenant-id': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } });

export const reportsApi = {
  getBalanceSheet: async (asOfDate: string): Promise<ApiResponse<BalanceSheet>> => { const { data } = await api.get('/reports/balance-sheet', { params: { as_of_date: asOfDate } }); return data; },
  getProfitLoss: async (startDate: string, endDate: string): Promise<ApiResponse<ProfitLoss>> => { const { data } = await api.get('/reports/profit-loss', { params: { start_date: startDate, end_date: endDate } }); return data; },
  getCashFlow: async (startDate: string, endDate: string): Promise<ApiResponse<CashFlow>> => { const { data } = await api.get('/reports/cash-flow', { params: { start_date: startDate, end_date: endDate } }); return data; },
  getTrialBalance: async (asOfDate: string): Promise<ApiResponse<{ accounts: Array<{ code: string; name: string; type: string; debit: number; credit: number }>; total_debit: number; total_credit: number }>> => { const { data } = await api.get('/reports/trial-balance', { params: { as_of_date: asOfDate } }); return data; },
};
