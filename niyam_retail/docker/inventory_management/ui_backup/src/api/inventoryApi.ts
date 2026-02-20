// Enhanced Inventory API - Real backend integration
import { inventoryAPI } from '../../../../shared/utils/api';
import type {
  Product,
  StockAdjustment,
  StockTransfer,
  StockCount,
  StockCountItem,
  StockAdjustmentReason,
} from '../../../../shared/types/retail';

// ============================================================================
// PRODUCTS
// ============================================================================

export interface ProductFilters {
  search?: string;
  categoryId?: string;
  brandId?: string;
  supplierId?: string;
  status?: 'all' | 'active' | 'inactive' | 'low_stock' | 'out_of_stock';
  hasVariants?: boolean;
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

export const productApi = {
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

  create: async (data: Partial<Product>): Promise<Product> => {
    const response = await inventoryAPI.post('/products', mapProductToApi(data));
    return mapProduct(response.data.product);
  },

  update: async (id: string, data: Partial<Product>): Promise<Product> => {
    const response = await inventoryAPI.patch(`/products/${id}`, mapProductToApi(data));
    return mapProduct(response.data.product);
  },

  delete: async (id: string): Promise<void> => {
    await inventoryAPI.delete(`/products/${id}`);
  },

  bulkUpdate: async (ids: string[], updates: Partial<Product>): Promise<void> => {
    await inventoryAPI.patch('/products/bulk', {
      ids,
      updates: mapProductToApi(updates),
    });
  },

  import: async (file: File): Promise<{ imported: number; errors: string[] }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await inventoryAPI.post('/products/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  export: async (filters: ProductFilters): Promise<Blob> => {
    const response = await inventoryAPI.get('/products/export', {
      params: filters,
      responseType: 'blob',
    });
    return response.data;
  },
};

// ============================================================================
// CATEGORIES
// ============================================================================

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId?: string;
  productCount: number;
  children?: Category[];
}

export const categoryApi = {
  list: async (): Promise<Category[]> => {
    const response = await inventoryAPI.get('/categories');
    return response.data.categories || [];
  },

  create: async (data: { name: string; parentId?: string }): Promise<Category> => {
    const response = await inventoryAPI.post('/categories', data);
    return response.data.category;
  },

  update: async (id: string, data: { name: string }): Promise<Category> => {
    const response = await inventoryAPI.patch(`/categories/${id}`, data);
    return response.data.category;
  },

  delete: async (id: string): Promise<void> => {
    await inventoryAPI.delete(`/categories/${id}`);
  },
};

// ============================================================================
// STOCK ADJUSTMENTS
// ============================================================================

export interface CreateAdjustmentRequest {
  productId: string;
  variantId?: string;
  warehouseId?: string;
  binId?: string;
  type: 'addition' | 'subtraction' | 'count';
  reason: StockAdjustmentReason;
  quantityChange: number;
  costPrice?: number;
  notes?: string;
  referenceNumber?: string;
  batchNumber?: string;
  expiryDate?: string;
}

export const stockAdjustmentApi = {
  list: async (params: {
    productId?: string;
    startDate?: string;
    endDate?: string;
    reason?: StockAdjustmentReason;
    page?: number;
    limit?: number;
  }): Promise<{ adjustments: StockAdjustment[]; total: number }> => {
    const response = await inventoryAPI.get('/stock/adjustments', { params });
    return {
      adjustments: (response.data.adjustments || []).map(mapAdjustment),
      total: response.data.total || 0,
    };
  },

  create: async (data: CreateAdjustmentRequest): Promise<StockAdjustment> => {
    const response = await inventoryAPI.post('/stock/adjustments', {
      product_id: data.productId,
      variant_id: data.variantId,
      warehouse_id: data.warehouseId,
      bin_id: data.binId,
      type: data.type,
      reason: data.reason,
      quantity_change: data.quantityChange,
      cost_price: data.costPrice,
      notes: data.notes,
      reference_number: data.referenceNumber,
      batch_number: data.batchNumber,
      expiry_date: data.expiryDate,
    });
    return mapAdjustment(response.data.adjustment);
  },

  getReasons: (): { value: StockAdjustmentReason; label: string }[] => [
    { value: 'purchase_received', label: 'Purchase Received' },
    { value: 'sale', label: 'Sale' },
    { value: 'return_from_customer', label: 'Customer Return' },
    { value: 'return_to_supplier', label: 'Supplier Return' },
    { value: 'damage', label: 'Damaged' },
    { value: 'theft', label: 'Theft/Loss' },
    { value: 'expired', label: 'Expired' },
    { value: 'stock_count', label: 'Stock Count Adjustment' },
    { value: 'transfer_in', label: 'Transfer In' },
    { value: 'transfer_out', label: 'Transfer Out' },
    { value: 'production', label: 'Production' },
    { value: 'other', label: 'Other' },
  ],
};

// ============================================================================
// STOCK TRANSFERS
// ============================================================================

export interface CreateTransferRequest {
  fromStoreId: string;
  toStoreId: string;
  items: {
    productId: string;
    variantId?: string;
    quantity: number;
    notes?: string;
  }[];
  notes?: string;
}

export const stockTransferApi = {
  list: async (params: {
    storeId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ transfers: StockTransfer[]; total: number }> => {
    const response = await inventoryAPI.get('/stock/transfers', { params });
    return {
      transfers: (response.data.transfers || []).map(mapTransfer),
      total: response.data.total || 0,
    };
  },

  get: async (id: string): Promise<StockTransfer> => {
    const response = await inventoryAPI.get(`/stock/transfers/${id}`);
    return mapTransfer(response.data.transfer);
  },

  create: async (data: CreateTransferRequest): Promise<StockTransfer> => {
    const response = await inventoryAPI.post('/stock/transfers', {
      from_store_id: data.fromStoreId,
      to_store_id: data.toStoreId,
      items: data.items.map(i => ({
        product_id: i.productId,
        variant_id: i.variantId,
        quantity: i.quantity,
        notes: i.notes,
      })),
      notes: data.notes,
    });
    return mapTransfer(response.data.transfer);
  },

  ship: async (id: string): Promise<StockTransfer> => {
    const response = await inventoryAPI.post(`/stock/transfers/${id}/ship`);
    return mapTransfer(response.data.transfer);
  },

  receive: async (
    id: string,
    items: { itemId: string; quantityReceived: number; notes?: string }[]
  ): Promise<StockTransfer> => {
    const response = await inventoryAPI.post(`/stock/transfers/${id}/receive`, { items });
    return mapTransfer(response.data.transfer);
  },

  cancel: async (id: string, reason: string): Promise<StockTransfer> => {
    const response = await inventoryAPI.post(`/stock/transfers/${id}/cancel`, { reason });
    return mapTransfer(response.data.transfer);
  },
};

// ============================================================================
// STOCK COUNTS (AUDITS)
// ============================================================================

export interface CreateStockCountRequest {
  type: 'full' | 'partial' | 'category' | 'location';
  categoryIds?: string[];
  locationId?: string;
}

export const stockCountApi = {
  list: async (params: {
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ counts: StockCount[]; total: number }> => {
    const response = await inventoryAPI.get('/stock/counts', { params });
    return {
      counts: (response.data.counts || []).map(mapStockCount),
      total: response.data.total || 0,
    };
  },

  get: async (id: string): Promise<StockCount> => {
    const response = await inventoryAPI.get(`/stock/counts/${id}`);
    return mapStockCount(response.data.count);
  },

  create: async (data: CreateStockCountRequest): Promise<StockCount> => {
    const response = await inventoryAPI.post('/stock/counts', {
      type: data.type,
      category_ids: data.categoryIds,
      location_id: data.locationId,
    });
    return mapStockCount(response.data.count);
  },

  updateItem: async (
    countId: string,
    itemId: string,
    countedQuantity: number,
    notes?: string
  ): Promise<StockCountItem> => {
    const response = await inventoryAPI.patch(
      `/stock/counts/${countId}/items/${itemId}`,
      { counted_quantity: countedQuantity, notes }
    );
    return mapStockCountItem(response.data.item);
  },

  complete: async (id: string, applyAdjustments: boolean): Promise<StockCount> => {
    const response = await inventoryAPI.post(`/stock/counts/${id}/complete`, {
      apply_adjustments: applyAdjustments,
    });
    return mapStockCount(response.data.count);
  },

  cancel: async (id: string): Promise<void> => {
    await inventoryAPI.post(`/stock/counts/${id}/cancel`);
  },
};

// ============================================================================
// LOW STOCK & ALERTS
// ============================================================================

export const alertsApi = {
  getLowStock: async (threshold?: number): Promise<Product[]> => {
    const response = await inventoryAPI.get('/alerts/low-stock', {
      params: { threshold },
    });
    return (response.data.products || []).map(mapProduct);
  },

  getOutOfStock: async (): Promise<Product[]> => {
    const response = await inventoryAPI.get('/alerts/out-of-stock');
    return (response.data.products || []).map(mapProduct);
  },

  getExpiringSoon: async (days?: number): Promise<{
    productId: string;
    productName: string;
    batchNumber: string;
    quantity: number;
    expiryDate: string;
  }[]> => {
    const response = await inventoryAPI.get('/alerts/expiring', {
      params: { days: days || 30 },
    });
    return response.data.items || [];
  },
};

// ============================================================================
// INVENTORY VALUATION
// ============================================================================

export interface InventoryValuation {
  totalProducts: number;
  totalQuantity: number;
  totalCostValue: number;
  totalRetailValue: number;
  potentialProfit: number;
  lowStockItems: number;
  outOfStockItems: number;
}

export const valuationApi = {
  get: async (storeId?: string): Promise<InventoryValuation> => {
    const response = await inventoryAPI.get('/valuation', {
      params: { store_id: storeId },
    });
    return {
      totalProducts: response.data.total_products || 0,
      totalQuantity: response.data.total_quantity || 0,
      totalCostValue: parseFloat(response.data.total_cost_value) || 0,
      totalRetailValue: parseFloat(response.data.total_retail_value) || 0,
      potentialProfit: parseFloat(response.data.potential_profit) || 0,
      lowStockItems: response.data.low_stock_items || 0,
      outOfStockItems: response.data.out_of_stock_items || 0,
    };
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
    brandId: p.brand_id,
    supplierId: p.supplier_id,
    costPrice: parseFloat(p.cost_price) || 0,
    sellingPrice: parseFloat(p.selling_price || p.unit_price) || 0,
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
    variants: p.variants?.map((v: any) => ({
      id: v.id,
      productId: p.id,
      sku: v.sku,
      barcode: v.barcode,
      name: v.name,
      attributes: v.attributes || {},
      costPrice: parseFloat(v.cost_price) || 0,
      sellingPrice: parseFloat(v.selling_price) || 0,
      quantityOnHand: parseInt(v.quantity_on_hand) || 0,
      imageUrl: v.image_url,
      isActive: v.is_active ?? true,
    })),
    tags: p.tags,
    customFields: p.custom_fields,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

function mapProductToApi(p: Partial<Product>): any {
  const data: any = {};
  if (p.sku !== undefined) data.sku = p.sku;
  if (p.barcode !== undefined) data.barcode = p.barcode;
  if (p.name !== undefined) data.name = p.name;
  if (p.description !== undefined) data.description = p.description;
  if (p.categoryId !== undefined) data.category_id = p.categoryId;
  if (p.brandId !== undefined) data.brand_id = p.brandId;
  if (p.supplierId !== undefined) data.supplier_id = p.supplierId;
  if (p.costPrice !== undefined) data.cost_price = p.costPrice;
  if (p.sellingPrice !== undefined) data.selling_price = p.sellingPrice;
  if (p.mrp !== undefined) data.mrp = p.mrp;
  if (p.wholesalePrice !== undefined) data.wholesale_price = p.wholesalePrice;
  if (p.taxRateId !== undefined) data.tax_rate_id = p.taxRateId;
  if (p.hsnCode !== undefined) data.hsn_code = p.hsnCode;
  if (p.reorderPoint !== undefined) data.reorder_point = p.reorderPoint;
  if (p.reorderQuantity !== undefined) data.reorder_quantity = p.reorderQuantity;
  if (p.unit !== undefined) data.unit = p.unit;
  if (p.imageUrl !== undefined) data.image_url = p.imageUrl;
  if (p.isActive !== undefined) data.is_active = p.isActive;
  if (p.tags !== undefined) data.tags = p.tags;
  return data;
}

function mapAdjustment(a: any): StockAdjustment {
  return {
    id: a.id,
    storeId: a.store_id,
    productId: a.product_id,
    variantId: a.variant_id,
    type: a.type,
    reason: a.reason,
    quantityBefore: parseInt(a.quantity_before) || 0,
    quantityChange: parseInt(a.quantity_change) || 0,
    quantityAfter: parseInt(a.quantity_after) || 0,
    costPrice: a.cost_price != null ? parseFloat(a.cost_price) : undefined,
    notes: a.notes,
    referenceNumber: a.reference_number,
    performedBy: a.performed_by,
    createdAt: a.created_at,
  };
}

function mapTransfer(t: any): StockTransfer {
  return {
    id: t.id,
    transferNumber: t.transfer_number,
    fromStoreId: t.from_store_id,
    toStoreId: t.to_store_id,
    status: t.status,
    items: (t.items || []).map((i: any) => ({
      id: i.id,
      transferId: t.id,
      productId: i.product_id,
      variantId: i.variant_id,
      productName: i.product_name,
      sku: i.sku,
      quantitySent: parseInt(i.quantity_sent) || 0,
      quantityReceived: i.quantity_received != null ? parseInt(i.quantity_received) : undefined,
      discrepancyNotes: i.discrepancy_notes,
    })),
    notes: t.notes,
    createdBy: t.created_by,
    createdAt: t.created_at,
    shippedAt: t.shipped_at,
    receivedAt: t.received_at,
    receivedBy: t.received_by,
  };
}

function mapStockCount(c: any): StockCount {
  return {
    id: c.id,
    storeId: c.store_id,
    countNumber: c.count_number,
    status: c.status,
    type: c.type,
    categoryIds: c.category_ids,
    locationId: c.location_id,
    items: (c.items || []).map(mapStockCountItem),
    createdBy: c.created_by,
    createdAt: c.created_at,
    completedAt: c.completed_at,
    completedBy: c.completed_by,
  };
}

function mapStockCountItem(i: any): StockCountItem {
  return {
    id: i.id,
    countId: i.count_id,
    productId: i.product_id,
    variantId: i.variant_id,
    productName: i.product_name,
    sku: i.sku,
    systemQuantity: parseInt(i.system_quantity) || 0,
    countedQuantity: i.counted_quantity != null ? parseInt(i.counted_quantity) : undefined,
    variance: i.variance != null ? parseInt(i.variance) : undefined,
    varianceValue: i.variance_value != null ? parseFloat(i.variance_value) : undefined,
    notes: i.notes,
    countedBy: i.counted_by,
    countedAt: i.counted_at,
  };
}
