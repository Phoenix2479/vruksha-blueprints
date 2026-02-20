import { useQuery } from '@tanstack/react-query'
import { fetchAssets, fetchCategories, fetchForecast } from '@/api/service'

export function useAssets() {
  return useQuery({ queryKey: ['assets'], queryFn: () => fetchAssets() })
}

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: () => fetchCategories() })
}

export function useForecast() {
  return useQuery({ queryKey: ['forecast'], queryFn: () => fetchForecast() })
}
