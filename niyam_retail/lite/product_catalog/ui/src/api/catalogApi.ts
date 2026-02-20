// Product Catalog API - Real backend integration
import { inventoryAPI, productMgmtAPI } from '../../../../shared/utils/api';
import type { Product, Category, Brand } from '../../../../shared/types/retail';

// ============================================================================
// PRODUCTS
// ============================================================================

export interface ProductFilters {
  search?: string;
  categoryId?: string;
  brandId?: string;
  status?: 'all' | 'active' | 'inactive';
  hasVariants?: boolean;
  minPrice?: number;
  maxPrice?: number;
  tags?: string[];
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ProductListResponse {
  products: Product[];
  total: number;
  page: number;
  totalPages: number;
}

export const catalogProductApi = {
  list: async (filters: ProductFilters = {}): Promise<ProductListResponse> => {
    const response = await inventoryAPI.get('/products', { params: filters });
    return {
      products: (response.data.products || []).map(mapProduct),
      total: response.data.total || 0,
      page: response.data.page || 1,
      totalPages: response.data.total_pages || 1,
    };
  },

  get: async (id: string): Promise<Product> => {
    const response = await inventoryAPI.get(`/products/${id}`);
    return mapProduct(response.data.product);
  },

  create: async (data: CreateProductRequest): Promise<Product> => {
    const response = await inventoryAPI.post('/products', mapProductToApi(data));
    return mapProduct(response.data.product);
  },

  update: async (id: string, data: Partial<CreateProductRequest>): Promise<Product> => {
    const response = await inventoryAPI.patch(`/products/${id}`, mapProductToApi(data));
    return mapProduct(response.data.product);
  },

  delete: async (id: string): Promise<void> => {
    await inventoryAPI.delete(`/products/${id}`);
  },

  bulkUpdate: async (ids: string[], updates: Partial<CreateProductRequest>): Promise<void> => {
    await inventoryAPI.patch('/products/bulk', {
      ids,
      updates: mapProductToApi(updates),
    });
  },

  bulkDelete: async (ids: string[]): Promise<void> => {
    await inventoryAPI.post('/products/bulk-delete', { ids });
  },

  duplicate: async (id: string): Promise<Product> => {
    const response = await inventoryAPI.post(`/products/${id}/duplicate`);
    return mapProduct(response.data.product);
  },

  import: async (file: File, options?: { updateExisting?: boolean }): Promise<ImportResult> => {
    const formData = new FormData();
    formData.append('file', file);
    if (options?.updateExisting) {
      formData.append('update_existing', 'true');
    }
    const response = await inventoryAPI.post('/products/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  export: async (filters: ProductFilters, format: 'csv' | 'xlsx' = 'csv'): Promise<Blob> => {
    const response = await inventoryAPI.get('/products/export', {
      params: { ...filters, format },
      responseType: 'blob',
    });
    return response.data;
  },

  generateBarcode: async (productId: string): Promise<string> => {
    const response = await inventoryAPI.post(`/products/${productId}/generate-barcode`);
    return response.data.barcode;
  },
};

export interface CreateProductRequest {
  name: string;
  sku: string;
  barcode?: string;
  description?: string;
  shortDescription?: string;
  categoryId?: string;
  brandId?: string;
  supplierId?: string;
  costPrice: number;
  sellingPrice: number;
  mrp?: number;
  wholesalePrice?: number;
  taxRateId?: string;
  hsnCode?: string;
  unit?: string;
  weight?: number;
  dimensions?: { length: number; width: number; height: number; unit: 'cm' | 'in' };
  imageUrl?: string;
  images?: string[];
  isActive?: boolean;
  isFeatured?: boolean;
  allowDiscount?: boolean;
  tags?: string[];
  customFields?: Record<string, string>;
  reorderPoint?: number;
  reorderQuantity?: number;
  initialStock?: number;
}

export interface ImportResult {
  imported: number;
  updated: number;
  failed: number;
  errors: { row: number; error: string }[];
}

// ============================================================================
// VARIANTS
// ============================================================================

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  barcode?: string;
  name: string;
  attributes: Record<string, string>;
  costPrice: number;
  sellingPrice: number;
  quantityOnHand: number;
  imageUrl?: string;
  isActive: boolean;
}

export interface CreateVariantRequest {
  sku: string;
  barcode?: string;
  name: string;
  attributes: Record<string, string>;
  costPrice: number;
  sellingPrice: number;
  imageUrl?: string;
}

export const variantApi = {
  list: async (productId: string): Promise<ProductVariant[]> => {
    const response = await inventoryAPI.get(`/products/${productId}/variants`);
    return (response.data.variants || []).map(mapVariant);
  },

  create: async (productId: string, data: CreateVariantRequest): Promise<ProductVariant> => {
    const response = await inventoryAPI.post(`/products/${productId}/variants`, {
      sku: data.sku,
      barcode: data.barcode,
      name: data.name,
      attributes: data.attributes,
      cost_price: data.costPrice,
      selling_price: data.sellingPrice,
      image_url: data.imageUrl,
    });
    return mapVariant(response.data.variant);
  },

  update: async (productId: string, variantId: string, data: Partial<CreateVariantRequest>): Promise<ProductVariant> => {
    const response = await inventoryAPI.patch(`/products/${productId}/variants/${variantId}`, {
      sku: data.sku,
      barcode: data.barcode,
      name: data.name,
      attributes: data.attributes,
      cost_price: data.costPrice,
      selling_price: data.sellingPrice,
      image_url: data.imageUrl,
    });
    return mapVariant(response.data.variant);
  },

  delete: async (productId: string, variantId: string): Promise<void> => {
    await inventoryAPI.delete(`/products/${productId}/variants/${variantId}`);
  },

  generateVariants: async (productId: string, attributes: Record<string, string[]>): Promise<ProductVariant[]> => {
    const response = await inventoryAPI.post(`/products/${productId}/variants/generate`, { attributes });
    return (response.data.variants || []).map(mapVariant);
  },
};

// ============================================================================
// CATEGORIES
// ============================================================================

export interface CategoryWithChildren extends Category {
  children?: CategoryWithChildren[];
  level?: number;
}

export const categoryApi = {
  list: async (): Promise<CategoryWithChildren[]> => {
    const response = await inventoryAPI.get('/categories');
    return buildCategoryTree(response.data.categories || []);
  },

  get: async (id: string): Promise<Category> => {
    const response = await inventoryAPI.get(`/categories/${id}`);
    return mapCategory(response.data.category);
  },

  create: async (data: { name: string; description?: string; parentId?: string; imageUrl?: string }): Promise<Category> => {
    const response = await inventoryAPI.post('/categories', {
      name: data.name,
      description: data.description,
      parent_id: data.parentId,
      image_url: data.imageUrl,
    });
    return mapCategory(response.data.category);
  },

  update: async (id: string, data: { name?: string; description?: string; imageUrl?: string; displayOrder?: number }): Promise<Category> => {
    const response = await inventoryAPI.patch(`/categories/${id}`, {
      name: data.name,
      description: data.description,
      image_url: data.imageUrl,
      display_order: data.displayOrder,
    });
    return mapCategory(response.data.category);
  },

  delete: async (id: string): Promise<void> => {
    await inventoryAPI.delete(`/categories/${id}`);
  },

  reorder: async (orderedIds: string[]): Promise<void> => {
    await inventoryAPI.post('/categories/reorder', { ids: orderedIds });
  },
};

// ============================================================================
// BRANDS
// ============================================================================

export const brandApi = {
  list: async (): Promise<Brand[]> => {
    const response = await inventoryAPI.get('/brands');
    return (response.data.brands || []).map(mapBrand);
  },

  create: async (data: { name: string; description?: string; logoUrl?: string }): Promise<Brand> => {
    const response = await inventoryAPI.post('/brands', {
      name: data.name,
      description: data.description,
      logo_url: data.logoUrl,
    });
    return mapBrand(response.data.brand);
  },

  update: async (id: string, data: { name?: string; description?: string; logoUrl?: string }): Promise<Brand> => {
    const response = await inventoryAPI.patch(`/brands/${id}`, {
      name: data.name,
      description: data.description,
      logo_url: data.logoUrl,
    });
    return mapBrand(response.data.brand);
  },

  delete: async (id: string): Promise<void> => {
    await inventoryAPI.delete(`/brands/${id}`);
  },
};

// ============================================================================
// TAGS
// ============================================================================

export const tagApi = {
  list: async (): Promise<string[]> => {
    const response = await inventoryAPI.get('/tags');
    return response.data.tags || [];
  },

  getPopular: async (limit?: number): Promise<{ tag: string; count: number }[]> => {
    const response = await inventoryAPI.get('/tags/popular', { params: { limit } });
    return response.data.tags || [];
  },
};

// ============================================================================
// IMAGES
// ============================================================================

export const imageApi = {
  upload: async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('image', file);
    const response = await productMgmtAPI.post('/images/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.url;
  },

  uploadMultiple: async (files: File[]): Promise<string[]> => {
    const formData = new FormData();
    files.forEach((file, index) => {
      formData.append(`images[${index}]`, file);
    });
    const response = await productMgmtAPI.post('/images/upload-multiple', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.urls || [];
  },

  delete: async (url: string): Promise<void> => {
    await productMgmtAPI.delete('/images', { data: { url } });
  },
};

// ============================================================================
// MAPPERS
// ============================================================================

function mapProduct(p: any): Product {
  return {
    id: p.id,
    sku: p.sku,
    barcode: p.barcode,
    name: p.name,
    shortName: p.short_name,
    description: p.description,
    categoryId: p.category_id || p.category,
    brandId: p.brand_id || p.brand,
    supplierId: p.supplier_id,
    costPrice: parseFloat(p.cost_price || p.cost) || 0,
    sellingPrice: parseFloat(p.selling_price || p.unit_price || p.price) || 0,
    mrp: p.mrp != null ? parseFloat(p.mrp) : undefined,
    wholesalePrice: p.wholesale_price != null ? parseFloat(p.wholesale_price) : undefined,
    taxRateId: p.tax_rate_id || 'gst_18',
    hsnCode: p.hsn_code,
    trackInventory: p.track_inventory ?? true,
    quantityOnHand: parseInt(p.quantity_on_hand) || 0,
    reservedQuantity: parseInt(p.reserved_quantity) || 0,
    reorderPoint: parseInt(p.reorder_point) || 10,
    reorderQuantity: parseInt(p.reorder_quantity) || 0,
    unit: p.unit || 'pcs',
    weight: p.weight != null ? parseFloat(p.weight) : undefined,
    dimensions: p.dimensions,
    imageUrl: p.image_url,
    images: p.images,
    isActive: p.is_active ?? true,
    isFeatured: p.is_featured ?? false,
    allowDiscount: p.allow_discount ?? true,
    hasVariants: p.has_variants ?? false,
    variantAttributes: p.variant_attributes,
    variants: p.variants?.map(mapVariant),
    tags: p.tags,
    customFields: p.custom_fields,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

function mapProductToApi(p: Partial<CreateProductRequest>): any {
  const data: any = {};
  if (p.name !== undefined) data.name = p.name;
  if (p.sku !== undefined) data.sku = p.sku;
  if (p.barcode !== undefined) data.barcode = p.barcode;
  if (p.description !== undefined) data.description = p.description;
  if (p.shortDescription !== undefined) data.short_description = p.shortDescription;
  if (p.categoryId !== undefined) data.category_id = p.categoryId;
  if (p.brandId !== undefined) data.brand_id = p.brandId;
  if (p.supplierId !== undefined) data.supplier_id = p.supplierId;
  if (p.costPrice !== undefined) data.cost_price = p.costPrice;
  if (p.sellingPrice !== undefined) data.selling_price = p.sellingPrice;
  if (p.mrp !== undefined) data.mrp = p.mrp;
  if (p.wholesalePrice !== undefined) data.wholesale_price = p.wholesalePrice;
  if (p.taxRateId !== undefined) data.tax_rate_id = p.taxRateId;
  if (p.hsnCode !== undefined) data.hsn_code = p.hsnCode;
  if (p.unit !== undefined) data.unit = p.unit;
  if (p.weight !== undefined) data.weight = p.weight;
  if (p.dimensions !== undefined) data.dimensions = p.dimensions;
  if (p.imageUrl !== undefined) data.image_url = p.imageUrl;
  if (p.images !== undefined) data.images = p.images;
  if (p.isActive !== undefined) data.is_active = p.isActive;
  if (p.isFeatured !== undefined) data.is_featured = p.isFeatured;
  if (p.allowDiscount !== undefined) data.allow_discount = p.allowDiscount;
  if (p.tags !== undefined) data.tags = p.tags;
  if (p.customFields !== undefined) data.custom_fields = p.customFields;
  if (p.reorderPoint !== undefined) data.reorder_point = p.reorderPoint;
  if (p.reorderQuantity !== undefined) data.reorder_quantity = p.reorderQuantity;
  if (p.initialStock !== undefined) data.initial_stock = p.initialStock;
  return data;
}

function mapVariant(v: any): ProductVariant {
  return {
    id: v.id,
    productId: v.product_id,
    sku: v.sku,
    barcode: v.barcode,
    name: v.name,
    attributes: v.attributes || {},
    costPrice: parseFloat(v.cost_price) || 0,
    sellingPrice: parseFloat(v.selling_price) || 0,
    quantityOnHand: parseInt(v.quantity_on_hand) || 0,
    imageUrl: v.image_url,
    isActive: v.is_active ?? true,
  };
}

function mapCategory(c: any): Category {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug || c.name.toLowerCase().replace(/\s+/g, '-'),
    description: c.description,
    parentId: c.parent_id,
    imageUrl: c.image_url,
    displayOrder: parseInt(c.display_order) || 0,
    isActive: c.is_active ?? true,
    productCount: parseInt(c.product_count) || 0,
  };
}

function mapBrand(b: any): Brand {
  return {
    id: b.id,
    name: b.name,
    slug: b.slug || b.name.toLowerCase().replace(/\s+/g, '-'),
    description: b.description,
    logoUrl: b.logo_url,
    isActive: b.is_active ?? true,
  };
}

function buildCategoryTree(categories: any[]): CategoryWithChildren[] {
  const mapped = categories.map(mapCategory);
  const map = new Map<string, CategoryWithChildren>();
  const roots: CategoryWithChildren[] = [];

  mapped.forEach(cat => {
    map.set(cat.id, { ...cat, children: [], level: 0 });
  });

  mapped.forEach(cat => {
    const current = map.get(cat.id)!;
    if (cat.parentId && map.has(cat.parentId)) {
      const parent = map.get(cat.parentId)!;
      current.level = (parent.level || 0) + 1;
      parent.children = parent.children || [];
      parent.children.push(current);
    } else {
      roots.push(current);
    }
  });

  return roots;
}
