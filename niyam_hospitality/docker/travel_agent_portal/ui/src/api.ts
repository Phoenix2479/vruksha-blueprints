const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8936';

export class ApiError extends Error {
  code: string;
  statusCode: number;
  constructor(message: string, code: string, statusCode: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (data?.error?.message) throw new ApiError(data.error.message, data.error.code || 'UNKNOWN_ERROR', res.status);
    if (data?.error) throw new ApiError(typeof data.error === 'string' ? data.error : 'API request failed', 'UNKNOWN_ERROR', res.status);
    throw new ApiError(res.statusText || 'API request failed', 'HTTP_ERROR', res.status);
  }
  if (!data?.success && data?.error) throw new ApiError(data.error.message || data.error, data.error.code || 'UNKNOWN_ERROR', res.status);
  return data;
}

export interface Agent { id: string; agent_code: string; company_name: string; contact_name?: string; email: string; phone?: string; commission_rate: number; status: string; total_bookings: number; total_revenue: number; }
export interface AgentBooking { id: string; agent_name: string; guest_name: string; room_type: string; check_in: string; check_out: string; amount: number; commission: number; status: string; }
export interface Commission { id: string; agent_name: string; period: string; bookings_count: number; total_revenue: number; commission_amount: number; status: string; paid_at?: string; }
export interface AgentStats { total_agents: number; active_agents: number; bookings_month: number; revenue_month: number; commissions_due: number; }

export async function getAgents(): Promise<Agent[]> { const data = await fetchApi<{ success: boolean; agents: Agent[] }>('/agents'); return data.agents; }
export async function getAgentBookings(): Promise<AgentBooking[]> { const data = await fetchApi<{ success: boolean; bookings: AgentBooking[] }>('/bookings'); return data.bookings; }
export async function getCommissions(): Promise<Commission[]> { const data = await fetchApi<{ success: boolean; commissions: Commission[] }>('/commissions'); return data.commissions; }
export async function getStats(): Promise<AgentStats> { const data = await fetchApi<{ success: boolean; stats: AgentStats }>('/stats'); return data.stats; }
export async function createAgent(agent: Partial<Agent>): Promise<Agent> { const data = await fetchApi<{ success: boolean; agent: Agent }>('/agents', { method: 'POST', body: JSON.stringify(agent) }); return data.agent; }
