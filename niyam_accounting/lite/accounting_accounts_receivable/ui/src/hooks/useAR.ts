import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { arApi } from '@/api/ar'
import type { Customer } from '@/types'

export function useCustomers() { return useQuery({ queryKey: ['customers'], queryFn: arApi.getCustomers }) }
export function useInvoices(params?: { customer_id?: string; status?: string }) { return useQuery({ queryKey: ['invoices', params], queryFn: () => arApi.getInvoices(params) }) }
export function useAging() { return useQuery({ queryKey: ['ar-aging'], queryFn: arApi.getAging }) }

export function useCreateCustomer() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (input: Partial<Customer>) => arApi.createCustomer(input), onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }) })
}
export function useCreateInvoice() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: arApi.createInvoice, onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }) })
}
export function usePostInvoice() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: arApi.postInvoice, onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }) })
}
export function usePayInvoice() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ id, ...input }: any) => arApi.payInvoice(id, input), onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }) })
}
