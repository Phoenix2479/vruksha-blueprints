import axios from 'axios'
import type { TaxCode, TdsSection, TdsTransaction, GstReturn, ApiResponse } from '@/types'

const api = axios.create({ baseURL: '/api' })

export const taxApi = {
  getTaxCodes: async () => { const { data } = await api.get<ApiResponse<TaxCode[]>>('/tax-codes'); return data },
  createTaxCode: async (input: Partial<TaxCode>) => { const { data } = await api.post<ApiResponse<TaxCode>>('/tax-codes', input); return data },
  initTaxCodes: async () => { const { data } = await api.post<ApiResponse<any>>('/init-tax-codes'); return data },
  getTdsSections: async () => { const { data } = await api.get<ApiResponse<TdsSection[]>>('/tds/sections'); return data },
  getTdsTransactions: async () => { const { data } = await api.get<ApiResponse<TdsTransaction[]>>('/tds/transactions'); return data },
  createTdsTransaction: async (input: any) => { const { data } = await api.post<ApiResponse<TdsTransaction>>('/tds/transactions', input); return data },
  depositTds: async (id: string, input: any) => { const { data } = await api.put<ApiResponse<TdsTransaction>>(`/tds/transactions/${id}/deposit`, input); return data },
  getTdsSummary: async () => { const { data } = await api.get<ApiResponse<any>>('/tds/summary'); return data },
  getGstReturns: async () => { const { data } = await api.get<ApiResponse<GstReturn[]>>('/gst-returns'); return data },
  createGstReturn: async (input: any) => { const { data } = await api.post<ApiResponse<GstReturn>>('/gst-returns', input); return data },
  getGstr1Data: async (params: any) => { const { data } = await api.get<ApiResponse<any>>('/gst-returns/gstr1-data', { params }); return data },
  getGstr3bData: async (params: any) => { const { data } = await api.get<ApiResponse<any>>('/gst-returns/gstr3b-data', { params }); return data },
  validateGstin: async (gstin: string) => { const { data } = await api.get<ApiResponse<any>>(`/validate/gstin/${gstin}`); return data },
  getGstByRate: async () => { const { data } = await api.get<ApiResponse<any>>('/reports/gst-by-rate'); return data },
  getTaxLiability: async () => { const { data } = await api.get<ApiResponse<any>>('/reports/tax-liability'); return data },
}
