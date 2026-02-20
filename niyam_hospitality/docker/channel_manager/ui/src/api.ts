const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8890';

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

export interface Channel { code: string; name: string; type: string; logo: string; }
export interface Connection { id: string; channel_code: string; channel_name: string; status: string; property_id?: string; bookings_30d?: number; revenue_30d?: number; last_sync_at?: string; }
export interface ChannelBooking { id: string; channel_name: string; channel_booking_id: string; guest_name: string; room_type: string; check_in: string; check_out: string; total_amount: number; commission: number; status: string; created_at: string; }
export interface SyncLog { id: string; channel_name?: string; sync_type: string; direction: string; records_processed: number; status: string; created_at: string; }
export interface ChannelStats { total_channels: number; active_channels: number; bookings_30d: number; revenue_30d: number; commission_30d: number; pending_bookings: number; }

export async function getAvailableChannels(): Promise<Channel[]> { const data = await fetchApi<{ success: boolean; channels: Channel[] }>('/channels/available'); return data.channels; }
export async function getConnections(): Promise<Connection[]> { const data = await fetchApi<{ success: boolean; connections: Connection[] }>('/connections'); return data.connections; }
export async function getChannelBookings(): Promise<ChannelBooking[]> { const data = await fetchApi<{ success: boolean; bookings: ChannelBooking[] }>('/bookings'); return data.bookings; }
export async function getSyncLogs(): Promise<SyncLog[]> { const data = await fetchApi<{ success: boolean; logs: SyncLog[] }>('/sync-logs'); return data.logs; }
export async function getStats(): Promise<ChannelStats> { const data = await fetchApi<{ success: boolean; stats: ChannelStats }>('/stats'); return data.stats; }
export async function createConnection(conn: Partial<Connection>): Promise<Connection> { const data = await fetchApi<{ success: boolean; connection: Connection }>('/connections', { method: 'POST', body: JSON.stringify(conn) }); return data.connection; }
export async function triggerSync(channelIds: string[], type: 'push' | 'pull'): Promise<void> { await fetchApi(`/sync/${type}`, { method: 'POST', body: JSON.stringify({ channel_ids: channelIds }) }); }
