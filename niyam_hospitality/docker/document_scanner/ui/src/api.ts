const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8939';

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

export interface DocumentScan { id: string; guest_name: string; document_type: string; document_number?: string; nationality?: string; scan_quality: string; verified: boolean; scanned_at: string; }
export interface RegistrationCard { id: string; booking_id: string; guest_name: string; room_number: string; check_in: string; status: string; signed_at?: string; }
export interface ComplianceReport { id: string; report_type: string; period: string; records_count: number; status: string; submitted_at?: string; }
export interface ScannerStats { scans_today: number; scans_week: number; verification_rate: number; pending_cards: number; compliance_due: number; }

export async function getRecentScans(): Promise<DocumentScan[]> { const data = await fetchApi<{ success: boolean; scans: DocumentScan[] }>('/scans?limit=50'); return data.scans; }
export async function getRegistrationCards(): Promise<RegistrationCard[]> { const data = await fetchApi<{ success: boolean; cards: RegistrationCard[] }>('/registration-cards'); return data.cards; }
export async function getComplianceReports(): Promise<ComplianceReport[]> { const data = await fetchApi<{ success: boolean; reports: ComplianceReport[] }>('/compliance'); return data.reports; }
export async function getStats(): Promise<ScannerStats> { const data = await fetchApi<{ success: boolean; stats: ScannerStats }>('/stats'); return data.stats; }
