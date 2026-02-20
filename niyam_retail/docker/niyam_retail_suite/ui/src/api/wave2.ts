import { productMgmtAPI, marketplaceAPI, ecommerceAPI, inventoryAPI } from '../../../../shared/utils/api.ts';

export const createCategory = async (name: string) => {
  const r = await productMgmtAPI.post('/categories', { name });
  return r.data.category as any;
};
export const listCategories = async () => {
  const r = await productMgmtAPI.get('/categories');
  return r.data.categories as any[];
};
export const createVariant = async (productId: string, sku: string, attributes?: any, price_override?: number) => {
  const r = await productMgmtAPI.post(`/products/${productId}/variants`, { sku, attributes, price_override });
  return r.data.variant as any;
};
export const listVariants = async (productId: string) => {
  const r = await productMgmtAPI.get(`/products/${productId}/variants`);
  return r.data.variants as any[];
};

export const searchProducts = async (search: string) => {
  const r = await inventoryAPI.get('/products', { params: { search } });
  return r.data as any[];
};

export const pushChannelInventory = async (channel: string, items: any[]) => {
  const r = await marketplaceAPI.post(`/channels/${channel}/inventory_push`, { items });
  return r.data.log as any;
};

export const postEcomOrder = async (source: string, order: any) => {
  const r = await ecommerceAPI.post(`/webhooks/order_created`, order, { params: { source } });
  return r.data as any;
};

export const listChannelLogs = async () => {
  const r = await marketplaceAPI.get('/logs');
  return r.data.logs as any[];
};

export const listEcomOrders = async () => {
  const r = await ecommerceAPI.get('/orders');
  return r.data.orders as any[];
};
