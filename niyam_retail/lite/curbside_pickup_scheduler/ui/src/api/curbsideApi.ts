import { createAPIClient } from '@/lib/api';
const curbsideAPI = createAPIClient('curbside');

export interface CurbsideOrder {
  id: number; orderNumber: string; customerId: number; customerName: string; customerPhone: string;
  status: 'pending' | 'preparing' | 'ready' | 'notified' | 'picked_up' | 'cancelled';
  items: { productName: string; quantity: number }[];
  vehicleInfo?: { make: string; model: string; color: string; plateNumber: string };
  parkingSpot?: string; estimatedPickup?: string; actualPickup?: string;
  createdAt: string;
}

export interface CurbsideStats {
  totalOrders: number; pending: number; ready: number; avgWaitMinutes: number;
}

const mapOrder = (o: Record<string, unknown>): CurbsideOrder => ({
  id: o.id as number, orderNumber: o.order_number as string || `ORD-${o.id}`,
  customerId: o.customer_id as number || 0, customerName: o.customer_name as string || '',
  customerPhone: o.customer_phone as string || '', status: o.status as CurbsideOrder['status'] || 'pending',
  items: (o.items as CurbsideOrder['items']) || [], vehicleInfo: o.vehicle_info as CurbsideOrder['vehicleInfo'],
  parkingSpot: o.parking_spot as string, estimatedPickup: o.estimated_pickup as string,
  actualPickup: o.actual_pickup as string, createdAt: o.created_at as string || new Date().toISOString(),
});

export const curbsideApi = {
  list: async (params?: { status?: CurbsideOrder['status'] }): Promise<CurbsideOrder[]> => {
    const response = await curbsideAPI.get('/orders', { params });
    return (response.data.orders || []).map(mapOrder);
  },
  updateStatus: async (id: number, status: CurbsideOrder['status'], parkingSpot?: string): Promise<CurbsideOrder> => {
    const response = await curbsideAPI.put(`/orders/${id}/status`, { status, parking_spot: parkingSpot });
    return mapOrder(response.data.order);
  },
  notifyCustomer: async (id: number): Promise<void> => { await curbsideAPI.post(`/orders/${id}/notify`); },
  getStats: async (): Promise<CurbsideStats> => {
    const response = await curbsideAPI.get('/orders/stats');
    const s = response.data;
    return { totalOrders: s.total_orders || 0, pending: s.pending || 0, ready: s.ready || 0, avgWaitMinutes: parseFloat(s.avg_wait_minutes) || 0 };
  },
};
