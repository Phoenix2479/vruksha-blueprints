import axios from 'axios'
import type { Vendor, Bill, Payment, AgingRow, ApiResponse } from '@/types'

const api = axios.create({ baseURL: '/api' })

export const apApi = {
  getVendors: async () => { const { data } = await api.get<ApiResponse<Vendor[]>>('/vendors'); return data },
  getVendor: async (id: string) => { const { data } = await api.get<ApiResponse<Vendor>>(`/vendors/${id}`); return data },
  createVendor: async (input: Partial<Vendor>) => { const { data } = await api.post<ApiResponse<Vendor>>('/vendors', input); return data },
  updateVendor: async (id: string, input: Partial<Vendor>) => { const { data } = await api.put<ApiResponse<Vendor>>(`/vendors/${id}`, input); return data },

  getBills: async (params?: { vendor_id?: string; status?: string }) => { const { data } = await api.get<ApiResponse<Bill[]>>('/bills', { params }); return data },
  getBill: async (id: string) => { const { data } = await api.get<ApiResponse<Bill>>(`/bills/${id}`); return data },
  createBill: async (input: any) => { const { data } = await api.post<ApiResponse<Bill>>('/bills', input); return data },
  postBill: async (id: string) => { const { data } = await api.post<ApiResponse<Bill>>(`/bills/${id}/post`); return data },

  createPayment: async (input: any) => { const { data } = await api.post<ApiResponse<Payment>>('/payments', input); return data },
  payBill: async (id: string, input: any) => { const { data } = await api.post<ApiResponse<Payment>>(`/bills/${id}/pay`, input); return data },

  getAging: async () => { const { data } = await api.get<ApiResponse<AgingRow[]>>('/aging'); return data },
  getVendorStatement: async (id: string) => { const { data } = await api.get<ApiResponse<any[]>>(`/vendors/${id}/statement`); return data },
}
