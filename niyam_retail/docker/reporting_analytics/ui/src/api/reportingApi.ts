import { createAPIClient } from '@shared/utils/api';
const reportAPI = createAPIClient('reporting');

export interface DashboardStats {
  todaySales: { count: number; total: number };
  todayInvoices: { count: number; total: number };
  newCustomers: number;
  pendingOrders: number;
}

export interface RevenueByStatus {
  status: string;
  count: number;
  total: number;
  paid: number;
}

export interface SalesData {
  period: string;
  transactions: number;
  revenue: number;
  avgTransaction: number;
}

export interface TopProduct {
  sku: string;
  name: string;
  quantitySold: number;
  revenue: number;
}

export interface ARAgingData {
  current: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  over_90: number;
  totalOutstanding: number;
}

export interface InventoryValue {
  totalProducts: number;
  totalUnits: number;
  totalCostValue: number;
  totalRetailValue: number;
}

export interface AuditEntry {
  id: number;
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  details: Record<string, unknown>;
  createdAt: string;
}

const mapAuditEntry = (a: Record<string, unknown>): AuditEntry => ({
  id: a.id as number,
  action: a.action as string,
  entityType: a.entity_type as string,
  entityId: a.entity_id as string,
  userId: a.user_id as string,
  details: a.details as Record<string, unknown> || {},
  createdAt: a.created_at as string,
});

export const reportingApi = {
  getDashboard: async (): Promise<DashboardStats> => {
    const response = await reportAPI.get('/dashboard');
    const d = response.data;
    return {
      todaySales: { count: d.today_sales?.count || 0, total: parseFloat(d.today_sales?.total) || 0 },
      todayInvoices: { count: d.today_invoices?.count || 0, total: parseFloat(d.today_invoices?.total) || 0 },
      newCustomers: d.new_customers || 0,
      pendingOrders: d.pending_orders || 0,
    };
  },

  getRevenueReport: async (from: Date, to: Date): Promise<{ from: Date; to: Date; byStatus: RevenueByStatus[] }> => {
    const response = await reportAPI.get('/reports/revenue', { params: { from: from.toISOString(), to: to.toISOString() } });
    return {
      from: new Date(response.data.from),
      to: new Date(response.data.to),
      byStatus: (response.data.by_status || []).map((r: Record<string, unknown>) => ({
        status: r.status as string,
        count: r.count as number,
        total: parseFloat(r.total as string) || 0,
        paid: parseFloat(r.paid as string) || 0,
      })),
    };
  },

  getSalesReport: async (from: Date, to: Date, period?: 'day' | 'week' | 'month'): Promise<{ data: SalesData[] }> => {
    const response = await reportAPI.get('/reports/sales', { params: { from: from.toISOString(), to: to.toISOString(), period } });
    return {
      data: (response.data.data || []).map((r: Record<string, unknown>) => ({
        period: r.period as string,
        transactions: r.transactions as number,
        revenue: parseFloat(r.revenue as string) || 0,
        avgTransaction: parseFloat(r.avg_transaction as string) || 0,
      })),
    };
  },

  getTopProducts: async (from: Date, to: Date, limit?: number): Promise<TopProduct[]> => {
    const response = await reportAPI.get('/reports/top-products', { params: { from: from.toISOString(), to: to.toISOString(), limit } });
    return (response.data.products || []).map((p: Record<string, unknown>) => ({
      sku: p.sku as string,
      name: p.name as string,
      quantitySold: p.quantity_sold as number,
      revenue: parseFloat(p.revenue as string) || 0,
    }));
  },

  getARAgingReport: async (): Promise<ARAgingData> => {
    const response = await reportAPI.get('/reports/ar-aging');
    const a = response.data.aging || {};
    return {
      current: a.current || 0,
      days_1_30: a.days_1_30 || 0,
      days_31_60: a.days_31_60 || 0,
      days_61_90: a.days_61_90 || 0,
      over_90: a.over_90 || 0,
      totalOutstanding: parseFloat(a.total_outstanding) || 0,
    };
  },

  getInventoryValue: async (): Promise<InventoryValue> => {
    const response = await reportAPI.get('/reports/inventory-value');
    const i = response.data.inventory || {};
    return {
      totalProducts: i.total_products || 0,
      totalUnits: i.total_units || 0,
      totalCostValue: parseFloat(i.total_cost_value) || 0,
      totalRetailValue: parseFloat(i.total_retail_value) || 0,
    };
  },

  exportReport: async (from: Date, to: Date, type: 'sales' | 'invoices'): Promise<{ count: number; data: unknown[] }> => {
    const response = await reportAPI.get('/reports/export', { params: { from: from.toISOString(), to: to.toISOString(), type } });
    return { count: response.data.count || 0, data: response.data.data || [] };
  },

  getAuditLog: async (params?: { limit?: number; action?: string; entity?: string }): Promise<AuditEntry[]> => {
    const response = await reportAPI.get('/audit', { params });
    return (response.data.audit || []).map(mapAuditEntry);
  },

  getAuditStats: async (): Promise<{ byAction: { action: string; count: number }[] }> => {
    const response = await reportAPI.get('/audit/stats');
    return { byAction: response.data.by_action || [] };
  },
};
