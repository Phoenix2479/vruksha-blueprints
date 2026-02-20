import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fiscalApi } from '@/api/fiscal'

export function useFiscalYears() { return useQuery({ queryKey: ['fiscal-years'], queryFn: fiscalApi.getFiscalYears }) }
export function usePeriods(params?: { fiscal_year_id?: string }) { return useQuery({ queryKey: ['periods', params], queryFn: () => fiscalApi.getPeriods(params) }) }
export function useBudgets() { return useQuery({ queryKey: ['budgets'], queryFn: fiscalApi.getBudgets }) }
export function useCostCenters() { return useQuery({ queryKey: ['cost-centers'], queryFn: fiscalApi.getCostCenters }) }

export function useCreateFiscalYear() { const qc = useQueryClient(); return useMutation({ mutationFn: fiscalApi.createFiscalYear, onSuccess: () => { qc.invalidateQueries({ queryKey: ['fiscal-years'] }); qc.invalidateQueries({ queryKey: ['periods'] }) } }) }
export function useCloseFiscalYear() { const qc = useQueryClient(); return useMutation({ mutationFn: fiscalApi.closeFiscalYear, onSuccess: () => qc.invalidateQueries({ queryKey: ['fiscal-years'] }) }) }
export function useClosePeriod() { const qc = useQueryClient(); return useMutation({ mutationFn: fiscalApi.closePeriod, onSuccess: () => qc.invalidateQueries({ queryKey: ['periods'] }) }) }
export function useReopenPeriod() { const qc = useQueryClient(); return useMutation({ mutationFn: fiscalApi.reopenPeriod, onSuccess: () => qc.invalidateQueries({ queryKey: ['periods'] }) }) }
export function useCreateCostCenter() { const qc = useQueryClient(); return useMutation({ mutationFn: fiscalApi.createCostCenter, onSuccess: () => qc.invalidateQueries({ queryKey: ['cost-centers'] }) }) }
