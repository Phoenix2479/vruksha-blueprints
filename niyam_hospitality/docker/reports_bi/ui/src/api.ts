const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8938';

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

export interface ExecutiveDashboard {
  occupancy_rate: number;
  adr: number;
  revpar: number;
  total_revenue: number;
  room_revenue: number;
  fnb_revenue: number;
  arrivals_today: number;
  departures_today: number;
  inhouse_guests: number;
  available_rooms: number;
}

export interface OccupancyTrend {
  date: string;
  occupancy: number;
  rooms_sold: number;
  rooms_available: number;
}

export interface RevenueTrend {
  date: string;
  room_revenue: number;
  fnb_revenue: number;
  other_revenue: number;
  total: number;
}

export interface ReportDefinition {
  id: string;
  name: string;
  type: string;
  description?: string;
  parameters?: Record<string, unknown>;
  created_at: string;
}

export interface ScheduledReport {
  id: string;
  report_id: string;
  report_name: string;
  schedule: string;
  recipients: string[];
  format: string;
  last_run?: string;
  next_run?: string;
  is_active: boolean;
}

export async function getExecutiveDashboard(): Promise<ExecutiveDashboard> {
  const data = await fetchApi<{ success: boolean; dashboard: ExecutiveDashboard }>('/dashboard/executive');
  return data.dashboard;
}

export async function getOccupancyTrend(days: number = 30): Promise<OccupancyTrend[]> {
  const data = await fetchApi<{ success: boolean; trend: OccupancyTrend[] }>(`/reports/occupancy?days=${days}`);
  return data.trend;
}

export async function getRevenueTrend(days: number = 30): Promise<RevenueTrend[]> {
  const data = await fetchApi<{ success: boolean; trend: RevenueTrend[] }>(`/reports/revenue?days=${days}`);
  return data.trend;
}

export async function getReports(): Promise<ReportDefinition[]> {
  const data = await fetchApi<{ success: boolean; reports: ReportDefinition[] }>('/reports');
  return data.reports;
}

export async function getScheduledReports(): Promise<ScheduledReport[]> {
  const data = await fetchApi<{ success: boolean; schedules: ScheduledReport[] }>('/reports/schedules');
  return data.schedules;
}

export async function exportReport(reportId: string, format: string, params?: Record<string, unknown>): Promise<Blob> {
  const res = await fetch(`${API_BASE}/reports/${reportId}/export?format=${format}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params || {}),
  });
  return res.blob();
}
