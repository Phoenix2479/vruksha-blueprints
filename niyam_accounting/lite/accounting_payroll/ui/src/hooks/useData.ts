import { useQuery } from '@tanstack/react-query'
import { fetchEmployees, fetchStructures, fetchRuns, fetchSummary, fetchSettings } from '@/api/service'

export function useEmployees() {
  return useQuery({ queryKey: ['employees'], queryFn: () => fetchEmployees() })
}

export function useStructures() {
  return useQuery({ queryKey: ['structures'], queryFn: () => fetchStructures() })
}

export function useRuns() {
  return useQuery({ queryKey: ['runs'], queryFn: () => fetchRuns() })
}

export function useSummary() {
  return useQuery({ queryKey: ['summary'], queryFn: () => fetchSummary() })
}

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => fetchSettings() })
}
