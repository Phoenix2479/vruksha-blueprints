import { useQuery } from '@tanstack/react-query'
import { fetchOrders, fetchPending, fetchReport } from '@/api/service'

export function useOrders() {
  return useQuery({ queryKey: ['orders'], queryFn: () => fetchOrders() })
}

export function usePending() {
  return useQuery({ queryKey: ['pending'], queryFn: () => fetchPending() })
}

export function useReport() {
  return useQuery({ queryKey: ['report'], queryFn: () => fetchReport() })
}
