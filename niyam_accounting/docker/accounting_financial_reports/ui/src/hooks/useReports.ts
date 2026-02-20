import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '@/api/reports';

export const useBalanceSheet = (asOfDate: string) => useQuery({ queryKey: ['balance-sheet', asOfDate], queryFn: () => reportsApi.getBalanceSheet(asOfDate), enabled: !!asOfDate });
export const useProfitLoss = (startDate: string, endDate: string) => useQuery({ queryKey: ['profit-loss', startDate, endDate], queryFn: () => reportsApi.getProfitLoss(startDate, endDate), enabled: !!startDate && !!endDate });
export const useCashFlow = (startDate: string, endDate: string) => useQuery({ queryKey: ['cash-flow', startDate, endDate], queryFn: () => reportsApi.getCashFlow(startDate, endDate), enabled: !!startDate && !!endDate });
export const useTrialBalance = (asOfDate: string) => useQuery({ queryKey: ['trial-balance', asOfDate], queryFn: () => reportsApi.getTrialBalance(asOfDate), enabled: !!asOfDate });
