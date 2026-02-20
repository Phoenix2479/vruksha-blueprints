import axios from 'axios';
import type { Vendor, Bill, Payment, AgingReport, ApiResponse } from '@/types';
const api = axios.create({ baseURL: '/api', headers: { 'Content-Type': 'application/json', 'x-tenant-id': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } });

export const apApi = {
  getVendors: async (): Promise<ApiResponse<Vendor[]>> => { const { data } = await api.get('/vendors'); return data; },
  createVendor: async (input: Partial<Vendor>): Promise<ApiResponse<Vendor>> => { const { data } = await api.post('/vendors', input); return data; },
  getBills: async (params?: { vendor_id?: string; status?: string }): Promise<ApiResponse<Bill[]>> => { const { data } = await api.get('/bills', { params }); return data; },
  createBill: async (input: Partial<Bill>): Promise<ApiResponse<Bill>> => { const { data } = await api.post('/bills', input); return data; },
  getPayments: async (params?: { vendor_id?: string }): Promise<ApiResponse<Payment[]>> => { const { data } = await api.get('/payments', { params }); return data; },
  createPayment: async (input: Partial<Payment>): Promise<ApiResponse<Payment>> => { const { data } = await api.post('/payments', input); return data; },
  getAgingReport: async (asOfDate?: string): Promise<ApiResponse<AgingReport[]>> => { const { data } = await api.get('/reports/aging', { params: asOfDate ? { as_of_date: asOfDate } : undefined }); return data; },
  getVendorStatement: async (vendorId: string, params?: { start_date?: string; end_date?: string }): Promise<ApiResponse<{ vendor: Vendor; transactions: Array<{ date: string; type: string; reference: string; debit: number; credit: number; balance: number }> }>> => { const { data } = await api.get(`/vendors/${vendorId}/statement`, { params }); return data; },
};
