
export interface Investment {
  id: string;
  name: string;
  amount: number;
  returns: number;
  roi_percent: number;
  payback_months: number;
  status: 'active' | 'completed' | 'planned';
}

export interface GMROIData {
  overall_gmroi: number;
  by_category: Array<{
    category: string;
    gmroi: number;
    inventory_value: number;
    gross_margin: number;
  }>;
}

export interface ProductProfitability {
  product_id: string;
  product_name: string;
  revenue: number;
  cost: number;
  gross_profit: number;
  margin_percent: number;
}

export interface CampaignROI {
  campaign_id: string;
  campaign_name: string;
  spend: number;
  revenue: number;
  roi: number;
}


const API_BASE = import.meta.env.VITE_ROI_ANALYSIS_API || 'http://localhost:8969';


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


export const roiApi = {
  getInvestments: (params?: Record<string, any>) => fetcher<Investment[]>(params ? `/api/investments?${new URLSearchParams(params).toString()}` : '/api/investments'),
  createInvestment: (data?: any) => fetcher<Investment>('/api/investments/create', { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  getGMROI: (params?: Record<string, any>) => fetcher<GMROIData>(params ? `/api/roi/gmroi?${new URLSearchParams(params).toString()}` : '/api/roi/gmroi'),
  getProductProfitability: (params?: Record<string, any>) => fetcher<ProductProfitability[]>(params ? `/api/profitability/products?${new URLSearchParams(params).toString()}` : '/api/profitability/products'),
  getCampaignROI: (params?: Record<string, any>) => fetcher<CampaignROI[]>(params ? `/api/roi/campaigns?${new URLSearchParams(params).toString()}` : '/api/roi/campaigns'),
};
