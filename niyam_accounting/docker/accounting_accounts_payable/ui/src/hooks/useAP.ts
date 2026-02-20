import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apApi } from '@/api/ap';
import type { Vendor, Bill, Payment } from '@/types';

export const useVendors = () => useQuery({ queryKey: ['vendors'], queryFn: () => apApi.getVendors() });
export const useBills = (params?: { vendor_id?: string; status?: string }) => useQuery({ queryKey: ['bills', params], queryFn: () => apApi.getBills(params) });
export const usePayments = (params?: { vendor_id?: string }) => useQuery({ queryKey: ['payments', params], queryFn: () => apApi.getPayments(params) });
export const useAgingReport = (asOfDate?: string) => useQuery({ queryKey: ['aging-report', asOfDate], queryFn: () => apApi.getAgingReport(asOfDate) });

export const useCreateVendor = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (input: Partial<Vendor>) => apApi.createVendor(input), onSuccess: () => qc.invalidateQueries({ queryKey: ['vendors'] }) }); };
export const useCreateBill = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (input: Partial<Bill>) => apApi.createBill(input), onSuccess: () => qc.invalidateQueries({ queryKey: ['bills'] }) }); };
export const useCreatePayment = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (input: Partial<Payment>) => apApi.createPayment(input), onSuccess: () => qc.invalidateQueries({ queryKey: ['payments'] }) }); };
