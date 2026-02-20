import { createAPIClient } from '../../../../shared/utils/api';
const mpAPI = createAPIClient('marketplace');

export interface MarketplaceChannel {
  id: number; name: string; type: 'amazon' | 'flipkart' | 'shopify' | 'woocommerce' | 'other';
  status: 'connected' | 'disconnected' | 'error';
  lastSync?: string; totalProducts: number; totalOrders: number; revenue: number;
}

export interface MarketplaceOrder {
  id: number; channelId: number; channelName: string; externalOrderId: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  customerName: string; total: number; createdAt: string;
}

export interface MarketplaceStats {
  totalChannels: number; connected: number; totalRevenue: number; pendingOrders: number;
}

export const marketplaceApi = {
  listChannels: async (): Promise<MarketplaceChannel[]> => {
    const response = await mpAPI.get('/channels');
    return (response.data.channels || []).map((c: Record<string, unknown>) => ({
      id: c.id as number, name: c.name as string, type: c.type as MarketplaceChannel['type'],
      status: c.status as MarketplaceChannel['status'], lastSync: c.last_sync as string,
      totalProducts: c.total_products as number || 0, totalOrders: c.total_orders as number || 0,
      revenue: parseFloat(c.revenue as string) || 0,
    }));
  },
  syncChannel: async (id: number): Promise<void> => { await mpAPI.post(`/channels/${id}/sync`); },
  listOrders: async (channelId?: number): Promise<MarketplaceOrder[]> => {
    const response = await mpAPI.get('/orders', { params: { channel_id: channelId } });
    return (response.data.orders || []).map((o: Record<string, unknown>) => ({
      id: o.id as number, channelId: o.channel_id as number, channelName: o.channel_name as string,
      externalOrderId: o.external_order_id as string, status: o.status as MarketplaceOrder['status'],
      customerName: o.customer_name as string, total: parseFloat(o.total as string) || 0,
      createdAt: o.created_at as string,
    }));
  },
  getStats: async (): Promise<MarketplaceStats> => {
    const response = await mpAPI.get('/stats');
    const s = response.data;
    return { totalChannels: s.total_channels || 0, connected: s.connected || 0, totalRevenue: parseFloat(s.total_revenue) || 0, pendingOrders: s.pending_orders || 0 };
  },
};
