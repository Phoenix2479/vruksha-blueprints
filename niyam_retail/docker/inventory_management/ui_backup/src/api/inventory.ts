import { inventoryAPI } from '../../../../shared/utils/api.ts';
import type { Product } from '../../../../shared/types/models.ts';

// Products
export const getProducts = async (params?: {
  search?: string;
  low_stock?: boolean;
  category?: string;
}): Promise<Product[]> => {
  const response = await inventoryAPI.get('/products', { params });
  return response.data.products || [];
};

export const getProduct = async (productId: string): Promise<Product> => {
  const response = await inventoryAPI.get(`/products/${productId}`);
  return response.data.product;
};

export const createProduct = async (data: {
  name: string;
  sku: string;
  category?: string;
  description?: string;
  unit_price: number;
  cost_price?: number;
  tax_rate: number;
  reorder_point?: number;
  reorder_quantity?: number;
}): Promise<Product> => {
  const response = await inventoryAPI.post('/products', data);
  return response.data.product;
};

export const updateProduct = async (productId: string, data: Partial<Product>): Promise<Product> => {
  const response = await inventoryAPI.patch(`/products/${productId}`, data);
  return response.data.product;
};

export const deleteProduct = async (productId: string): Promise<void> => {
  await inventoryAPI.delete(`/products/${productId}`);
};

// Stock
export const getStock = async (productId: string): Promise<any> => {
  const response = await inventoryAPI.get(`/stock/${productId}`);
  return response.data.stock;
};

export const adjustStock = async (data: {
  product_id: string;
  quantity_change: number;
  reason: string;
  notes?: string;
}): Promise<void> => {
  await inventoryAPI.post('/stock/adjust', data);
};

// Low Stock Alerts
export const getLowStockProducts = async (): Promise<Product[]> => {
  const response = await inventoryAPI.get('/products?low_stock=true');
  return response.data.products || [];
};

// Stock History
export const getStockHistory = async (productId: string): Promise<any[]> => {
  const response = await inventoryAPI.get(`/stock/${productId}/history`);
  return response.data.history || [];
};

// -------- Bulk Import API --------
export const createImportSession = async (): Promise<{ session_id: string }> => {
  const res = await inventoryAPI.post('/inventory/import/sessions');
  return res.data;
};

export const uploadImportFiles = async (sessionId: string, files: File[]): Promise<{ rows: number; warnings: string[] }> => {
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  const res = await inventoryAPI.post(`/inventory/import/${sessionId}/files`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return { rows: res.data.rows || 0, warnings: res.data.warnings || [] };
};

export const getImportPreview = async (sessionId: string): Promise<any[]> => {
  const res = await inventoryAPI.get(`/inventory/import/${sessionId}/preview`);
  return res.data.rows || [];
};

export const commitImport = async (
  sessionId: string,
  options: { strategy?: 'create' | 'upsert'; default_tax?: number; default_category?: string; import_notes?: string; rows?: any[] }
): Promise<{ summary: { created: number; updated: number; stock_added: number }; warnings: string[] }> => {
  const res = await inventoryAPI.post(`/inventory/import/${sessionId}/commit`, options || {});
  return res.data;
};

export const uploadProductImages = async (productId: string, files: File[]): Promise<any> => {
  const form = new FormData();
  files.forEach((f) => form.append('images', f));
  const res = await inventoryAPI.post(`/products/${productId}/images`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};
