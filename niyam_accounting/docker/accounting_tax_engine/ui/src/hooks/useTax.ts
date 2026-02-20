import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { taxApi } from '@/api/tax';
import type { GSTRate, TDSSection, TDSEntry } from '@/types';

export const useGSTRates = () => useQuery({ queryKey: ['gst-rates'], queryFn: () => taxApi.getGSTRates() });
export const useTDSSections = () => useQuery({ queryKey: ['tds-sections'], queryFn: () => taxApi.getTDSSections() });
export const useTDSEntries = (params?: { status?: string; start_date?: string; end_date?: string }) => useQuery({ queryKey: ['tds-entries', params], queryFn: () => taxApi.getTDSEntries(params) });
export const useGSTR1Data = (period: string) => useQuery({ queryKey: ['gstr1', period], queryFn: () => taxApi.getGSTR1Data(period), enabled: !!period });

export const useCreateGSTRate = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (input: Partial<GSTRate>) => taxApi.createGSTRate(input), onSuccess: () => qc.invalidateQueries({ queryKey: ['gst-rates'] }) }); };
export const useCreateTDSSection = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (input: Partial<TDSSection>) => taxApi.createTDSSection(input), onSuccess: () => qc.invalidateQueries({ queryKey: ['tds-sections'] }) }); };
export const useCreateTDSEntry = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (input: Partial<TDSEntry>) => taxApi.createTDSEntry(input), onSuccess: () => qc.invalidateQueries({ queryKey: ['tds-entries'] }) }); };
export const useCalculateGST = () => useMutation({ mutationFn: (input: { base_amount: number; hsn_sac_code?: string; rate?: number; is_interstate: boolean; is_inclusive?: boolean }) => taxApi.calculateGST(input) });
export const useCalculateTDS = () => useMutation({ mutationFn: (input: { section_code: string; base_amount: number; deductee_type: 'INDIVIDUAL' | 'COMPANY'; has_pan: boolean }) => taxApi.calculateTDS(input) });
export const useValidateGSTIN = () => useMutation({ mutationFn: (gstin: string) => taxApi.validateGSTIN(gstin) });
export const useValidatePAN = () => useMutation({ mutationFn: (pan: string) => taxApi.validatePAN(pan) });
