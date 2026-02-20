
export interface Batch {
  id: string;
  batch_number: string;
  product_id: string;
  quantity: number;
  production_date: string;
  expiry_date: string;
  status: 'active' | 'quarantined' | 'released' | 'recalled';
}

export interface Defect {
  id: string;
  batch_id: string;
  type: 'critical' | 'major' | 'minor';
  description: string;
  reported_at: string;
  resolved: boolean;
}

export interface QualityMetrics {
  defect_rate: number;
  first_pass_yield: number;
  rejection_rate: number;
  compliance_score: number;
}


const API_BASE = (typeof window !== 'undefined' && (window as any).REACT_APP_QUALITY_CONTROL_API) || 'http://localhost:8967';


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


export const qualityApi = {
  getBatches: (params?: Record<string, any>) => fetcher<Batch[]>(params ? `/api/batches?${new URLSearchParams(params).toString()}` : '/api/batches'),
  createBatch: (data?: any) => fetcher<Batch>('/api/batches/create', { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  logDefect: (data?: any) => fetcher<Defect>('/api/defects/log', { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  getDefects: (params?: Record<string, any>) => fetcher<Defect[]>(params ? `/api/defects?${new URLSearchParams(params).toString()}` : '/api/defects'),
  getQualityMetrics: (params?: Record<string, any>) => fetcher<QualityMetrics>(params ? `/api/quality/metrics?${new URLSearchParams(params).toString()}` : '/api/quality/metrics'),
};
