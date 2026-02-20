import axios from 'axios';
import type { GSTRate, TDSSection, TDSEntry, GSTCalculation, GSTR1Data, ApiResponse } from '@/types';
const api = axios.create({ baseURL: '/api', headers: { 'Content-Type': 'application/json', 'x-tenant-id': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } });

export const taxApi = {
  getGSTRates: async (): Promise<ApiResponse<GSTRate[]>> => { const { data } = await api.get('/gst/rates'); return data; },
  createGSTRate: async (input: Partial<GSTRate>): Promise<ApiResponse<GSTRate>> => { const { data } = await api.post('/gst/rates', input); return data; },
  calculateGST: async (input: { base_amount: number; hsn_sac_code?: string; rate?: number; is_interstate: boolean; is_inclusive?: boolean }): Promise<ApiResponse<GSTCalculation>> => { const { data } = await api.post('/gst/calculate', input); return data; },
  getGSTR1Data: async (period: string): Promise<ApiResponse<GSTR1Data>> => { const { data } = await api.get(`/gst/gstr1/${period}`); return data; },
  getTDSSections: async (): Promise<ApiResponse<TDSSection[]>> => { const { data } = await api.get('/tds/sections'); return data; },
  createTDSSection: async (input: Partial<TDSSection>): Promise<ApiResponse<TDSSection>> => { const { data } = await api.post('/tds/sections', input); return data; },
  getTDSEntries: async (params?: { status?: string; start_date?: string; end_date?: string }): Promise<ApiResponse<TDSEntry[]>> => { const { data } = await api.get('/tds/entries', { params }); return data; },
  createTDSEntry: async (input: Partial<TDSEntry>): Promise<ApiResponse<TDSEntry>> => { const { data } = await api.post('/tds/entries', input); return data; },
  calculateTDS: async (input: { section_code: string; base_amount: number; deductee_type: 'INDIVIDUAL' | 'COMPANY'; has_pan: boolean }): Promise<ApiResponse<{ rate: number; tds_amount: number }>> => { const { data } = await api.post('/tds/calculate', input); return data; },
  validateGSTIN: async (gstin: string): Promise<ApiResponse<{ valid: boolean; details?: { state: string; entity_type: string } }>> => { const { data } = await api.post('/validate/gstin', { gstin }); return data; },
  validatePAN: async (pan: string): Promise<ApiResponse<{ valid: boolean; type: string }>> => { const { data } = await api.post('/validate/pan', { pan }); return data; },
};
