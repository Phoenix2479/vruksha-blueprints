// Housekeeping API Client
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8912';

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
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    if (data?.error?.message) {
      throw new ApiError(data.error.message, data.error.code || 'UNKNOWN_ERROR', res.status);
    }
    if (data?.error) {
      throw new ApiError(typeof data.error === 'string' ? data.error : 'API request failed', 'UNKNOWN_ERROR', res.status);
    }
    throw new ApiError(res.statusText || 'API request failed', 'HTTP_ERROR', res.status);
  }

  if (!data?.success && data?.error) {
    throw new ApiError(data.error.message || data.error, data.error.code || 'UNKNOWN_ERROR', res.status);
  }

  return data;
}

// Types
export interface HousekeepingTask {
  id: string;
  room_id: string;
  room_number?: string;
  floor_number?: string;
  task_type: 'cleaning' | 'repair' | 'amenity_restock' | 'inspection';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed' | 'verified';
  assigned_to?: string;
  notes?: string;
  created_at: string;
  updated_at?: string;
}

export interface Room {
  id: string;
  room_number: string;
  floor_number?: string;
  room_type: string;
  status: 'available' | 'occupied' | 'dirty' | 'maintenance' | 'reserved';
  capacity_adults?: number;
}

export interface HousekeepingStats {
  pending_tasks: number;
  in_progress: number;
  completed_today: number;
  rooms_to_clean: number;
  rooms_available: number;
}

// API Functions
export async function getTasks(status?: string): Promise<HousekeepingTask[]> {
  const url = status ? `/tasks?status=${status}` : '/tasks';
  const data = await fetchApi<{ success: boolean; tasks: HousekeepingTask[] }>(url);
  return data.tasks;
}

export async function getRooms(): Promise<Room[]> {
  const data = await fetchApi<{ success: boolean; rooms: Room[] }>('/rooms');
  return data.rooms;
}

export async function getStats(): Promise<HousekeepingStats> {
  const data = await fetchApi<{ success: boolean; stats: HousekeepingStats }>('/stats');
  return data.stats;
}

export async function updateTaskStatus(taskId: string, status: string, notes?: string): Promise<void> {
  await fetchApi(`/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, notes }),
  });
}

export async function assignTask(taskId: string, assignedTo: string): Promise<void> {
  await fetchApi(`/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify({ assigned_to: assignedTo }),
  });
}

export async function createTask(task: {
  room_id: string;
  task_type: string;
  priority: string;
  notes?: string;
}): Promise<HousekeepingTask> {
  const data = await fetchApi<{ success: boolean; task: HousekeepingTask }>('/tasks', {
    method: 'POST',
    body: JSON.stringify(task),
  });
  return data.task;
}

export async function updateRoomStatus(roomId: string, status: string): Promise<void> {
  await fetchApi(`/rooms/${roomId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}
