// Kitchen Operations API Client
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8920';

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
export interface KitchenOrder {
  id: string;
  order_number: number;
  table_number?: string;
  zone?: string;
  room_number?: string;
  status: 'kitchen_ready' | 'cooking' | 'ready' | 'served';
  created_at: string;
  items: OrderItem[];
  wait_time_minutes?: number;
  is_overdue?: boolean;
  priority?: 'normal' | 'high' | 'urgent';
  source?: string;
}

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  notes?: string;
  status: string;
  modifiers?: { name: string; price: number }[];
}

// API Functions
export async function getKOTs(status?: string): Promise<KitchenOrder[]> {
  const url = status ? `/kots?status=${status}` : '/kots';
  const data = await fetchApi<{ success: boolean; orders: KitchenOrder[] }>(url);
  return data.orders;
}

export async function updateOrderStatus(orderId: string, status: string): Promise<void> {
  await fetchApi(`/kots/${orderId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function updateItemStatus(itemId: string, status: string): Promise<void> {
  await fetchApi(`/items/${itemId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

// KDS API (port 8916)
const KDS_BASE = import.meta.env.VITE_KDS_URL || 'http://localhost:8916';

async function fetchKDS<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${KDS_BASE}${endpoint}`, {
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

export async function getKDSDisplay(): Promise<KitchenOrder[]> {
  const data = await fetchKDS<{ success: boolean; orders: KitchenOrder[] }>('/display');
  return data.orders;
}

export async function startOrder(orderId: string): Promise<void> {
  await fetchKDS(`/orders/${orderId}/start`, { method: 'POST' });
}

export async function markOrderReady(orderId: string): Promise<void> {
  await fetchKDS(`/orders/${orderId}/ready`, { method: 'POST' });
}

export async function markOrderServed(orderId: string): Promise<void> {
  await fetchKDS(`/orders/${orderId}/served`, { method: 'POST' });
}

export async function getReadyOrders(): Promise<KitchenOrder[]> {
  const data = await fetchKDS<{ success: boolean; orders: KitchenOrder[] }>('/ready');
  return data.orders;
}

export async function getKDSStats(): Promise<{
  in_queue: number;
  cooking: number;
  ready_for_pickup: number;
  total_active: number;
  avg_prep_time_minutes: number;
  served_last_hour: number;
}> {
  const data = await fetchKDS<{ success: boolean; stats: any }>('/stats');
  return data.stats;
}
