
export interface Language {
  code: string;
  name: string;
  native_name: string;
  rtl: boolean;
  enabled: boolean;
}

export interface CoverageReport {
  by_language: Array<{
    language: string;
    total_keys: number;
    translated: number;
    coverage_percent: number;
  }>;
}


const API_BASE = import.meta.env.VITE_LANGUAGE_SUPPORT_API || 'http://localhost:8954';


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


export const languageApi = {
  getLanguages: (params?: Record<string, any>) => fetcher<Language[]>(params ? `/api/languages?${new URLSearchParams(params).toString()}` : '/api/languages'),
  getTranslations: (params?: Record<string, any>) => fetcher<Record<string, string>>(params ? `/api/translations?${new URLSearchParams(params).toString()}` : '/api/translations'),
  updateTranslation: (key: string, data?: any) => fetcher<void>(`/api/translations/${key}`, { method: 'PUT', body: data ? JSON.stringify(data) : undefined }),
  getCoverage: (params?: Record<string, any>) => fetcher<CoverageReport>(params ? `/api/translations/coverage?${new URLSearchParams(params).toString()}` : '/api/translations/coverage'),
};
