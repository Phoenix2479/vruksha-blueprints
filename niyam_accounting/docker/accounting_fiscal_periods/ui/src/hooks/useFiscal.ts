import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fiscalApi } from '@/api/fiscal';
import type { Budget, CostCenter } from '@/types';

export const useFiscalYears = () => useQuery({ queryKey: ['fiscal-years'], queryFn: () => fiscalApi.getFiscalYears() });
export const useFiscalPeriods = (fiscalYearId: string) => useQuery({ queryKey: ['fiscal-periods', fiscalYearId], queryFn: () => fiscalApi.getFiscalPeriods(fiscalYearId), enabled: !!fiscalYearId });
export const useBudgets = (fiscalYearId?: string) => useQuery({ queryKey: ['budgets', fiscalYearId], queryFn: () => fiscalApi.getBudgets(fiscalYearId) });
export const useCostCenters = () => useQuery({ queryKey: ['cost-centers'], queryFn: () => fiscalApi.getCostCenters() });

export const useCreateFiscalYear = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (input: { year_name: string; start_date: string; end_date: string }) => fiscalApi.createFiscalYear(input), onSuccess: () => qc.invalidateQueries({ queryKey: ['fiscal-years'] }) }); };
export const useCloseFiscalYear = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => fiscalApi.closeFiscalYear(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['fiscal-years'] }) }); };
export const useYearEndClosing = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, retainedEarningsAccountId }: { id: string; retainedEarningsAccountId: string }) => fiscalApi.performYearEndClosing(id, retainedEarningsAccountId), onSuccess: () => qc.invalidateQueries({ queryKey: ['fiscal-years'] }) }); };
export const useClosePeriod = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (periodId: string) => fiscalApi.closePeriod(periodId), onSuccess: () => qc.invalidateQueries({ queryKey: ['fiscal-periods'] }) }); };
export const useReopenPeriod = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (periodId: string) => fiscalApi.reopenPeriod(periodId), onSuccess: () => qc.invalidateQueries({ queryKey: ['fiscal-periods'] }) }); };
export const useCreateBudget = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (input: Partial<Budget>) => fiscalApi.createBudget(input), onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets'] }) }); };
export const useCreateCostCenter = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (input: Partial<CostCenter>) => fiscalApi.createCostCenter(input), onSuccess: () => qc.invalidateQueries({ queryKey: ['cost-centers'] }) }); };
