const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8933';

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

export interface Group {
  id: string;
  group_name: string;
  organizer_name?: string;
  organizer_email?: string;
  organizer_phone?: string;
  arrival_date: string;
  departure_date: string;
  total_rooms: number;
  picked_up_rooms: number;
  status: string;
  group_rate?: number;
  cutoff_date?: string;
  notes?: string;
  created_at: string;
}

export interface RoomBlock {
  id: string;
  group_id: string;
  room_type: string;
  blocked_count: number;
  picked_up_count: number;
  rate: number;
}

export interface RoomingListEntry {
  id: string;
  group_id: string;
  guest_name: string;
  email?: string;
  room_type: string;
  check_in: string;
  check_out: string;
  special_requests?: string;
  booking_id?: string;
  status: string;
}

export async function getGroups(status?: string): Promise<Group[]> {
  const url = status ? `/groups?status=${status}` : '/groups';
  const data = await fetchApi<{ success: boolean; groups: Group[] }>(url);
  return data.groups;
}

export async function getGroup(id: string): Promise<Group> {
  const data = await fetchApi<{ success: boolean; group: Group }>(`/groups/${id}`);
  return data.group;
}

export async function getRoomBlocks(groupId: string): Promise<RoomBlock[]> {
  const data = await fetchApi<{ success: boolean; blocks: RoomBlock[] }>(`/groups/${groupId}/blocks`);
  return data.blocks;
}

export async function getRoomingList(groupId: string): Promise<RoomingListEntry[]> {
  const data = await fetchApi<{ success: boolean; rooming_list: RoomingListEntry[] }>(`/groups/${groupId}/rooming-list`);
  return data.rooming_list;
}

export async function createGroup(group: Partial<Group>): Promise<Group> {
  const data = await fetchApi<{ success: boolean; group: Group }>('/groups', {
    method: 'POST',
    body: JSON.stringify(group),
  });
  return data.group;
}

export async function pickupRoom(groupId: string, entryId: string): Promise<void> {
  await fetchApi(`/groups/${groupId}/pickup/${entryId}`, { method: 'POST' });
}
