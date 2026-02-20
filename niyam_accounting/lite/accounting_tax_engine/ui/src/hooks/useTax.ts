import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { taxApi } from '@/api/tax'

export function useTaxCodes() { return useQuery({ queryKey: ['tax-codes'], queryFn: taxApi.getTaxCodes }) }
export function useTdsSections() { return useQuery({ queryKey: ['tds-sections'], queryFn: taxApi.getTdsSections }) }
export function useTdsTransactions() { return useQuery({ queryKey: ['tds-transactions'], queryFn: taxApi.getTdsTransactions }) }
export function useTdsSummary() { return useQuery({ queryKey: ['tds-summary'], queryFn: taxApi.getTdsSummary }) }
export function useGstReturns() { return useQuery({ queryKey: ['gst-returns'], queryFn: taxApi.getGstReturns }) }
export function useGstByRate() { return useQuery({ queryKey: ['gst-by-rate'], queryFn: taxApi.getGstByRate }) }
export function useTaxLiability() { return useQuery({ queryKey: ['tax-liability'], queryFn: taxApi.getTaxLiability }) }

export function useInitTaxCodes() { const qc = useQueryClient(); return useMutation({ mutationFn: taxApi.initTaxCodes, onSuccess: () => qc.invalidateQueries({ queryKey: ['tax-codes'] }) }) }
export function useCreateTdsTransaction() { const qc = useQueryClient(); return useMutation({ mutationFn: taxApi.createTdsTransaction, onSuccess: () => qc.invalidateQueries({ queryKey: ['tds-transactions'] }) }) }
export function useDepositTds() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => taxApi.depositTds(id, input), onSuccess: () => qc.invalidateQueries({ queryKey: ['tds-transactions'] }) }) }
export function useCreateGstReturn() { const qc = useQueryClient(); return useMutation({ mutationFn: taxApi.createGstReturn, onSuccess: () => qc.invalidateQueries({ queryKey: ['gst-returns'] }) }) }
