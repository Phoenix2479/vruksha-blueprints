import { createAPIClient } from '../../../../shared/utils/api';
const storeAPI = createAPIClient('multistore');

export interface Store {
  id: number; storeCode: string; name: string; type: 'retail' | 'warehouse' | 'outlet' | 'franchise';
  status: 'active' | 'inactive' | 'maintenance' | 'coming_soon';
  address: string; city: string; state: string; postalCode: string; country: string;
  phone?: string; email?: string; manager?: string;
  operatingHours?: { open: string; close: string };
  coordinates?: { lat: number; lng: number };
  createdAt: string;
}

export interface StoreStats {
  totalStores: number; activeStores: number; totalRevenue: number;
  avgDailyRevenue: number; topPerformingStore?: string;
}

export interface StorePerformance {
  storeId: number; storeName: string; revenue: number; orders: number;
  avgOrderValue: number; inventoryValue: number; staffCount: number;
}

const mapStore = (s: Record<string, unknown>): Store => ({
  id: s.id as number, storeCode: s.store_code as string || `STR-${s.id}`,
  name: s.name as string, type: s.type as Store['type'] || 'retail',
  status: s.status as Store['status'] || 'active',
  address: s.address as string || '', city: s.city as string || '',
  state: s.state as string || '', postalCode: s.postal_code as string || '',
  country: s.country as string || '', phone: s.phone as string, email: s.email as string,
  manager: s.manager as string, operatingHours: s.operating_hours as Store['operatingHours'],
  coordinates: s.coordinates as Store['coordinates'],
  createdAt: s.created_at as string || new Date().toISOString(),
});

export const storeApi = {
  list: async (params?: { status?: Store['status']; type?: Store['type'] }): Promise<Store[]> => {
    const response = await storeAPI.get('/stores', { params });
    return (response.data.stores || []).map(mapStore);
  },
  get: async (id: number): Promise<Store> => {
    const response = await storeAPI.get(`/stores/${id}`);
    return mapStore(response.data.store);
  },
  create: async (data: { name: string; type: Store['type']; address: string; city: string; state: string; postalCode: string; country: string; phone?: string; email?: string; manager?: string }): Promise<Store> => {
    const response = await storeAPI.post('/stores', { name: data.name, type: data.type, address: data.address, city: data.city, state: data.state, postal_code: data.postalCode, country: data.country, phone: data.phone, email: data.email, manager: data.manager });
    return mapStore(response.data.store);
  },
  update: async (id: number, data: Partial<{ name: string; status: Store['status']; manager: string; phone: string; email: string }>): Promise<Store> => {
    const response = await storeAPI.put(`/stores/${id}`, data);
    return mapStore(response.data.store);
  },
  delete: async (id: number): Promise<void> => { await storeAPI.delete(`/stores/${id}`); },
  getStats: async (): Promise<StoreStats> => {
    const response = await storeAPI.get('/stores/stats');
    const s = response.data;
    return { totalStores: s.total_stores || 0, activeStores: s.active_stores || 0, totalRevenue: parseFloat(s.total_revenue) || 0, avgDailyRevenue: parseFloat(s.avg_daily_revenue) || 0, topPerformingStore: s.top_performing_store };
  },
  getPerformance: async (): Promise<StorePerformance[]> => {
    const response = await storeAPI.get('/stores/performance');
    return (response.data.performance || []).map((p: Record<string, unknown>) => ({
      storeId: p.store_id as number, storeName: p.store_name as string,
      revenue: parseFloat(p.revenue as string) || 0, orders: p.orders as number || 0,
      avgOrderValue: parseFloat(p.avg_order_value as string) || 0,
      inventoryValue: parseFloat(p.inventory_value as string) || 0, staffCount: p.staff_count as number || 0,
    }));
  },
};
