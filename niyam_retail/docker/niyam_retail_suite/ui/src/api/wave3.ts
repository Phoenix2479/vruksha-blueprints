import { returnsAPI, multistoreAPI, supplyAPI, procurementAPI, vendorAPI } from '../../../../shared/utils/api.ts';

// Returns
export const listReturns = async () => {
  const r = await returnsAPI.get('/returns');
  return r.data.returns as any[];
};
export const createReturn = async (payload: any) => {
  const r = await returnsAPI.post('/returns', payload);
  return r.data.return as any;
};
export const updateReturnStatus = async (id: string, status: string) => {
  const r = await returnsAPI.patch(`/returns/${id}/status`, { status });
  return r.data.return as any;
};

// Transfers
export const listTransfers = async () => {
  const r = await multistoreAPI.get('/transfers');
  return r.data.transfers as any[];
};
export const createTransfer = async (items: any[]) => {
  const r = await multistoreAPI.post('/transfers', { items });
  return r.data.transfer as any;
};
export const updateTransferStatus = async (id: string, status: string) => {
  const r = await multistoreAPI.patch(`/transfers/${id}/status`, { status });
  return r.data.transfer as any;
};

// Purchase Orders
export const listPOs = async () => {
  const r = await supplyAPI.get('/purchase_orders');
  return r.data.pos as any[];
};
export const createPO = async (supplier_id: string, items: any[], notes?: string) => {
  const r = await procurementAPI.post('/pos', { supplier_id, items, notes });
  return r.data.po as any;
};
export const updatePOStatus = async (id: string, status: string) => {
  const r = await supplyAPI.patch(`/purchase_orders/${id}/status`, { status });
  return r.data.po as any;
};

// Vendors
export const listVendors = async () => {
  const r = await vendorAPI.get('/vendors');
  return r.data.vendors as any[];
};
export const createVendor = async (code: string, name: string, email?: string) => {
  const r = await vendorAPI.post('/vendors', { code, name, email });
  return r.data.vendor as any;
};
