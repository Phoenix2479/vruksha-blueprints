import { createAPIClient } from '../../../../shared/utils/api';
const kioskAPI = createAPIClient('kiosk');

export interface Kiosk {
  id: number; kioskCode: string; name: string; location: string;
  type: 'self_checkout' | 'product_info' | 'order_pickup' | 'returns';
  status: 'online' | 'offline' | 'maintenance';
  storeId: number; storeName?: string;
  lastHeartbeat?: string; ipAddress?: string;
  screenSize?: string; orientation?: 'landscape' | 'portrait';
  features: { payment: boolean; scanner: boolean; printer: boolean; camera: boolean };
  createdAt: string;
}

export interface KioskStats {
  totalKiosks: number; online: number; offline: number; maintenance: number;
}

const mapKiosk = (k: Record<string, unknown>): Kiosk => ({
  id: k.id as number, kioskCode: k.kiosk_code as string || `KIOSK-${k.id}`,
  name: k.name as string, location: k.location as string || '',
  type: k.type as Kiosk['type'] || 'self_checkout',
  status: k.status as Kiosk['status'] || 'offline',
  storeId: k.store_id as number || 0, storeName: k.store_name as string,
  lastHeartbeat: k.last_heartbeat as string, ipAddress: k.ip_address as string,
  screenSize: k.screen_size as string, orientation: k.orientation as Kiosk['orientation'],
  features: (k.features as Kiosk['features']) || { payment: false, scanner: false, printer: false, camera: false },
  createdAt: k.created_at as string || new Date().toISOString(),
});

export const kioskApi = {
  list: async (params?: { status?: Kiosk['status']; storeId?: number }): Promise<Kiosk[]> => {
    const response = await kioskAPI.get('/kiosks', { params });
    return (response.data.kiosks || []).map(mapKiosk);
  },
  get: async (id: number): Promise<Kiosk> => {
    const response = await kioskAPI.get(`/kiosks/${id}`);
    return mapKiosk(response.data.kiosk);
  },
  create: async (data: { name: string; location: string; type: Kiosk['type']; storeId: number; features: Kiosk['features'] }): Promise<Kiosk> => {
    const response = await kioskAPI.post('/kiosks', { name: data.name, location: data.location, type: data.type, store_id: data.storeId, features: data.features });
    return mapKiosk(response.data.kiosk);
  },
  update: async (id: number, data: Partial<{ status: Kiosk['status']; features: Kiosk['features'] }>): Promise<Kiosk> => {
    const response = await kioskAPI.put(`/kiosks/${id}`, data);
    return mapKiosk(response.data.kiosk);
  },
  delete: async (id: number): Promise<void> => { await kioskAPI.delete(`/kiosks/${id}`); },
  getStats: async (): Promise<KioskStats> => {
    const response = await kioskAPI.get('/kiosks/stats');
    const s = response.data;
    return { totalKiosks: s.total_kiosks || 0, online: s.online || 0, offline: s.offline || 0, maintenance: s.maintenance || 0 };
  },
  restart: async (id: number): Promise<void> => { await kioskAPI.post(`/kiosks/${id}/restart`); },
};
