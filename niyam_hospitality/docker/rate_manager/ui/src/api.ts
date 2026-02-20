const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8935';

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
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (data?.error?.message) throw new ApiError(data.error.message, data.error.code || 'UNKNOWN_ERROR', res.status);
    if (data?.error) throw new ApiError(typeof data.error === 'string' ? data.error : 'API request failed', 'UNKNOWN_ERROR', res.status);
    throw new ApiError(res.statusText || 'API request failed', 'HTTP_ERROR', res.status);
  }
  if (!data?.success && data?.error) throw new ApiError(data.error.message || data.error, data.error.code || 'UNKNOWN_ERROR', res.status);
  return data;
}

export interface BARRate {
  id: string;
  room_type: string;
  rate_date: string;
  bar_rate: number;
  min_rate?: number;
  max_rate?: number;
  is_closed: boolean;
}

export interface Season {
  id: string;
  name: string;
  season_type: string;
  start_date: string;
  end_date: string;
  rate_multiplier: number;
  color?: string;
}

export interface Competitor {
  id: string;
  name: string;
  star_rating?: number;
  website?: string;
}

export interface CompetitorRate {
  id: string;
  competitor_id: string;
  competitor_name: string;
  rate_date: string;
  room_type: string;
  rate: number;
}

export interface RatePackage {
  id: string;
  code: string;
  name: string;
  description?: string;
  rate_adjustment_type: string;
  rate_adjustment_value: number;
  inclusions: string[];
  is_active: boolean;
}

export async function getBARRates(fromDate: string, toDate: string): Promise<BARRate[]> {
  const data = await fetchApi<{ success: boolean; rates: BARRate[] }>(`/bar-rates?from=${fromDate}&to=${toDate}`);
  return data.rates;
}

export async function getSeasons(): Promise<Season[]> {
  const data = await fetchApi<{ success: boolean; seasons: Season[] }>('/seasons');
  return data.seasons;
}

export async function getCompetitors(): Promise<Competitor[]> {
  const data = await fetchApi<{ success: boolean; competitors: Competitor[] }>('/competitors');
  return data.competitors;
}

export async function getCompetitorRates(fromDate: string, toDate: string): Promise<CompetitorRate[]> {
  const data = await fetchApi<{ success: boolean; rates: CompetitorRate[] }>(`/competitor-rates?from=${fromDate}&to=${toDate}`);
  return data.rates;
}

export async function getPackages(): Promise<RatePackage[]> {
  const data = await fetchApi<{ success: boolean; packages: RatePackage[] }>('/packages');
  return data.packages;
}

export async function updateBARRate(id: string, rate: Partial<BARRate>): Promise<void> {
  await fetchApi(`/bar-rates/${id}`, { method: 'PATCH', body: JSON.stringify(rate) });
}
