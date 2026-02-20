import { createAPIClient } from '../../../../shared/utils/api';
const supplyAPI = createAPIClient('supply');

export interface Shipment {
  id: number; trackingNumber: string; type: 'inbound' | 'outbound' | 'transfer';
  status: 'pending' | 'in_transit' | 'delivered' | 'delayed' | 'cancelled';
  origin: string; destination: string; carrier: string;
  estimatedDelivery: string; actualDelivery?: string;
  items: { productId: string; productName: string; quantity: number }[];
  totalWeight: number; totalValue: number;
  createdAt: string;
}

export interface SupplyChainStats {
  totalShipments: number; inTransit: number; delivered: number; delayed: number;
  onTimeRate: number; avgDeliveryDays: number;
}

const mapShipment = (s: Record<string, unknown>): Shipment => ({
  id: s.id as number, trackingNumber: s.tracking_number as string || `SHP-${s.id}`,
  type: s.type as Shipment['type'] || 'inbound',
  status: s.status as Shipment['status'] || 'pending',
  origin: s.origin as string || '', destination: s.destination as string || '',
  carrier: s.carrier as string || '',
  estimatedDelivery: s.estimated_delivery as string,
  actualDelivery: s.actual_delivery as string,
  items: (s.items as Shipment['items']) || [],
  totalWeight: parseFloat(s.total_weight as string) || 0,
  totalValue: parseFloat(s.total_value as string) || 0,
  createdAt: s.created_at as string || new Date().toISOString(),
});

export const shipmentApi = {
  list: async (params?: { status?: Shipment['status']; type?: Shipment['type'] }): Promise<Shipment[]> => {
    const response = await supplyAPI.get('/shipments', { params });
    return (response.data.shipments || []).map(mapShipment);
  },
  get: async (id: number): Promise<Shipment> => {
    const response = await supplyAPI.get(`/shipments/${id}`);
    return mapShipment(response.data.shipment);
  },
  create: async (data: { type: Shipment['type']; origin: string; destination: string; carrier: string; estimatedDelivery: string; items: Shipment['items'] }): Promise<Shipment> => {
    const response = await supplyAPI.post('/shipments', { type: data.type, origin: data.origin, destination: data.destination, carrier: data.carrier, estimated_delivery: data.estimatedDelivery, items: data.items });
    return mapShipment(response.data.shipment);
  },
  updateStatus: async (id: number, status: Shipment['status']): Promise<Shipment> => {
    const response = await supplyAPI.put(`/shipments/${id}/status`, { status });
    return mapShipment(response.data.shipment);
  },
  getStats: async (): Promise<SupplyChainStats> => {
    const response = await supplyAPI.get('/shipments/stats');
    const s = response.data;
    return { totalShipments: s.total_shipments || 0, inTransit: s.in_transit || 0, delivered: s.delivered || 0, delayed: s.delayed || 0, onTimeRate: parseFloat(s.on_time_rate) || 0, avgDeliveryDays: parseFloat(s.avg_delivery_days) || 0 };
  },
};
