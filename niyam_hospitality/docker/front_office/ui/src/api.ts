// Front Office API Client
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8911';

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
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    // Handle new error format: { success: false, error: { code, message } }
    if (data?.error?.message) {
      throw new ApiError(data.error.message, data.error.code || 'UNKNOWN_ERROR', res.status);
    }
    // Handle legacy error format: { error: string }
    if (data?.error) {
      throw new ApiError(typeof data.error === 'string' ? data.error : 'API request failed', 'UNKNOWN_ERROR', res.status);
    }
    throw new ApiError(res.statusText || 'API request failed', 'HTTP_ERROR', res.status);
  }

  if (!data?.success && data?.error) {
    throw new ApiError(data.error.message || data.error, data.error.code || 'UNKNOWN_ERROR', res.status);
  }

  return data;
}

// Types
export interface GuestArrival {
  id: string;
  guest_name: string;
  email?: string;
  phone?: string;
  room_number: string;
  room_type?: string;
  reservation_id: string;
  arrival_time: string;
  nights: number;
  status: 'expected' | 'checked_in' | 'no_show';
  special_requests?: string;
  adults?: number;
  children?: number;
  source?: string;
}

export interface GuestDeparture {
  id: string;
  guest_name: string;
  room_number: string;
  checkout_time: string;
  balance: number;
  payment_status: string;
}

export interface InhouseGuest {
  id: string;
  guest_name: string;
  phone?: string;
  room_number: string;
  room_type?: string;
  floor_number?: string;
  check_in_date: string;
  check_out_date: string;
  total_amount: number;
  paid_amount: number;
}

export interface FrontOfficeStats {
  expected_arrivals: number;
  departures_today: number;
  inhouse_guests: number;
  total_rooms: number;
  available_rooms: number;
  occupancy_rate: number;
}

export interface TimelineReservation {
  booking_id: string;
  room_id: string;
  room_number: string;
  room_type: string;
  floor?: number;
  guest_id: string;
  guest_name: string;
  check_in: string;
  check_out: string;
  status: string;
  group_label?: string;
  colorIdx?: number;
}

// API Functions
export async function getArrivals(): Promise<GuestArrival[]> {
  const data = await fetchApi<{ success: boolean; arrivals: GuestArrival[] }>('/arrivals');
  return data.arrivals;
}

export async function getDepartures(): Promise<GuestDeparture[]> {
  const data = await fetchApi<{ success: boolean; departures: GuestDeparture[] }>('/departures');
  return data.departures;
}

export async function getInhouseGuests(): Promise<InhouseGuest[]> {
  const data = await fetchApi<{ success: boolean; guests: InhouseGuest[] }>('/inhouse');
  return data.guests;
}

export async function getStats(): Promise<FrontOfficeStats> {
  const data = await fetchApi<{ success: boolean; stats: FrontOfficeStats }>('/stats');
  return data.stats;
}

export async function checkInGuest(bookingId: string, idProofType?: string, idProofNumber?: string): Promise<void> {
  await fetchApi('/checkin', {
    method: 'POST',
    body: JSON.stringify({
      booking_id: bookingId,
      id_proof_type: idProofType,
      id_proof_number: idProofNumber,
    }),
  });
}

export async function checkOutGuest(bookingId: string, paymentMethod?: string): Promise<{ balance_settled: number }> {
  const data = await fetchApi<{ success: boolean; balance_settled: number }>('/checkout', {
    method: 'POST',
    body: JSON.stringify({
      booking_id: bookingId,
      payment_method: paymentMethod,
    }),
  });
  return { balance_settled: data.balance_settled };
}

export async function createReservation(reservation: {
  guest_name: string;
  guest_email?: string;
  guest_phone?: string;
  room_id: string;
  check_in_date: string;
  check_out_date: string;
  adults_count?: number;
  children_count?: number;
  notes?: string;
  source?: string;
}): Promise<void> {
  await fetchApi('/reservations', {
    method: 'POST',
    body: JSON.stringify(reservation),
  });
}

export async function getReservationsForTimeline(fromDate: string, toDate: string): Promise<TimelineReservation[]> {
  const data = await fetchApi<{ success: boolean; reservations: any[] }>(`/reservations?from_date=${fromDate}&to_date=${toDate}`);
  
  // Transform the reservation data for timeline display
  return data.reservations.map(r => ({
    booking_id: r.id,
    room_id: r.room_id,
    room_number: r.room_number,
    room_type: r.room_type,
    floor: r.floor_number,
    guest_id: r.guest_id,
    guest_name: r.guest_name,
    check_in: r.check_in_date?.split('T')[0] || r.check_in_date,
    check_out: r.check_out_date?.split('T')[0] || r.check_out_date,
    status: r.status,
  }));
}
