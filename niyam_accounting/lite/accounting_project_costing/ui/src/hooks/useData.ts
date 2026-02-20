import { useQuery } from '@tanstack/react-query'
import { fetchProjects, fetchSummary } from '@/api/service'

export function useProjects() {
  return useQuery({ queryKey: ['projects'], queryFn: () => fetchProjects() })
}

export function useSummary() {
  return useQuery({ queryKey: ['summary'], queryFn: () => fetchSummary() })
}
