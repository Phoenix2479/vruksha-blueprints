const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8919';

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

export interface Forecast { date: string; predicted_demand: number; demand_level: string; suggested_rate: number; confidence: number; }
export interface Recommendation { room_type: string; current_rate: number; competitor_avg: number; suggested_rate: number; action: string; reason: string; potential_impact: string; }
export interface PricingRule { id: string; name: string; rule_type: string; conditions: Record<string, unknown>; action_type: string; action_value: number; priority: number; is_active: boolean; }
export interface Performance { date: string; room_nights: number; revenue: number; adr: number; occupancy: number; revpar: number; }
export interface KPIs { occupancy: number; adr: number; revpar: number; revenue_mtd: number; revenue_change: number; room_nights_sold: number; }

export async function getForecast(fromDate?: string, toDate?: string): Promise<Forecast[]> { 
  const params = new URLSearchParams();
  if (fromDate) params.set('from_date', fromDate);
  if (toDate) params.set('to_date', toDate);
  const data = await fetchApi<{ success: boolean; forecast: Forecast[] }>(`/forecast?${params}`); 
  return data.forecast; 
}
export async function getRecommendations(date?: string): Promise<{ occupancy: number; recommendations: Recommendation[] }> {
  const data = await fetchApi<{ success: boolean; occupancy: number; recommendations: Recommendation[] }>(`/recommendations${date ? `?date=${date}` : ''}`);
  return { occupancy: data.occupancy, recommendations: data.recommendations };
}
export async function getRules(): Promise<PricingRule[]> { const data = await fetchApi<{ success: boolean; rules: PricingRule[] }>('/rules'); return data.rules; }
export async function getPerformance(days?: number): Promise<Performance[]> { const data = await fetchApi<{ success: boolean; performance: Performance[] }>(`/performance?period=${days || 30}`); return data.performance; }
export async function getKPIs(): Promise<KPIs> { const data = await fetchApi<{ success: boolean; kpis: KPIs }>('/kpis'); return data.kpis; }
export async function applyRecommendations(recs: { room_type: string; date: string; old_rate: number; new_rate: number }[]): Promise<void> {
  await fetchApi('/recommendations/apply', { method: 'POST', body: JSON.stringify({ recommendations: recs }) });
}
