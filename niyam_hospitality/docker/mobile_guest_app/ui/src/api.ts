const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8937';

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

export interface RoomServiceItem { id: string; name: string; category: string; price: number; description?: string; is_available: boolean; }
export interface GuestRequest { id: string; guest_name: string; room_number: string; request_type: string; description: string; status: string; created_at: string; }
export interface HotelService { id: string; name: string; category: string; description?: string; price?: number; booking_required: boolean; is_active: boolean; }
export interface MobileStats { active_users: number; orders_today: number; requests_pending: number; revenue_today: number; digital_keys_active: number; }

export async function getRoomServiceMenu(): Promise<RoomServiceItem[]> { const data = await fetchApi<{ success: boolean; menu: RoomServiceItem[] }>('/room-service/menu'); return data.menu; }
export async function getGuestRequests(): Promise<GuestRequest[]> { const data = await fetchApi<{ success: boolean; requests: GuestRequest[] }>('/requests'); return data.requests; }
export async function getServices(): Promise<HotelService[]> { const data = await fetchApi<{ success: boolean; services: HotelService[] }>('/services'); return data.services; }
export async function getStats(): Promise<MobileStats> { const data = await fetchApi<{ success: boolean; stats: MobileStats }>('/stats'); return data.stats; }
export async function updateRequestStatus(id: string, status: string): Promise<void> { await fetchApi(`/requests/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); }
