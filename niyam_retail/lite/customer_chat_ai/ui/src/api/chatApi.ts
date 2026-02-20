
export interface ChatResponse {
  message: string;
  intent: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  confidence: number;
  suggested_actions?: string[];
}

export interface Conversation {
  id: string;
  customer_id: string;
  status: 'active' | 'resolved' | 'escalated';
  last_message_at: string;
  message_count: number;
}

export interface Message {
  id: string;
  sender: 'customer' | 'ai' | 'agent';
  content: string;
  timestamp: string;
  intent?: string;
}

export interface ChatAnalytics {
  total_conversations: number;
  avg_resolution_time: number;
  satisfaction_score: number;
  escalation_rate: number;
}


const API_BASE = import.meta.env.VITE_CUSTOMER_CHAT_AI_API || 'http://localhost:8949';


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


export const chatApi = {
  sendMessage: (data?: any) => fetcher<ChatResponse>('/api/chat/message', { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  getConversations: (params?: Record<string, any>) => fetcher<Conversation[]>(params ? `/api/chat/conversations?${new URLSearchParams(params).toString()}` : '/api/chat/conversations'),
  getConversationHistory: (id: string, params?: Record<string, any>) => fetcher<Message[]>(params ? `/api/chat/conversations/${id}/history?${new URLSearchParams(params).toString()}` : `/api/chat/conversations/${id}/history`),
  escalateToHuman: (data?: any) => fetcher<void>('/api/chat/escalate', { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  getAnalytics: (params?: Record<string, any>) => fetcher<ChatAnalytics>(params ? `/api/chat/analytics?${new URLSearchParams(params).toString()}` : '/api/chat/analytics'),
};
