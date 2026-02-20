const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8930';

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

export interface RoomType {
  id: string;
  code: string;
  name: string;
  description?: string;
  base_price: number;
  max_occupancy: number;
  amenities: string[];
  images: string[];
  is_active: boolean;
}

export interface PromoCode {
  id: string;
  code: string;
  name?: string;
  discount_type: string;
  discount_value: number;
  valid_from?: string;
  valid_to?: string;
  max_uses?: number;
  current_uses: number;
  is_active: boolean;
}

export interface WidgetConfig {
  id: string;
  theme_color: string;
  logo_url?: string;
  show_rates: boolean;
  min_advance_days: number;
  max_advance_days: number;
  currencies: string[];
  languages: string[];
}

export interface BookingStats {
  bookings_today: number;
  bookings_month: number;
  revenue_month: number;
  conversion_rate: number;
  avg_booking_value: number;
}

export async function getRoomTypes(): Promise<RoomType[]> {
  const data = await fetchApi<{ success: boolean; room_types: RoomType[] }>('/room-types');
  return data.room_types;
}

export async function getPromoCodes(): Promise<PromoCode[]> {
  const data = await fetchApi<{ success: boolean; promo_codes: PromoCode[] }>('/promo-codes');
  return data.promo_codes;
}

export async function getWidgetConfig(): Promise<WidgetConfig> {
  const data = await fetchApi<{ success: boolean; config: WidgetConfig }>('/widget/config');
  return data.config;
}

export async function getStats(): Promise<BookingStats> {
  const data = await fetchApi<{ success: boolean; stats: BookingStats }>('/stats');
  return data.stats;
}

export async function updateWidgetConfig(config: Partial<WidgetConfig>): Promise<void> {
  await fetchApi('/widget/config', { method: 'PUT', body: JSON.stringify(config) });
}

export async function createPromoCode(code: Partial<PromoCode>): Promise<PromoCode> {
  const data = await fetchApi<{ success: boolean; promo_code: PromoCode }>('/promo-codes', { method: 'POST', body: JSON.stringify(code) });
  return data.promo_code;
}
