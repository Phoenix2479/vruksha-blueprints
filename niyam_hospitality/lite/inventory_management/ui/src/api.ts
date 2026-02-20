// Inventory Management API Client
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

  return data;
}

// Types
export interface Category {
  id: string;
  name: string;
  parent_id?: string;
  description?: string;
  is_active: number;
}

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  description?: string;
  category_id?: string;
  category_name?: string;
  unit: string;
  unit_cost: number;
  par_level: number;
  reorder_point: number;
  reorder_quantity: number;
  current_stock: number;
  storage_location?: string;
  is_perishable: number;
  shelf_life_days?: number;
  is_active: number;
}

export interface Vendor {
  id: string;
  name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  payment_terms?: string;
  lead_time_days: number;
  minimum_order: number;
  is_active: number;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  vendor_id: string;
  vendor_name?: string;
  order_date: string;
  expected_date?: string;
  status: 'draft' | 'approved' | 'sent' | 'partial' | 'received' | 'cancelled';
  subtotal: number;
  tax: number;
  total: number;
  notes?: string;
  items?: PurchaseOrderItem[];
}

export interface PurchaseOrderItem {
  id: string;
  po_id: string;
  item_id: string;
  item_name?: string;
  sku?: string;
  quantity_ordered: number;
  unit_cost: number;
  total_cost: number;
  quantity_received: number;
}

export interface InventoryStats {
  total_items: number;
  inventory_value: number;
  low_stock_items: number;
  pending_po_count: number;
  pending_po_value: number;
}

export interface StockAdjustment {
  id: string;
  item_id: string;
  adjustment_type: string;
  quantity: number;
  reason?: string;
  old_stock: number;
  new_stock: number;
  adjusted_by?: string;
  created_at: string;
}

// Categories
export async function getCategories(): Promise<Category[]> {
  const data = await fetchApi<{ success: boolean; categories: Category[] }>('/categories');
  return data.categories;
}

export async function createCategory(category: { name: string; parent_id?: string; description?: string }): Promise<Category> {
  const data = await fetchApi<{ success: boolean; category: Category }>('/categories', {
    method: 'POST',
    body: JSON.stringify(category),
  });
  return data.category;
}

// Items
export async function getItems(params?: { category_id?: string; search?: string; low_stock?: boolean }): Promise<InventoryItem[]> {
  const searchParams = new URLSearchParams();
  if (params?.category_id) searchParams.append('category_id', params.category_id);
  if (params?.search) searchParams.append('search', params.search);
  if (params?.low_stock) searchParams.append('low_stock', 'true');
  
  const query = searchParams.toString();
  const data = await fetchApi<{ success: boolean; items: InventoryItem[] }>(`/items${query ? `?${query}` : ''}`);
  return data.items;
}

export async function getItem(id: string): Promise<InventoryItem & { vendors: any[]; recent_movements: StockAdjustment[] }> {
  const data = await fetchApi<{ success: boolean; item: InventoryItem & { vendors: any[]; recent_movements: StockAdjustment[] } }>(`/items/${id}`);
  return data.item;
}

export async function createItem(item: Partial<InventoryItem>): Promise<InventoryItem> {
  const data = await fetchApi<{ success: boolean; item: InventoryItem }>('/items', {
    method: 'POST',
    body: JSON.stringify(item),
  });
  return data.item;
}

export async function updateItem(id: string, item: Partial<InventoryItem>): Promise<void> {
  await fetchApi(`/items/${id}`, {
    method: 'PUT',
    body: JSON.stringify(item),
  });
}

// Vendors
export async function getVendors(): Promise<Vendor[]> {
  const data = await fetchApi<{ success: boolean; vendors: Vendor[] }>('/vendors');
  return data.vendors;
}

export async function createVendor(vendor: Partial<Vendor>): Promise<Vendor> {
  const data = await fetchApi<{ success: boolean; vendor: Vendor }>('/vendors', {
    method: 'POST',
    body: JSON.stringify(vendor),
  });
  return data.vendor;
}

// Purchase Orders
export async function getPurchaseOrders(params?: { vendor_id?: string; status?: string }): Promise<PurchaseOrder[]> {
  const searchParams = new URLSearchParams();
  if (params?.vendor_id) searchParams.append('vendor_id', params.vendor_id);
  if (params?.status) searchParams.append('status', params.status);
  
  const query = searchParams.toString();
  const data = await fetchApi<{ success: boolean; purchase_orders: PurchaseOrder[] }>(`/purchase-orders${query ? `?${query}` : ''}`);
  return data.purchase_orders;
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrder> {
  const data = await fetchApi<{ success: boolean; purchase_order: PurchaseOrder }>(`/purchase-orders/${id}`);
  return data.purchase_order;
}

export async function createPurchaseOrder(po: { vendor_id: string; expected_date?: string; notes?: string; items: { item_id: string; quantity: number; unit_cost: number }[] }): Promise<PurchaseOrder> {
  const data = await fetchApi<{ success: boolean; purchase_order: PurchaseOrder }>('/purchase-orders', {
    method: 'POST',
    body: JSON.stringify(po),
  });
  return data.purchase_order;
}

export async function approvePurchaseOrder(id: string, approved_by: string): Promise<void> {
  await fetchApi(`/purchase-orders/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ approved_by }),
  });
}

export async function sendPurchaseOrder(id: string): Promise<void> {
  await fetchApi(`/purchase-orders/${id}/send`, { method: 'POST' });
}

// Stock Operations
export async function adjustStock(item_id: string, adjustment_type: 'add' | 'remove' | 'set', quantity: number, reason: string, adjusted_by?: string): Promise<{ old_stock: number; new_stock: number }> {
  const data = await fetchApi<{ success: boolean; adjustment: { old_stock: number; new_stock: number } }>('/adjust', {
    method: 'POST',
    body: JSON.stringify({ item_id, adjustment_type, quantity, reason, adjusted_by }),
  });
  return data.adjustment;
}

export async function receiveItems(po_id: string, vendor_id: string, items: { item_id: string; quantity_expected: number; quantity_received: number; unit_cost: number; batch_number?: string; expiry_date?: string }[], received_by?: string): Promise<string> {
  const data = await fetchApi<{ success: boolean; receiving_id: string }>('/receive', {
    method: 'POST',
    body: JSON.stringify({ po_id, vendor_id, items, received_by }),
  });
  return data.receiving_id;
}

// Alerts
export async function getLowStockItems(): Promise<InventoryItem[]> {
  const data = await fetchApi<{ success: boolean; items: InventoryItem[] }>('/alerts/low-stock');
  return data.items;
}

export async function getExpiringItems(days?: number): Promise<any[]> {
  const data = await fetchApi<{ success: boolean; items: any[] }>(`/alerts/expiring${days ? `?days=${days}` : ''}`);
  return data.items;
}

// Stats
export async function getStats(): Promise<InventoryStats> {
  const data = await fetchApi<{ success: boolean; stats: InventoryStats }>('/stats');
  return data.stats;
}
