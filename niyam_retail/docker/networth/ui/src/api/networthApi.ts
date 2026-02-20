
export interface NetworthSummary {
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  financial_health_score: number;
}

export interface Asset {
  id: string;
  name: string;
  category: string;
  value: number;
  acquisition_date: string;
}

export interface Liability {
  id: string;
  name: string;
  category: string;
  amount: number;
  interest_rate: number;
  due_date?: string;
}

export interface NetworthTrend {
  date: string;
  net_worth: number;
  assets: number;
  liabilities: number;
}


const API_BASE = import.meta.env.VITE_NETWORTH_API || 'http://localhost:8959';


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


export const networthApi = {
  getSummary: (params?: Record<string, any>) => fetcher<NetworthSummary>(params ? `/api/networth/summary?${new URLSearchParams(params).toString()}` : '/api/networth/summary'),
  getAssets: (params?: Record<string, any>) => fetcher<Asset[]>(params ? `/api/networth/assets?${new URLSearchParams(params).toString()}` : '/api/networth/assets'),
  getLiabilities: (params?: Record<string, any>) => fetcher<Liability[]>(params ? `/api/networth/liabilities?${new URLSearchParams(params).toString()}` : '/api/networth/liabilities'),
  addAsset: (data?: any) => fetcher<Asset>('/api/networth/assets/add', { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  addLiability: (data?: any) => fetcher<Liability>('/api/networth/liabilities/add', { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  getTrends: (params?: Record<string, any>) => fetcher<NetworthTrend[]>(params ? `/api/networth/trends?${new URLSearchParams(params).toString()}` : '/api/networth/trends'),
};
