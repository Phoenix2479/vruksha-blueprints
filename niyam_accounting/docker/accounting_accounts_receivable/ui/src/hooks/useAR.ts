import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { arApi } from '@/api/ar';
import type { Customer, Invoice, Receipt } from '@/types';

export const useCustomers = () => useQuery({ queryKey: ['customers'], queryFn: () => arApi.getCustomers() });
export const useInvoices = (params?: { customer_id?: string; status?: string }) => useQuery({ queryKey: ['invoices', params], queryFn: () => arApi.getInvoices(params) });
export const useReceipts = (params?: { customer_id?: string }) => useQuery({ queryKey: ['receipts', params], queryFn: () => arApi.getReceipts(params) });
export const useAgingReport = (asOfDate?: string) => useQuery({ queryKey: ['ar-aging-report', asOfDate], queryFn: () => arApi.getAgingReport(asOfDate) });

export const useCreateCustomer = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (input: Partial<Customer>) => arApi.createCustomer(input), onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }) }); };
export const useCreateInvoice = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (input: Partial<Invoice> & { lines?: Array<{ description: string; quantity: number; unit_price: number; tax_rate?: number }> }) => arApi.createInvoice(input), onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }) }); };
export const useCreateReceipt = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (input: Partial<Receipt>) => arApi.createReceipt(input), onSuccess: () => qc.invalidateQueries({ queryKey: ['receipts'] }) }); };
