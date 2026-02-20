import { taxAPI, reportingAPI } from '../../../../shared/utils/api.ts';

export const taxSummary = async (from: string, to: string, include_unpaid?: boolean) => {
  const r = await taxAPI.get('/tax/summary', { params: { from, to, include_unpaid } });
  return r.data.summary as any;
};
export const taxByRate = async (from: string, to: string, include_unpaid?: boolean) => {
  const r = await taxAPI.get('/tax/by_rate', { params: { from, to, include_unpaid } });
  return r.data.by_rate as any[];
};

export const revenueReport = async (from: string, to: string) => {
  const r = await reportingAPI.get('/reports/revenue', { params: { from, to } });
  return r.data.by_status as any[];
};
export const auditList = async (limit = 100) => {
  const r = await reportingAPI.get('/audit', { params: { limit } });
  return r.data.audit as any[];
};
