import { createAPIClient } from '../../../../shared/utils/api';
const vendorAPI = createAPIClient('vendors');

export interface Vendor {
  id: number; name: string; code: string; email: string; phone?: string;
  status: 'active' | 'inactive' | 'pending';
  rating: number; totalOrders: number; totalValue: number;
  paymentTerms: string; leadTime: number;
  createdAt: string;
}

export interface VendorStats {
  totalVendors: number; active: number; avgRating: number; pendingPayments: number;
}

const mapVendor = (v: Record<string, unknown>): Vendor => ({
  id: v.id as number, name: v.name as string, code: v.code as string,
  email: v.email as string, phone: v.phone as string,
  status: v.status as Vendor['status'] || 'active',
  rating: parseFloat(v.rating as string) || 0, totalOrders: v.total_orders as number || 0,
  totalValue: parseFloat(v.total_value as string) || 0,
  paymentTerms: v.payment_terms as string || 'Net 30', leadTime: v.lead_time as number || 7,
  createdAt: v.created_at as string,
});

export const vendorPortalApi = {
  list: async (params?: { status?: Vendor['status'] }): Promise<Vendor[]> => {
    const response = await vendorAPI.get('/list', { params });
    return (response.data.vendors || []).map(mapVendor);
  },
  get: async (id: number): Promise<Vendor> => {
    const response = await vendorAPI.get(`/${id}`);
    return mapVendor(response.data.vendor);
  },
  create: async (data: { name: string; email: string; phone?: string; paymentTerms?: string }): Promise<Vendor> => {
    const response = await vendorAPI.post('/', { name: data.name, email: data.email, phone: data.phone, payment_terms: data.paymentTerms });
    return mapVendor(response.data.vendor);
  },
  getStats: async (): Promise<VendorStats> => {
    const response = await vendorAPI.get('/stats');
    const s = response.data;
    return { totalVendors: s.total_vendors || 0, active: s.active || 0, avgRating: parseFloat(s.avg_rating) || 0, pendingPayments: parseFloat(s.pending_payments) || 0 };
  },
};
