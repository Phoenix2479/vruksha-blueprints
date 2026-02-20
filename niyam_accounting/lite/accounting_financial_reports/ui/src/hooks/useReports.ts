import { useQuery } from '@tanstack/react-query'
import { reportsApi } from '@/api/reports'

export function useDashboard() { return useQuery({ queryKey: ['dashboard'], queryFn: reportsApi.getDashboard }) }
export function useProfitLoss(params?: { from_date?: string; to_date?: string }) { return useQuery({ queryKey: ['profit-loss', params], queryFn: () => reportsApi.getProfitLoss(params) }) }
export function useBalanceSheet(params?: { as_of_date?: string }) { return useQuery({ queryKey: ['balance-sheet', params], queryFn: () => reportsApi.getBalanceSheet(params) }) }
export function useCashFlow(params?: { from_date?: string; to_date?: string }) { return useQuery({ queryKey: ['cash-flow', params], queryFn: () => reportsApi.getCashFlow(params) }) }
export function useTrialBalance(params?: { as_of_date?: string }) { return useQuery({ queryKey: ['trial-balance', params], queryFn: () => reportsApi.getTrialBalance(params) }) }
