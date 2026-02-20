
export interface SyncConnection {
  id: string;
  platform: string;
  name: string;
  status: 'active' | 'inactive' | 'error';
  last_sync: string;
  config: Record<string, any>;
}

export interface SyncJob {
  id: string;
  connection_id: string;
  direction: 'import' | 'export' | 'bidirectional';
  status: 'running' | 'completed' | 'failed';
  records_synced: number;
  started_at: string;
  completed_at?: string;
}

export interface SyncConflict {
  id: string;
  record_type: string;
  record_id: string;
  local_value: any;
  remote_value: any;
  detected_at: string;
}


const API_BASE = import.meta.env.VITE_SYNC_API || 'http://localhost:8972';


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


export const syncApi = {
  getConnections: (params?: Record<string, any>) => fetcher<SyncConnection[]>(params ? `/api/sync/connections?${new URLSearchParams(params).toString()}` : '/api/sync/connections'),
  createConnection: (data?: any) => fetcher<SyncConnection>('/api/sync/connections/create', { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  getSyncJobs: (params?: Record<string, any>) => fetcher<SyncJob[]>(params ? `/api/sync/jobs?${new URLSearchParams(params).toString()}` : '/api/sync/jobs'),
  triggerSync: (data?: any) => fetcher<SyncJob>('/api/sync/trigger', { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  getConflicts: (params?: Record<string, any>) => fetcher<SyncConflict[]>(params ? `/api/sync/conflicts?${new URLSearchParams(params).toString()}` : '/api/sync/conflicts'),
  resolveConflict: (id: string, data?: any) => fetcher<void>(`/api/sync/conflicts/${id}/resolve`, { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
};
