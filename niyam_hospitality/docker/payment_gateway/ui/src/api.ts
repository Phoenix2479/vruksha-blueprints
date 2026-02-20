const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8940';

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

export interface PaymentMethod { code: string; name: string; icon: string; }
export interface Gateway { id: string; gateway_name: string; gateway_type: string; is_active: boolean; is_default: boolean; supported_methods: string[]; }
export interface Payment { id: string; payment_ref: string; booking_id?: string; amount: number; currency: string; method: string; guest_email?: string; status: string; created_at: string; completed_at?: string; }
export interface Settlement { date: string; method: string; transactions: number; gross_amount: number; refunds: number; net_amount: number; }
export interface PaymentStats { transactions_today: number; amount_today: number; transactions_month: number; amount_month: number; pending_payments: number; }

export async function getMethods(): Promise<PaymentMethod[]> { const data = await fetchApi<{ success: boolean; methods: PaymentMethod[] }>('/methods'); return data.methods; }
export async function getGateways(): Promise<Gateway[]> { const data = await fetchApi<{ success: boolean; gateways: Gateway[] }>('/gateways'); return data.gateways; }
export async function getPayments(params?: { status?: string; limit?: number }): Promise<Payment[]> { 
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  const data = await fetchApi<{ success: boolean; payments: Payment[] }>(`/history?${searchParams}`); 
  return data.payments; 
}
export async function getSettlements(): Promise<Settlement[]> { const data = await fetchApi<{ success: boolean; settlements: Settlement[] }>('/settlements'); return data.settlements; }
export async function getStats(): Promise<PaymentStats> { const data = await fetchApi<{ success: boolean; stats: PaymentStats }>('/stats'); return data.stats; }
export async function initiateRefund(paymentId: string, amount?: number, reason?: string): Promise<void> { 
  await fetchApi('/refund', { method: 'POST', body: JSON.stringify({ payment_id: paymentId, amount, reason }) }); 
}
