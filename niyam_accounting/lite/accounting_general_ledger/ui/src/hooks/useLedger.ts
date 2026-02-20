import { useQuery } from '@tanstack/react-query'
import { ledgerApi } from '@/api/ledger'

export function useLedger(accountId: string | null, params?: { from_date?: string; to_date?: string }) {
  return useQuery({ queryKey: ['ledger', accountId, params], queryFn: () => ledgerApi.getLedger(accountId!, params), enabled: !!accountId })
}

export function useTrialBalance(params?: { as_of_date?: string }) {
  return useQuery({ queryKey: ['trial-balance', params], queryFn: () => ledgerApi.getTrialBalance(params) })
}

export function useBalances() {
  return useQuery({ queryKey: ['balances'], queryFn: () => ledgerApi.getBalances() })
}
