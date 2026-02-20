// Restaurant POS API Client
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8918';

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
    // Handle new error format: { success: false, error: { code, message } }
    if (data?.error?.message) {
      throw new ApiError(data.error.message, data.error.code || 'UNKNOWN_ERROR', res.status);
    }
    // Handle legacy error format: { error: string }
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
export interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  category_id?: string;
  category_name?: string;
  is_veg: boolean;
  is_available: boolean;
  images?: { url: string; alt: string }[];
}

export interface TableStatus {
  id: string;
  table_number: string;
  zone?: string;
  capacity: number;
  status: 'available' | 'occupied' | 'reserved' | 'dirty';
  current_order_id?: string;
}

export interface Order {
  id: string;
  table_id: string;
  order_number: number;
  status: string;
  total_amount: number;
  items?: OrderItem[];
  created_at: string;
}

export interface OrderItem {
  menu_item_id: string;
  quantity: number;
  notes?: string;
}

// API Functions
export async function getMenu(): Promise<MenuItem[]> {
  const data = await fetchApi<{ success: boolean; items: MenuItem[] }>('/menu');
  return data.items;
}

export async function getTables(): Promise<TableStatus[]> {
  const data = await fetchApi<{ success: boolean; tables: TableStatus[] }>('/tables');
  return data.tables;
}

export async function getOrders(status?: string): Promise<Order[]> {
  const url = status ? `/orders?status=${status}` : '/orders';
  const data = await fetchApi<{ success: boolean; orders: Order[] }>(url);
  return data.orders;
}

export async function createOrder(tableId: string, items: OrderItem[]): Promise<{ order_id: string; total: number }> {
  const data = await fetchApi<{ success: boolean; order_id: string; total: number }>('/orders', {
    method: 'POST',
    body: JSON.stringify({ table_id: tableId, items }),
  });
  return { order_id: data.order_id, total: data.total };
}

export async function createTable(tableNumber: string, capacity: number, zone?: string): Promise<TableStatus> {
  const data = await fetchApi<{ success: boolean; table: TableStatus }>('/tables', {
    method: 'POST',
    body: JSON.stringify({ table_number: tableNumber, capacity, zone }),
  });
  return data.table;
}

export async function createMenuItem(item: Partial<MenuItem>): Promise<MenuItem> {
  const formData = new FormData();
  Object.entries(item).forEach(([key, value]) => {
    if (value !== undefined) formData.append(key, String(value));
  });
  
  const res = await fetch(`${API_BASE}/menu`, {
    method: 'POST',
    body: formData,
  });
  const data = await res.json();
  return data.item;
}

// Course firing (for coursed dining)
export async function fireCourse(ticketId: string, course: string): Promise<void> {
  await fetchApi(`/tickets/${ticketId}/fire`, {
    method: 'POST',
    body: JSON.stringify({ course }),
  });
}

// 86 an item
export async function markItem86(itemId: string): Promise<void> {
  await fetchApi(`/menu/items/${itemId}/86`, {
    method: 'POST',
  });
}
