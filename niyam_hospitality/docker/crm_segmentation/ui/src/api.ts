const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8934';

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
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (data?.error?.message) throw new ApiError(data.error.message, data.error.code || 'UNKNOWN_ERROR', res.status);
    if (data?.error) throw new ApiError(typeof data.error === 'string' ? data.error : 'API request failed', 'UNKNOWN_ERROR', res.status);
    throw new ApiError(res.statusText || 'API request failed', 'HTTP_ERROR', res.status);
  }
  if (!data?.success && data?.error) throw new ApiError(data.error.message || data.error, data.error.code || 'UNKNOWN_ERROR', res.status);
  return data;
}

export interface Segment {
  id: string;
  code: string;
  name: string;
  description?: string;
  color: string;
  priority: number;
  auto_assign: boolean;
  criteria?: Record<string, unknown>;
  guest_count?: number;
}

export interface Lead {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  source: string;
  status: string;
  score: number;
  assigned_to?: string;
  notes?: string;
  created_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  type: string;
  status: string;
  segment_id?: string;
  segment_name?: string;
  subject?: string;
  scheduled_at?: string;
  sent_count: number;
  open_rate?: number;
  click_rate?: number;
  created_at: string;
}

export interface GuestInteraction {
  id: string;
  guest_id: string;
  guest_name: string;
  type: string;
  channel: string;
  subject?: string;
  notes?: string;
  created_at: string;
}

export interface CRMStats {
  total_guests: number;
  vip_guests: number;
  repeat_guests: number;
  new_guests_month: number;
  active_campaigns: number;
  open_leads: number;
}

export async function getSegments(): Promise<Segment[]> {
  const data = await fetchApi<{ success: boolean; segments: Segment[] }>('/segments');
  return data.segments;
}

export async function getLeads(status?: string): Promise<Lead[]> {
  const url = status ? `/leads?status=${status}` : '/leads';
  const data = await fetchApi<{ success: boolean; leads: Lead[] }>(url);
  return data.leads;
}

export async function getCampaigns(): Promise<Campaign[]> {
  const data = await fetchApi<{ success: boolean; campaigns: Campaign[] }>('/campaigns');
  return data.campaigns;
}

export async function getStats(): Promise<CRMStats> {
  const data = await fetchApi<{ success: boolean; stats: CRMStats }>('/stats');
  return data.stats;
}

export async function getRecentInteractions(): Promise<GuestInteraction[]> {
  const data = await fetchApi<{ success: boolean; interactions: GuestInteraction[] }>('/interactions?limit=20');
  return data.interactions;
}

export async function createLead(lead: Partial<Lead>): Promise<Lead> {
  const data = await fetchApi<{ success: boolean; lead: Lead }>('/leads', {
    method: 'POST',
    body: JSON.stringify(lead),
  });
  return data.lead;
}

export async function updateLeadStatus(id: string, status: string): Promise<void> {
  await fetchApi(`/leads/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function createCampaign(campaign: Partial<Campaign>): Promise<Campaign> {
  const data = await fetchApi<{ success: boolean; campaign: Campaign }>('/campaigns', {
    method: 'POST',
    body: JSON.stringify(campaign),
  });
  return data.campaign;
}
