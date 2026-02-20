import { createAPIClient } from '../../../../shared/utils/api';
const returnsAPI = createAPIClient('returns');

export interface ReturnItem {
  sku: string;
  quantity: number;
  unitPrice: number;
  reason?: string;
}

export interface Return {
  id: string;
  returnNumber: string;
  transactionId?: string;
  customerId?: string;
  storeId: string;
  items: ReturnItem[];
  subtotal: number;
  tax: number;
  total: number;
  refundMethod?: string;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReturnStats {
  totalReturns: number;
  pendingReturns: number;
  approvedReturns: number;
  completedReturns: number;
  totalValue: number;
  refundedValue: number;
  todayReturns: number;
  todayValue: number;
}

export interface DamageReport {
  sku: string;
  quantity: number;
  damageType: 'broken' | 'expired' | 'defective' | 'water_damage' | 'other';
  description?: string;
  action?: 'write_off' | 'return_to_vendor' | 'repair' | 'dispose';
}

export interface ReasonSummary {
  reason: string;
  count: number;
  totalValue: number;
}

const mapReturn = (r: Record<string, unknown>): Return => ({
  id: r.id as string,
  returnNumber: r.return_number as string,
  transactionId: r.transaction_id as string,
  customerId: r.customer_id as string,
  storeId: r.store_id as string,
  items: (typeof r.items === 'string' ? JSON.parse(r.items) : r.items) as ReturnItem[] || [],
  subtotal: parseFloat(r.subtotal as string) || 0,
  tax: parseFloat(r.tax as string) || 0,
  total: parseFloat(r.total as string) || 0,
  refundMethod: r.refund_method as string,
  reason: r.reason as string,
  status: r.status as Return['status'],
  notes: r.notes as string,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

export const returnsApi = {
  getStats: async (): Promise<ReturnStats> => {
    const response = await returnsAPI.get('/stats');
    const s = response.data;
    return {
      totalReturns: s.total_returns || 0,
      pendingReturns: s.pending_returns || 0,
      approvedReturns: s.approved_returns || 0,
      completedReturns: s.completed_returns || 0,
      totalValue: s.total_value || 0,
      refundedValue: s.refunded_value || 0,
      todayReturns: s.today_returns || 0,
      todayValue: s.today_value || 0,
    };
  },

  list: async (params?: { status?: string; from?: Date; to?: Date }): Promise<Return[]> => {
    const queryParams: Record<string, string> = {};
    if (params?.status) queryParams.status = params.status;
    if (params?.from) queryParams.from = params.from.toISOString();
    if (params?.to) queryParams.to = params.to.toISOString();
    
    const response = await returnsAPI.get('/returns', { params: queryParams });
    return (response.data.returns || []).map(mapReturn);
  },

  get: async (id: string): Promise<Return> => {
    const response = await returnsAPI.get(`/returns/${id}`);
    return mapReturn(response.data.return);
  },

  create: async (data: {
    transactionId?: string;
    customerId?: string;
    storeId?: string;
    items: { sku: string; quantity: number; unit_price: number; reason?: string }[];
    refundMethod?: string;
    reason?: string;
    notes?: string;
  }): Promise<Return> => {
    const response = await returnsAPI.post('/returns', {
      transaction_id: data.transactionId,
      customer_id: data.customerId,
      store_id: data.storeId,
      items: data.items,
      refund_method: data.refundMethod,
      reason: data.reason,
      notes: data.notes,
    });
    return mapReturn(response.data.return);
  },

  updateStatus: async (id: string, status: Return['status'], notes?: string): Promise<Return> => {
    const response = await returnsAPI.patch(`/returns/${id}/status`, { status, notes });
    return mapReturn(response.data.return);
  },

  processRefund: async (id: string, refundMethod?: string): Promise<Return> => {
    const response = await returnsAPI.post(`/returns/${id}/refund`, { refund_method: refundMethod });
    return mapReturn(response.data.return);
  },

  reportDamage: async (data: DamageReport): Promise<Return> => {
    const response = await returnsAPI.post('/damage', {
      sku: data.sku,
      quantity: data.quantity,
      damage_type: data.damageType,
      description: data.description,
      action: data.action,
    });
    return mapReturn(response.data.damage_report);
  },

  listDamageReports: async (): Promise<Return[]> => {
    const response = await returnsAPI.get('/damage');
    return (response.data.damage_reports || []).map(mapReturn);
  },

  getReasonsSummary: async (): Promise<ReasonSummary[]> => {
    const response = await returnsAPI.get('/reasons');
    return (response.data.reasons || []).map((r: Record<string, unknown>) => ({
      reason: r.reason as string,
      count: parseInt(r.count as string) || 0,
      totalValue: parseFloat(r.total_value as string) || 0,
    }));
  },
};
