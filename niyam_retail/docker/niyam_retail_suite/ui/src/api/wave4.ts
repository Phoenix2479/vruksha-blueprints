import { promotionsAPI, pricingAPI } from '../../../../shared/utils/api.ts';

// Promotions
export const listPromotions = async (active?: boolean) => {
  const r = await promotionsAPI.get('/promotions', { params: { active } });
  return r.data.promotions as any[];
};
export const createPromotion = async (promo: any) => {
  const r = await promotionsAPI.post('/promotions', promo);
  return r.data.promotion as any;
};
export const updatePromotion = async (id: string, patch: any) => {
  const r = await promotionsAPI.patch(`/promotions/${id}`, patch);
  return r.data.promotion as any;
};
export const validatePromotion = async (code: string, items: { sku:string, price:number, quantity:number }[]) => {
  const r = await promotionsAPI.post('/promotions/validate', { code, items });
  return r.data as any;
};

// Pricing
export const updatePrice = async (sku: string, new_price: number, reason?: string) => {
  const r = await pricingAPI.post('/price/update', { sku, new_price, reason });
  return r.data.product as any;
};
export const priceHistory = async (sku: string) => {
  const r = await pricingAPI.get('/price/history', { params: { sku } });
  return r.data.history as any[];
};
export const quotePrices = async (items: { sku:string, quantity:number }[]) => {
  const r = await pricingAPI.post('/price/quote', { items });
  return r.data as any;
};
