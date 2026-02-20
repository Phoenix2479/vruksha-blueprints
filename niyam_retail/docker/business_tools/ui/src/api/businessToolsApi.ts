
export interface MarginResult {
  gross_margin: number;
  gross_margin_percent: number;
  markup_percent: number;
}

export interface BreakevenResult {
  breakeven_units: number;
  breakeven_revenue: number;
  margin_of_safety: number;
}

export interface ROIResult {
  roi_percent: number;
  payback_months: number;
  net_profit: number;
}

export interface PricingSimulation {
  scenarios: Array<{
    price: number;
    estimated_volume: number;
    revenue: number;
    profit: number;
  }>;
  recommended_price: number;
}

export interface Report {
  id: string;
  type: string;
  data: any;
  generated_at: string;
}


const API_BASE = import.meta.env.VITE_BUSINESS_TOOLS_API || 'http://localhost:8946';


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


export const businessToolsApi = {
  calculateMargin: (data?: any) => fetcher<MarginResult>('/api/calculator/margin', { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  calculateBreakeven: (data?: any) => fetcher<BreakevenResult>('/api/calculator/breakeven', { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  calculateROI: (data?: any) => fetcher<ROIResult>('/api/calculator/roi', { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  simulatePricing: (data?: any) => fetcher<PricingSimulation>('/api/pricing/simulate', { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  generateReport: (data?: any) => fetcher<Report>('/api/reports/generate', { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
};
