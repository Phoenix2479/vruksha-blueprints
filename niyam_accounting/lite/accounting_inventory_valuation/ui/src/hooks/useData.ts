import { useQuery } from '@tanstack/react-query'
import { fetchValuation, fetchMethods } from '@/api/service'

export function useValuation() {
  return useQuery({ queryKey: ['valuation'], queryFn: () => fetchValuation() })
}

export function useMethods() {
  return useQuery({ queryKey: ['methods'], queryFn: () => fetchMethods() })
}
