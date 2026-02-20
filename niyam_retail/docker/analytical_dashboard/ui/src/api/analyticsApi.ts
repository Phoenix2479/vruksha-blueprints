
export interface KPI {
  id: string;
  name: string;
  value: number;
  previous_value: number;
  change_percent: number;
  trend: 'up' | 'down' | 'stable';
  unit: string;
}

export interface SalesTrend {
  date: string;
  sales: number;
  transactions: number;
  avg_order_value: number;
}

export interface TopSeller {
  product_id: string;
  product_name: string;
  sales: number;
  quantity_sold: number;
  revenue: number;
}

export interface StoreComparison {
  store_id: string;
  store_name: string;
  metrics: Record<string, number>;
}

export interface Alert {
  id: string;
  kpi_id: string;
  threshold: number;
  condition: 'above' | 'below';
  status: 'active' | 'triggered' | 'inactive';
}


const API_BASE = import.meta.env.VITE_ANALYTICAL_DASHBOARD_API || 'http://localhost:8943';


async function fetcher<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const tenantId = localStorage.getItem('tenant_id') || 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-ID': tenantId,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || 'Request failed');
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}


export const analyticsApi = {
  getKPIs: (params?: Record<string, any>) => fetcher<KPI[]>(params ? `/api/kpis?${new URLSearchParams(params).toString()}` : '/api/kpis'),
  getSalesTrends: (params?: Record<string, any>) => fetcher<SalesTrend[]>(params ? `/api/trends/sales?${new URLSearchParams(params).toString()}` : '/api/trends/sales'),
  getTopSellers: (params?: Record<string, any>) => fetcher<TopSeller[]>(params ? `/api/top-sellers?${new URLSearchParams(params).toString()}` : '/api/top-sellers'),
  getStoreComparison: (params?: Record<string, any>) => fetcher<StoreComparison[]>(params ? `/api/comparison/stores?${new URLSearchParams(params).toString()}` : '/api/comparison/stores'),
  createAlert: (data?: any) => fetcher<Alert>('/api/alerts/create', { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  getAlerts: (params?: Record<string, any>) => fetcher<Alert[]>(params ? `/api/alerts?${new URLSearchParams(params).toString()}` : '/api/alerts'),
};
