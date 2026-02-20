
export interface Shipment {
  id: string;
  tracking_number: string;
  carrier: string;
  origin: string;
  destination: string;
  status: 'pending' | 'in_transit' | 'delivered' | 'failed';
  created_at: string;
  delivered_at?: string;
}

export interface TrackingInfo {
  shipment_id: string;
  current_location: string;
  status: string;
  estimated_delivery: string;
  events: Array<{
    timestamp: string;
    location: string;
    description: string;
  }>;
}

export interface CarrierMetrics {
  carrier: string;
  on_time_percent: number;
  avg_delivery_days: number;
  total_shipments: number;
}


const API_BASE = import.meta.env.VITE_LOGISTICS_API || 'http://localhost:8955';


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


export const logisticsApi = {
  getShipments: (params?: Record<string, any>) => fetcher<Shipment[]>(params ? `/api/shipments?${new URLSearchParams(params).toString()}` : '/api/shipments'),
  createShipment: (data?: any) => fetcher<Shipment>('/api/shipments/create', { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  trackShipment: (id: string) => fetcher<TrackingInfo>(`/api/shipments/${id}/track`),
  updateDeliveryStatus: (id: string, data?: any) => fetcher<Shipment>(`/api/shipments/${id}/status`, { method: 'PUT', body: data ? JSON.stringify(data) : undefined }),
  getCarrierMetrics: (params?: Record<string, any>) => fetcher<CarrierMetrics[]>(params ? `/api/carriers/metrics?${new URLSearchParams(params).toString()}` : '/api/carriers/metrics'),
};
