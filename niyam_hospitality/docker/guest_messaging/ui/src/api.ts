const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8931';

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

export interface Template {
  id: string;
  name: string;
  channel: string;
  trigger_event?: string;
  category: string;
  subject?: string;
  body: string;
  variables: string[];
  is_active: boolean;
}

export interface Automation {
  id: string;
  name: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  template_id?: string;
  template_name?: string;
  channel: string;
  delay_minutes: number;
  is_active: boolean;
  sent_count: number;
}

export interface Message {
  id: string;
  guest_id: string;
  guest_name: string;
  channel: string;
  direction: string;
  subject?: string;
  content: string;
  status: string;
  sent_at?: string;
  created_at: string;
}

export interface MessagingStats {
  messages_today: number;
  messages_week: number;
  active_templates: number;
  active_automations: number;
  delivery_rate: number;
  open_rate: number;
}

export async function getTemplates(): Promise<Template[]> {
  const data = await fetchApi<{ success: boolean; templates: Template[] }>('/templates');
  return data.templates;
}

export async function getAutomations(): Promise<Automation[]> {
  const data = await fetchApi<{ success: boolean; automations: Automation[] }>('/automations');
  return data.automations;
}

export async function getMessages(limit?: number): Promise<Message[]> {
  const url = limit ? `/messages?limit=${limit}` : '/messages';
  const data = await fetchApi<{ success: boolean; messages: Message[] }>(url);
  return data.messages;
}

export async function getStats(): Promise<MessagingStats> {
  const data = await fetchApi<{ success: boolean; stats: MessagingStats }>('/stats');
  return data.stats;
}

export async function createTemplate(template: Partial<Template>): Promise<Template> {
  const data = await fetchApi<{ success: boolean; template: Template }>('/templates', {
    method: 'POST',
    body: JSON.stringify(template),
  });
  return data.template;
}

export async function toggleAutomation(id: string, isActive: boolean): Promise<void> {
  await fetchApi(`/automations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: isActive }),
  });
}

export async function sendMessage(guestId: string, channel: string, content: string, subject?: string): Promise<void> {
  await fetchApi('/messages/send', {
    method: 'POST',
    body: JSON.stringify({ guest_id: guestId, channel, content, subject }),
  });
}
