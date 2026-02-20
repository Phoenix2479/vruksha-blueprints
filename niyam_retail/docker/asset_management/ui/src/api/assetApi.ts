import { createAPIClient } from '../../../../shared/utils/api';

const assetAPI = createAPIClient('assets');

export interface Asset {
  id: number;
  assetTag: string;
  name: string;
  category: 'equipment' | 'furniture' | 'electronics' | 'vehicle' | 'software' | 'other';
  status: 'available' | 'in_use' | 'maintenance' | 'retired' | 'lost';
  location: string;
  assignedTo?: string;
  assignedToName?: string;
  purchaseDate: string;
  purchasePrice: number;
  currentValue: number;
  warrantyExpiry?: string;
  lastMaintenanceDate?: string;
  nextMaintenanceDate?: string;
  serialNumber?: string;
  manufacturer?: string;
  model?: string;
  notes?: string;
  createdAt: string;
}

export interface AssetStats {
  totalAssets: number;
  availableAssets: number;
  inUseAssets: number;
  maintenanceDue: number;
  totalValue: number;
  depreciatedValue: number;
}

const mapAsset = (a: Record<string, unknown>): Asset => ({
  id: a.id as number,
  assetTag: a.asset_tag as string || `AST-${a.id}`,
  name: a.name as string,
  category: a.category as Asset['category'] || 'other',
  status: a.status as Asset['status'] || 'available',
  location: a.location as string || '',
  assignedTo: a.assigned_to as string,
  assignedToName: a.assigned_to_name as string,
  purchaseDate: a.purchase_date as string,
  purchasePrice: parseFloat(a.purchase_price as string) || 0,
  currentValue: parseFloat(a.current_value as string) || 0,
  warrantyExpiry: a.warranty_expiry as string,
  lastMaintenanceDate: a.last_maintenance_date as string,
  nextMaintenanceDate: a.next_maintenance_date as string,
  serialNumber: a.serial_number as string,
  manufacturer: a.manufacturer as string,
  model: a.model as string,
  notes: a.notes as string,
  createdAt: a.created_at as string || new Date().toISOString(),
});

export const assetApi = {
  list: async (params?: { category?: Asset['category']; status?: Asset['status']; location?: string }): Promise<Asset[]> => {
    const response = await assetAPI.get('/assets', { params });
    return (response.data.assets || []).map(mapAsset);
  },
  get: async (id: number): Promise<Asset> => {
    const response = await assetAPI.get(`/assets/${id}`);
    return mapAsset(response.data.asset);
  },
  create: async (data: {
    name: string; category: Asset['category']; location: string;
    purchaseDate: string; purchasePrice: number; serialNumber?: string;
    manufacturer?: string; model?: string; warrantyExpiry?: string;
  }): Promise<Asset> => {
    const response = await assetAPI.post('/assets', {
      name: data.name, category: data.category, location: data.location,
      purchase_date: data.purchaseDate, purchase_price: data.purchasePrice,
      serial_number: data.serialNumber, manufacturer: data.manufacturer,
      model: data.model, warranty_expiry: data.warrantyExpiry,
    });
    return mapAsset(response.data.asset);
  },
  update: async (id: number, data: Partial<{
    name: string; status: Asset['status']; location: string;
    assignedTo: string; notes: string; nextMaintenanceDate: string;
  }>): Promise<Asset> => {
    const response = await assetAPI.put(`/assets/${id}`, {
      name: data.name, status: data.status, location: data.location,
      assigned_to: data.assignedTo, notes: data.notes,
      next_maintenance_date: data.nextMaintenanceDate,
    });
    return mapAsset(response.data.asset);
  },
  delete: async (id: number): Promise<void> => {
    await assetAPI.delete(`/assets/${id}`);
  },
  assign: async (id: number, userId: string): Promise<Asset> => {
    const response = await assetAPI.post(`/assets/${id}/assign`, { user_id: userId });
    return mapAsset(response.data.asset);
  },
  unassign: async (id: number): Promise<Asset> => {
    const response = await assetAPI.post(`/assets/${id}/unassign`);
    return mapAsset(response.data.asset);
  },
  recordMaintenance: async (id: number, notes: string): Promise<Asset> => {
    const response = await assetAPI.post(`/assets/${id}/maintenance`, { notes });
    return mapAsset(response.data.asset);
  },
  getStats: async (): Promise<AssetStats> => {
    const response = await assetAPI.get('/assets/stats');
    const s = response.data;
    return {
      totalAssets: s.total_assets || 0,
      availableAssets: s.available_assets || 0,
      inUseAssets: s.in_use_assets || 0,
      maintenanceDue: s.maintenance_due || 0,
      totalValue: parseFloat(s.total_value) || 0,
      depreciatedValue: parseFloat(s.depreciated_value) || 0,
    };
  },
};
