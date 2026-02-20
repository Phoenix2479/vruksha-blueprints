
export interface Segment {
  id: string;
  name: string;
  description: string;
  criteria: Record<string, any>;
  customer_count: number;
  created_at: string;
}

export interface CustomerInsight {
  customer_id: string;
  rfm_score: number;
  segment: string;
  clv: number;
  churn_risk: number;
  recommended_products: string[];
}

export interface Recommendation {
  id: string;
  customer_id: string;
  product_id: string;
  score: number;
  reason: string;
}

export interface ChurnPrediction {
  customer_id: string;
  churn_probability: number;
  risk_level: 'low' | 'medium' | 'high';
  factors: string[];
}

export interface AIStats {
  totalInsights: number;
  highImpact: number;
  actionable: number;
  accuracy: number;
}

export interface Insight {
  id: string;
  type: 'opportunity' | 'warning' | 'recommendation' | 'trend';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  confidence: number;
  actionable: boolean;
  suggestedAction?: string;
  created_at: string;
}

export interface Prediction {
  id: string;
  type: string;
  title: string;
  predictedValue: number;
  timeframe: string;
  confidence: number;
  factors: string[];
}


const API_BASE = import.meta.env.VITE_AI_BEHAVIOR_ENGINE_API || 'http://localhost:8942';


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


export const aiInsightsApi = {
  getSegments: (params?: Record<string, any>) => fetcher<Segment[]>(params ? `/api/segments?${new URLSearchParams(params).toString()}` : '/api/segments'),
  getCustomerInsights: (id: string, params?: Record<string, any>) => fetcher<CustomerInsight>(params ? `/api/customers/${id}/insights?${new URLSearchParams(params).toString()}` : `/api/customers/${id}/insights`),
  generateRecommendations: (data?: any) => fetcher<Recommendation[]>('/api/recommendations/generate', { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  getChurnPredictions: (params?: Record<string, any>) => fetcher<ChurnPrediction[]>(params ? `/api/churn/predictions?${new URLSearchParams(params).toString()}` : '/api/churn/predictions'),
  createSegment: (data?: any) => fetcher<Segment>('/api/segments/create', { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  getStats: (params?: Record<string, any>) => fetcher<AIStats>(params ? `/api/stats?${new URLSearchParams(params).toString()}` : '/api/stats'),
  getInsights: (params?: Record<string, any>) => fetcher<Insight[]>(params ? `/api/insights?${new URLSearchParams(params).toString()}` : '/api/insights'),
  getPredictions: (params?: Record<string, any>) => fetcher<Prediction[]>(params ? `/api/predictions?${new URLSearchParams(params).toString()}` : '/api/predictions'),
  dismissInsight: (id: string, data?: any) => fetcher<void>(`/api/insights/${id}/dismiss`, { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  applyRecommendation: (id: string, data?: any) => fetcher<void>(`/api/recommendations/${id}/apply`, { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
};
