import { kioskAPI, warrantyAPI } from '../../../../shared/utils/api.ts';

export const listKioskOrders = async () => {
  const r = await kioskAPI.get('/kiosk/orders');
  return r.data.orders as any[];
};
export const createKioskOrder = async (kiosk_id: string, items: any[]) => {
  const r = await kioskAPI.post('/kiosk/orders', { kiosk_id, items });
  return r.data.order as any;
};
export const updateKioskStatus = async (id: string, order_status: string) => {
  const r = await kioskAPI.patch(`/kiosk/orders/${id}/status`, { order_status });
  return r.data.order as any;
};

export const listWarranties = async () => {
  const r = await warrantyAPI.get('/warranties');
  return r.data.warranties as any[];
};
export const createWarranty = async (payload: any) => {
  const r = await warrantyAPI.post('/warranties', payload);
  return r.data.warranty as any;
};
export const claimWarranty = async (id: string, claim_notes?: string) => {
  const r = await warrantyAPI.patch(`/warranties/${id}/claim`, { claim_notes });
  return r.data.warranty as any;
};
