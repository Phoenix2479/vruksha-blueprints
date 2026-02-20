import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { accountsApi } from '@/api/accounts'
import type { Account } from '@/types'

export function useAccounts(params?: { type?: string; search?: string }) {
  return useQuery({
    queryKey: ['accounts', params],
    queryFn: () => accountsApi.getAccounts(params),
  })
}

export function useCreateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<Account>) => accountsApi.createAccount(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })
}

export function useUpdateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<Account> & { id: string }) => accountsApi.updateAccount(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })
}

export function useDeleteAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => accountsApi.deleteAccount(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })
}

export function useInitializeDefaults() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => accountsApi.initializeDefaults(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })
}
