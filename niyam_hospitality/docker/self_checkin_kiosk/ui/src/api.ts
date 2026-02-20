const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8932';

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

export interface Kiosk { id: string; name: string; location: string; status: string; last_heartbeat?: string; checkins_today: number; }
export interface DigitalKey { id: string; guest_name: string; room_number: string; key_type: string; valid_from: string; valid_to: string; status: string; }
export interface CheckinSession { id: string; guest_name: string; kiosk_name: string; started_at: string; completed_at?: string; status: string; room_number?: string; }
export interface KioskStats { total_kiosks: number; online_kiosks: number; checkins_today: number; avg_checkin_time: number; digital_keys_issued: number; }

export async function getKiosks(): Promise<Kiosk[]> { const data = await fetchApi<{ success: boolean; kiosks: Kiosk[] }>('/kiosks'); return data.kiosks; }
export async function getDigitalKeys(): Promise<DigitalKey[]> { const data = await fetchApi<{ success: boolean; keys: DigitalKey[] }>('/digital-keys'); return data.keys; }
export async function getRecentSessions(): Promise<CheckinSession[]> { const data = await fetchApi<{ success: boolean; sessions: CheckinSession[] }>('/sessions?limit=50'); return data.sessions; }
export async function getStats(): Promise<KioskStats> { const data = await fetchApi<{ success: boolean; stats: KioskStats }>('/stats'); return data.stats; }
