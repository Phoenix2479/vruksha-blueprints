const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8891';

export class ApiError extends Error {
  code: string;
  statusCode: number;
  constructor(message: string, code: string, statusCode: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (data?.error?.message) throw new ApiError(data.error.message, data.error.code || 'UNKNOWN_ERROR', res.status);
    if (data?.error) throw new ApiError(typeof data.error === 'string' ? data.error : 'API request failed', 'UNKNOWN_ERROR', res.status);
    throw new ApiError(res.statusText || 'API request failed', 'HTTP_ERROR', res.status);
  }
  if (!data?.success && data?.error) throw new ApiError(data.error.message || data.error, data.error.code || 'UNKNOWN_ERROR', res.status);
  return data;
}

export interface Property { id: string; code: string; name: string; type: string; city: string; country: string; total_rooms?: number; occupied_rooms?: number; revenue_mtd?: number; }
export interface Dashboard { total_properties: number; total_rooms: number; portfolio_occupancy: number; revenue_mtd: number; arrivals_today: number; }
export interface PropertyComparison { id: string; name: string; code: string; city: string; total_rooms: number; occupancy: number; revenue_mtd: number; adr: number; revpar: number; }
export interface Alert { id: string; property_name?: string; alert_type: string; severity: string; title: string; message?: string; created_at: string; }

export async function getProperties(): Promise<Property[]> { const data = await fetchApi<{ success: boolean; properties: Property[] }>('/properties'); return data.properties; }
export async function getDashboard(): Promise<Dashboard> { const data = await fetchApi<{ success: boolean; dashboard: Dashboard }>('/dashboard'); return data.dashboard; }
export async function getComparison(): Promise<PropertyComparison[]> { const data = await fetchApi<{ success: boolean; comparison: PropertyComparison[] }>('/dashboard/comparison'); return data.comparison; }
export async function getAlerts(): Promise<Alert[]> { const data = await fetchApi<{ success: boolean; alerts: Alert[] }>('/alerts'); return data.alerts; }
export async function resolveAlert(id: string): Promise<void> { await fetchApi(`/alerts/${id}/resolve`, { method: 'PATCH' }); }
export async function createProperty(prop: Partial<Property>): Promise<Property> { const data = await fetchApi<{ success: boolean; property: Property }>('/properties', { method: 'POST', body: JSON.stringify(prop) }); return data.property; }
