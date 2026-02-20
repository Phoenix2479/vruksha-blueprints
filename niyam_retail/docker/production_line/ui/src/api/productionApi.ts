
export interface WorkOrder {
  id: string;
  order_number: string;
  product_id: string;
  quantity: number;
  status: 'pending' | 'in_progress' | 'completed' | 'on_hold';
  start_date?: string;
  completion_date?: string;
}

export interface BOM {
  id: string;
  product_id: string;
  components: Array<{
    item_id: string;
    quantity: number;
    unit: string;
  }>;
}

export interface MachineStatus {
  machine_id: string;
  name: string;
  status: 'running' | 'idle' | 'maintenance' | 'down';
  uptime_percent: number;
  current_job?: string;
}

export interface OEEMetrics {
  overall_oee: number;
  availability: number;
  performance: number;
  quality: number;
}


const API_BASE = import.meta.env.VITE_PRODUCTION_LINE_API || 'http://localhost:8965';


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


export const productionApi = {
  getWorkOrders: (params?: Record<string, any>) => fetcher<WorkOrder[]>(params ? `/api/work-orders?${new URLSearchParams(params).toString()}` : '/api/work-orders'),
  createWorkOrder: (data?: any) => fetcher<WorkOrder>('/api/work-orders/create', { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  getBOMs: (params?: Record<string, any>) => fetcher<BOM[]>(params ? `/api/bom?${new URLSearchParams(params).toString()}` : '/api/bom'),
  getMachineStatus: (params?: Record<string, any>) => fetcher<MachineStatus[]>(params ? `/api/machines/status?${new URLSearchParams(params).toString()}` : '/api/machines/status'),
  getOEE: (params?: Record<string, any>) => fetcher<OEEMetrics>(params ? `/api/metrics/oee?${new URLSearchParams(params).toString()}` : '/api/metrics/oee'),
};
