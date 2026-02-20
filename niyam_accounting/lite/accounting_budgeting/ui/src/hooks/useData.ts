import { useQuery } from '@tanstack/react-query'
import { fetchVersions, fetchForecast, fetchAlerts, fetchReports } from '@/api/service'

export function useVersions() {
  return useQuery({ queryKey: ['versions'], queryFn: () => fetchVersions() })
}

export function useForecast() {
  return useQuery({ queryKey: ['forecast'], queryFn: () => fetchForecast() })
}

export function useAlerts() {
  return useQuery({ queryKey: ['alerts'], queryFn: () => fetchAlerts() })
}

export function useReports() {
  return useQuery({ queryKey: ['reports'], queryFn: () => fetchReports() })
}
