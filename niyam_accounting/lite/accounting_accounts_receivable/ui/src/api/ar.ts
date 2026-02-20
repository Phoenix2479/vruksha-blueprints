import axios from 'axios'
import type { Customer, Invoice, AgingRow, ApiResponse } from '@/types'

const api = axios.create({ baseURL: '/api' })

export const arApi = {
  getCustomers: async () => { const { data } = await api.get<ApiResponse<Customer[]>>('/customers'); return data },
  createCustomer: async (input: Partial<Customer>) => { const { data } = await api.post<ApiResponse<Customer>>('/customers', input); return data },
  updateCustomer: async (id: string, input: Partial<Customer>) => { const { data } = await api.put<ApiResponse<Customer>>(`/customers/${id}`, input); return data },
  getInvoices: async (params?: { customer_id?: string; status?: string }) => { const { data } = await api.get<ApiResponse<Invoice[]>>('/invoices', { params }); return data },
  createInvoice: async (input: any) => { const { data } = await api.post<ApiResponse<Invoice>>('/invoices', input); return data },
  postInvoice: async (id: string) => { const { data } = await api.post<ApiResponse<Invoice>>(`/invoices/${id}/post`); return data },
  createReceipt: async (input: any) => { const { data } = await api.post<ApiResponse<any>>('/receipts', input); return data },
  payInvoice: async (id: string, input: any) => { const { data } = await api.post<ApiResponse<any>>(`/invoices/${id}/pay`, input); return data },
  getAging: async () => { const { data } = await api.get<ApiResponse<AgingRow[]>>('/aging'); return data },
  getCustomerStatement: async (id: string) => { const { data } = await api.get<ApiResponse<any[]>>(`/customers/${id}/statement`); return data },
}
