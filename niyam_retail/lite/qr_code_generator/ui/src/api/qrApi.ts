import axios from 'axios';
import type { QRCode, QRType, QRBranding, QRCodeMetadata, AppSettings, AnalyticsData, Product } from '../types';

const api = axios.create({
  baseURL: '/api',
});

// QR Code CRUD
export async function getQRCodes(params?: { type?: QRType; search?: string }) {
  const { data } = await api.get<{ success: boolean; data: QRCode[] }>('/qr', { params });
  return data.data;
}

export async function getQRCode(id: string) {
  const { data } = await api.get<{ success: boolean; data: QRCode }>(`/qr/${id}`);
  return data.data;
}

export async function createQRCode(qr: {
  type: QRType;
  label: string;
  target_url?: string;
  metadata?: QRCodeMetadata;
  branding?: Partial<QRBranding>;
}) {
  const { data } = await api.post<{ success: boolean; data: { id: string; redirect_url: string } }>('/qr', qr);
  return data.data;
}

export async function updateQRCode(id: string, updates: Partial<QRCode>) {
  const { data } = await api.put<{ success: boolean }>(`/qr/${id}`, updates);
  return data.success;
}

export async function deleteQRCode(id: string) {
  const { data } = await api.delete<{ success: boolean }>(`/qr/${id}`);
  return data.success;
}

// Bulk operations
export async function bulkGenerateQRs(params: {
  product_ids: string[];
  type: 'product' | 'maker';
  branding?: Partial<QRBranding>;
}) {
  const { data } = await api.post<{ success: boolean; data: { created: number; ids: string[] } }>('/qr/bulk', params);
  return data.data;
}

// Export
export async function exportPDF(qr_ids: string[], layout?: 'grid' | 'single', columns?: number) {
  const response = await api.post('/export/pdf', { qr_ids, layout, columns }, { responseType: 'blob' });
  return response.data;
}

export async function exportZIP(qr_ids: string[], size?: number) {
  const response = await api.post('/export/zip', { qr_ids, size }, { responseType: 'blob' });
  return response.data;
}

// Settings
export async function getSettings() {
  const { data } = await api.get<{ success: boolean; data: AppSettings }>('/settings');
  return data.data;
}

export async function updateSettings(settings: Partial<AppSettings>) {
  const { data } = await api.put<{ success: boolean }>('/settings', settings);
  return data.success;
}

// Analytics
export async function getAnalytics() {
  const { data } = await api.get<{ success: boolean; data: AnalyticsData }>('/analytics');
  return data.data;
}

export async function getQRAnalytics(id: string) {
  const { data } = await api.get<{
    success: boolean;
    data: {
      qr_id: string;
      label: string;
      total_scans: number;
      recent_scans: { scanned_at: string; user_agent: string; ip_address: string }[];
      scans_by_day: { date: string; count: number }[];
    };
  }>(`/analytics/${id}`);
  return data.data;
}

// Products
export async function getProducts() {
  const { data } = await api.get<{ success: boolean; data: Product[]; source: string }>('/products');
  return data.data;
}

// Logo upload
export async function uploadLogo(file: File) {
  const { data } = await api.post<{ success: boolean; data: { path: string; url: string } }>(
    '/logo/upload',
    file,
    {
      headers: { 'Content-Type': file.type },
    }
  );
  return data.data;
}

// Get QR image URL
export function getQRImageUrl(id: string, format: 'png' | 'svg' = 'png', size = 300) {
  return `/api/qr/${id}/image?format=${format}&size=${size}`;
}

// Get redirect URL
export function getRedirectUrl(id: string) {
  return `/qr/r/${id}`;
}
