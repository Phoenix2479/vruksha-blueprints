import axios from 'axios'
import type { Account, ApiResponse } from '@/types'

const api = axios.create({ baseURL: '/api' })

export const accountsApi = {
  getAccounts: async (params?: { type?: string; search?: string }) => {
    const { data } = await api.get<ApiResponse<Account[]>>('/accounts', { params })
    return data
  },
  getAccount: async (id: string) => {
    const { data } = await api.get<ApiResponse<Account>>(`/accounts/${id}`)
    return data
  },
  createAccount: async (input: Partial<Account>) => {
    const { data } = await api.post<ApiResponse<Account>>('/accounts', input)
    return data
  },
  updateAccount: async (id: string, input: Partial<Account>) => {
    const { data } = await api.put<ApiResponse<Account>>(`/accounts/${id}`, input)
    return data
  },
  deleteAccount: async (id: string) => {
    const { data } = await api.delete<ApiResponse<null>>(`/accounts/${id}`)
    return data
  },
  getAccountTypes: async () => {
    const { data } = await api.get<ApiResponse<string[]>>('/account-types')
    return data
  },
  initializeDefaults: async () => {
    const { data } = await api.post<ApiResponse<{ created: number }>>('/init-coa')
    return data
  },
}
