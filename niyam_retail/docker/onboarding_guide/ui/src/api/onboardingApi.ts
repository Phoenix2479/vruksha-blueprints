
export interface OnboardingStatus {
  total_steps: number;
  completed_steps: number;
  current_step: number;
  steps: Array<{
    id: string;
    title: string;
    description: string;
    completed: boolean;
    required: boolean;
  }>;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  business_type: string;
  includes: string[];
}


const API_BASE = import.meta.env.VITE_ONBOARDING_GUIDE_API || 'http://localhost:8961';


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


export const onboardingApi = {
  getStatus: (params?: Record<string, any>) => fetcher<OnboardingStatus>(params ? `/api/onboarding/status?${new URLSearchParams(params).toString()}` : '/api/onboarding/status'),
  completeStep: (id: string, data?: any) => fetcher<void>(`/api/onboarding/steps/${id}/complete`, { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  getTemplates: (params?: Record<string, any>) => fetcher<Template[]>(params ? `/api/onboarding/templates?${new URLSearchParams(params).toString()}` : '/api/onboarding/templates'),
  loadSampleData: (data?: any) => fetcher<void>('/api/onboarding/sample-data/load', { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
};
