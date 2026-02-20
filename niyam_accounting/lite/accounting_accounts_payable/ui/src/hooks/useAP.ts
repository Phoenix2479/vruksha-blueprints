import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apApi } from '@/api/ap'
import type { Vendor } from '@/types'

export function useVendors() { return useQuery({ queryKey: ['vendors'], queryFn: apApi.getVendors }) }
export function useBills(params?: { vendor_id?: string; status?: string }) { return useQuery({ queryKey: ['bills', params], queryFn: () => apApi.getBills(params) }) }
export function useAging() { return useQuery({ queryKey: ['aging'], queryFn: apApi.getAging }) }
export function useVendorStatement(id: string | null) { return useQuery({ queryKey: ['vendor-statement', id], queryFn: () => apApi.getVendorStatement(id!), enabled: !!id }) }

export function useCreateVendor() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (input: Partial<Vendor>) => apApi.createVendor(input), onSuccess: () => qc.invalidateQueries({ queryKey: ['vendors'] }) })
}
export function useCreateBill() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: apApi.createBill, onSuccess: () => qc.invalidateQueries({ queryKey: ['bills'] }) })
}
export function usePostBill() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: apApi.postBill, onSuccess: () => qc.invalidateQueries({ queryKey: ['bills'] }) })
}
export function usePayBill() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ id, ...input }: any) => apApi.payBill(id, input), onSuccess: () => qc.invalidateQueries({ queryKey: ['bills'] }) })
}
