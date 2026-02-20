import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { bankApi } from '@/api/bank'

export function useBankAccounts() { return useQuery({ queryKey: ['bank-accounts'], queryFn: bankApi.getBankAccounts }) }
export function useBankTransactions(bankId: string | null) { return useQuery({ queryKey: ['bank-txns', bankId], queryFn: () => bankApi.getTransactions(bankId!), enabled: !!bankId }) }
export function useUnreconciled() { return useQuery({ queryKey: ['unreconciled'], queryFn: bankApi.getUnreconciled }) }
export function useReconciliationSummary(bankId: string | null) { return useQuery({ queryKey: ['recon-summary', bankId], queryFn: () => bankApi.getSummary(bankId!), enabled: !!bankId }) }

export function useCreateBankAccount() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => bankApi.createBankAccount(input), onSuccess: () => qc.invalidateQueries({ queryKey: ['bank-accounts'] }) }) }
export function useCreateTransaction() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ bankId, ...input }: any) => bankApi.createTransaction(bankId, input), onSuccess: () => qc.invalidateQueries({ queryKey: ['bank-txns'] }) }) }
export function useReconcile() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => bankApi.reconcile(id, input), onSuccess: () => { qc.invalidateQueries({ queryKey: ['bank-txns'] }); qc.invalidateQueries({ queryKey: ['unreconciled'] }) } }) }
