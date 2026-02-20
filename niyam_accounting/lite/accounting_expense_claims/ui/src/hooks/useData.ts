import { useQuery } from '@tanstack/react-query'
import { fetchClaims, fetchCategories, fetchSummary } from '@/api/service'

export function useClaims() {
  return useQuery({ queryKey: ['claims'], queryFn: () => fetchClaims() })
}

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: () => fetchCategories() })
}

export function useSummary() {
  return useQuery({ queryKey: ['summary'], queryFn: () => fetchSummary() })
}
