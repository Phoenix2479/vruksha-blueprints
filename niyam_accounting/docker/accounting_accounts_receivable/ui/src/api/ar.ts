import axios from 'axios';
import type { Customer, Invoice, Receipt, AgingReport, ApiResponse } from '@/types';
const api = axios.create({ baseURL: '/api', headers: { 'Content-Type': 'application/json', 'x-tenant-id': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } });

export const arApi = {
  getCustomers: async (): Promise<ApiResponse<Customer[]>> => { const { data } = await api.get('/customers'); return data; },
  createCustomer: async (input: Partial<Customer>): Promise<ApiResponse<Customer>> => { const { data } = await api.post('/customers', input); return data; },
  getInvoices: async (params?: { customer_id?: string; status?: string }): Promise<ApiResponse<Invoice[]>> => { const { data } = await api.get('/invoices', { params }); return data; },
  createInvoice: async (input: Partial<Invoice> & { lines?: Array<{ description: string; quantity: number; unit_price: number; tax_rate?: number }> }): Promise<ApiResponse<Invoice>> => { const { data } = await api.post('/invoices', input); return data; },
  getReceipts: async (params?: { customer_id?: string }): Promise<ApiResponse<Receipt[]>> => { const { data } = await api.get('/receipts', { params }); return data; },
  createReceipt: async (input: Partial<Receipt>): Promise<ApiResponse<Receipt>> => { const { data } = await api.post('/receipts', input); return data; },
  getAgingReport: async (asOfDate?: string): Promise<ApiResponse<AgingReport[]>> => { const { data } = await api.get('/reports/aging', { params: asOfDate ? { as_of_date: asOfDate } : undefined }); return data; },
};
