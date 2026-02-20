import { createAPIClient } from '../../../../shared/utils/api';
const analyticsAPI = createAPIClient('analytics');

export interface SalesMetrics {
  totalRevenue: number; totalOrders: number; avgOrderValue: number;
  totalUnits: number; returnRate: number; newCustomers: number;
}

export interface SalesTrend {
  date: string; revenue: number; orders: number;
}

export interface TopProduct {
  productId: string; productName: string; unitsSold: number; revenue: number;
}

export interface TopCategory {
  category: string; revenue: number; percentage: number;
}

export const salesAnalyticsApi = {
  getMetrics: async (period: 'day' | 'week' | 'month' | 'year' = 'month'): Promise<SalesMetrics> => {
    const response = await analyticsAPI.get('/sales/metrics', { params: { period } });
    const m = response.data;
    return { totalRevenue: parseFloat(m.total_revenue) || 0, totalOrders: m.total_orders || 0, avgOrderValue: parseFloat(m.avg_order_value) || 0, totalUnits: m.total_units || 0, returnRate: parseFloat(m.return_rate) || 0, newCustomers: m.new_customers || 0 };
  },
  getTrends: async (period: 'day' | 'week' | 'month' = 'month'): Promise<SalesTrend[]> => {
    const response = await analyticsAPI.get('/sales/trends', { params: { period } });
    return (response.data.trends || []).map((t: Record<string, unknown>) => ({
      date: t.date as string, revenue: parseFloat(t.revenue as string) || 0, orders: t.orders as number || 0,
    }));
  },
  getTopProducts: async (limit = 10): Promise<TopProduct[]> => {
    const response = await analyticsAPI.get('/sales/top-products', { params: { limit } });
    return (response.data.products || []).map((p: Record<string, unknown>) => ({
      productId: p.product_id as string, productName: p.product_name as string,
      unitsSold: p.units_sold as number || 0, revenue: parseFloat(p.revenue as string) || 0,
    }));
  },
  getTopCategories: async (): Promise<TopCategory[]> => {
    const response = await analyticsAPI.get('/sales/top-categories');
    return (response.data.categories || []).map((c: Record<string, unknown>) => ({
      category: c.category as string, revenue: parseFloat(c.revenue as string) || 0, percentage: parseFloat(c.percentage as string) || 0,
    }));
  },
};
