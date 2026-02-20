import { createAPIClient } from '@/lib/api';
const dashAPI = createAPIClient('dashboard');

export interface DashboardMetrics {
  revenue: { today: number; yesterday: number; weekTrend: number[] };
  orders: { today: number; yesterday: number; avgValue: number };
  customers: { active: number; new: number; returning: number };
  inventory: { lowStock: number; outOfStock: number; totalValue: number };
}

export interface QuickStat { label: string; value: string | number; change?: number; trend?: 'up' | 'down' }

export const dashboardApi = {
  getMetrics: async (): Promise<DashboardMetrics> => {
    const response = await dashAPI.get('/metrics');
    const m = response.data;
    return {
      revenue: { today: parseFloat(m.revenue?.today) || 0, yesterday: parseFloat(m.revenue?.yesterday) || 0, weekTrend: m.revenue?.week_trend || [] },
      orders: { today: m.orders?.today || 0, yesterday: m.orders?.yesterday || 0, avgValue: parseFloat(m.orders?.avg_value) || 0 },
      customers: { active: m.customers?.active || 0, new: m.customers?.new || 0, returning: m.customers?.returning || 0 },
      inventory: { lowStock: m.inventory?.low_stock || 0, outOfStock: m.inventory?.out_of_stock || 0, totalValue: parseFloat(m.inventory?.total_value) || 0 },
    };
  },
  getQuickStats: async (): Promise<QuickStat[]> => {
    const response = await dashAPI.get('/quick-stats');
    return response.data.stats || [];
  },
};
