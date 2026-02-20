// POS API - Real backend integration
import { posAPI, inventoryAPI } from '@shared/utils/api';
import type {
  POSSession,
  Cart,
  Transaction,
  PaymentMethod,
  Customer,
} from '@shared/types/retail';

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

export interface OpenSessionRequest {
  storeId: string;
  registerId: string;
  cashierId: string;
  openingBalance: number;
}

export const sessionApi = {
  open: async (data: OpenSessionRequest): Promise<POSSession> => {
    const response = await posAPI.post('/sessions/open', {
      store_id: data.storeId,
      register_id: data.registerId,
      cashier_id: data.cashierId,
      opening_balance: data.openingBalance,
    });
    return mapSession(response.data.session);
  },

  getActive: async (cashierId: string): Promise<POSSession | null> => {
    try {
      const response = await posAPI.get(`/sessions/active/${cashierId}`);
      return response.data.session ? mapSession(response.data.session) : null;
    } catch (error: any) {
      if (error?.response?.status === 404) return null;
      throw error;
    }
  },

  close: async (sessionId: string, data: {
    closingBalance: number;
    actualCash: number;
    notes?: string;
  }): Promise<{ success: boolean; summary: any }> => {
    const response = await posAPI.post(`/sessions/${sessionId}/close`, {
      closing_balance: data.closingBalance,
      actual_cash: data.actualCash,
      notes: data.notes,
    });
    return response.data;
  },

  getSummary: async (sessionId: string): Promise<SessionSummary> => {
    const response = await posAPI.get(`/sessions/${sessionId}/summary`);
    return response.data;
  },
};

export interface SessionSummary {
  salesCount: number;
  totalSales: number;
  totalRefunds: number;
  netSales: number;
  paymentBreakdown: { method: string; amount: number; count: number }[];
  expectedCash: number;
}

// ============================================================================
// PRODUCT SEARCH
// ============================================================================

export interface SearchProductsParams {
  query?: string;
  barcode?: string;
  categoryId?: string;
  limit?: number;
}

export interface ProductSearchResult {
  id: string;
  sku: string;
  barcode?: string;
  name: string;
  categoryName?: string;
  sellingPrice: number;
  mrp?: number;
  taxRateId: string;
  taxRate: number;
  quantityOnHand: number;
  unit: string;
  imageUrl?: string;
  hasVariants: boolean;
  variants?: ProductVariantResult[];
}

export interface ProductVariantResult {
  id: string;
  sku: string;
  barcode?: string;
  name: string;
  attributes: Record<string, string>;
  sellingPrice: number;
  quantityOnHand: number;
}

export const productApi = {
  search: async (params: SearchProductsParams): Promise<ProductSearchResult[]> => {
    const response = await inventoryAPI.get('/products', {
      params: {
        search: params.query,
        barcode: params.barcode,
        category_id: params.categoryId,
        limit: params.limit || 20,
        active: true,
      },
    });

    const products = response.data.products || [];
    return products.map(mapProduct);
  },

  getByBarcode: async (barcode: string): Promise<ProductSearchResult | null> => {
    try {
      const response = await inventoryAPI.get(`/products/barcode/${barcode}`);
      return response.data.product ? mapProduct(response.data.product) : null;
    } catch (error: any) {
      if (error?.response?.status === 404) return null;
      throw error;
    }
  },

  getCategories: async (): Promise<{ id: string; name: string }[]> => {
    const response = await inventoryAPI.get('/categories');
    return response.data.categories || [];
  },
};

// ============================================================================
// CART MANAGEMENT
// ============================================================================

export interface AddToCartRequest {
  sessionId: string;
  productId: string;
  variantId?: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  taxRateId: string;
  taxRate: number;
}

export const cartApi = {
  get: async (sessionId: string): Promise<Cart> => {
    const response = await posAPI.get(`/cart/${sessionId}`);
    return mapCart(response.data.cart, sessionId);
  },

  addItem: async (data: AddToCartRequest): Promise<Cart> => {
    const response = await posAPI.post('/cart/items/add', {
      session_id: data.sessionId,
      product_id: data.productId,
      variant_id: data.variantId,
      sku: data.sku,
      quantity: data.quantity,
      unit_price: data.unitPrice,
      tax_rate_id: data.taxRateId,
      tax_rate: data.taxRate,
    });
    return mapCart(response.data.cart, data.sessionId);
  },

  updateItem: async (
    sessionId: string,
    itemId: string,
    updates: { quantity?: number; discountType?: string; discountValue?: number }
  ): Promise<Cart> => {
    const response = await posAPI.patch(`/cart/${sessionId}/items/${itemId}`, updates);
    return mapCart(response.data.cart, sessionId);
  },

  removeItem: async (sessionId: string, itemId: string): Promise<Cart> => {
    const response = await posAPI.delete(`/cart/${sessionId}/items/${itemId}`);
    return mapCart(response.data.cart, sessionId);
  },

  clear: async (sessionId: string): Promise<void> => {
    await posAPI.delete(`/cart/${sessionId}`);
  },

  applyDiscount: async (
    sessionId: string,
    data: { type: 'percentage' | 'fixed'; value: number }
  ): Promise<Cart> => {
    const response = await posAPI.post(`/cart/${sessionId}/discount`, {
      discount_type: data.type,
      discount_value: data.value,
    });
    return mapCart(response.data.cart, sessionId);
  },

  applyCoupon: async (sessionId: string, code: string): Promise<Cart> => {
    const response = await posAPI.post(`/cart/${sessionId}/coupon`, {
      code: code,
    });
    return mapCart(response.data.cart, sessionId);
  },
};

// ============================================================================
// CHECKOUT & TRANSACTIONS
// ============================================================================

export interface CheckoutRequest {
  sessionId: string;
  payments: {
    method: PaymentMethod;
    amount: number;
    reference?: string;
  }[];
  customerId?: string;
  notes?: string;
  printReceipt?: boolean;
}

export interface ReceiptData {
  html: string;
  text: string;
  transactionNumber: string;
  transactionId: string;
  total: number;
  timestamp: string;
}

export interface CheckoutResponse {
  transaction: Transaction;
  receipt?: ReceiptData;
  receiptUrl?: string;
  changeAmount: number;
}

export const checkoutApi = {
  complete: async (data: CheckoutRequest): Promise<CheckoutResponse> => {
    const response = await posAPI.post(`/checkout/${data.sessionId}`, {
      payments: data.payments,
      customer_id: data.customerId,
      notes: data.notes,
      print_receipt: data.printReceipt,
    });

    return {
      transaction: mapTransaction(response.data.transaction),
      receipt: response.data.receipt,
      receiptUrl: response.data.receipt_url,
      changeAmount: response.data.change_amount || 0,
    };
  },

  refund: async (transactionId: string, data: {
    items: { itemId: string; quantity: number; reason: string }[];
    refundMethod: 'original_payment' | 'cash' | 'store_credit';
  }): Promise<Transaction> => {
    const response = await posAPI.post(`/transactions/${transactionId}/refund`, data);
    return mapTransaction(response.data.transaction);
  },

  getReceipt: async (transactionId: string): Promise<string> => {
    const response = await posAPI.get(`/transactions/${transactionId}/receipt`);
    return response.data.receipt_html;
  },
};

// ============================================================================
// CUSTOMER LOOKUP
// ============================================================================

export const customerApi = {
  search: async (query: string): Promise<Customer[]> => {
    // Use POS service directly for customer lookup
    const response = await posAPI.get('/api/customers', {
      params: { search: query, limit: 10 },
    });
    return (response.data.customers || []).map(mapCustomer);
  },

  getByPhone: async (phone: string): Promise<Customer | null> => {
    try {
      const response = await posAPI.get(`/api/customers/phone/${phone}`);
      return response.data.customer ? mapCustomer(response.data.customer) : null;
    } catch (error: any) {
      if (error?.response?.status === 404) return null;
      throw error;
    }
  },

  quickCreate: async (data: {
    firstName: string;
    lastName?: string;
    phone: string;
    email?: string;
  }): Promise<Customer> => {
    const response = await posAPI.post('/api/customers', {
      first_name: data.firstName,
      last_name: data.lastName || '',
      phone: data.phone,
      email: data.email,
    });
    return mapCustomer(response.data.customer);
  },

  getLoyaltyBalance: async (customerId: string): Promise<{
    points: number;
    tier: string;
    pointsValue: number;
  }> => {
    const response = await posAPI.get(`/api/customers/${customerId}/loyalty`);
    return response.data;
  },
};

// ============================================================================
// CASH DRAWER
// ============================================================================

export const cashDrawerApi = {
  open: async (sessionId: string): Promise<void> => {
    await posAPI.post(`/sessions/${sessionId}/drawer/open`);
  },

  addCash: async (sessionId: string, amount: number, reason: string): Promise<void> => {
    await posAPI.post(`/sessions/${sessionId}/drawer/cash-in`, { amount, reason });
  },

  removeCash: async (sessionId: string, amount: number, reason: string): Promise<void> => {
    await posAPI.post(`/sessions/${sessionId}/drawer/cash-out`, { amount, reason });
  },

  getMovements: async (sessionId: string): Promise<CashMovement[]> => {
    const response = await posAPI.get(`/sessions/${sessionId}/drawer/movements`);
    return response.data.movements || [];
  },
};

export interface CashMovement {
  id: string;
  type: 'sale' | 'refund' | 'cash_in' | 'cash_out';
  amount: number;
  reason?: string;
  reference?: string;
  performedBy: string;
  createdAt: string;
}

// ============================================================================
// MAPPERS
// ============================================================================

function mapSession(s: any): POSSession {
  return {
    id: s.id,
    storeId: s.store_id,
    registerId: s.register_id || 'REG-001',
    cashierId: s.cashier_id,
    cashierName: s.cashier_name || 'Cashier',
    registerNumber: s.register_number || 'REG-001',
    openingBalance: parseFloat(s.opening_balance) || 0,
    closingBalance: s.closing_balance != null ? parseFloat(s.closing_balance) : undefined,
    expectedCash: s.expected_cash != null ? parseFloat(s.expected_cash) : undefined,
    actualCash: s.actual_cash != null ? parseFloat(s.actual_cash) : undefined,
    cashDifference: s.cash_difference != null ? parseFloat(s.cash_difference) : undefined,
    status: s.status || 'open',
    salesCount: parseInt(s.sales_count) || 0,
    totalSales: parseFloat(s.total_sales) || 0,
    totalRefunds: parseFloat(s.total_refunds) || 0,
    openedAt: s.opened_at,
    closedAt: s.closed_at,
  };
}

function mapProduct(p: any): ProductSearchResult {
  return {
    id: p.id,
    sku: p.sku,
    barcode: p.barcode,
    name: p.name,
    categoryName: p.category_name,
    sellingPrice: parseFloat(p.selling_price || p.unit_price) || 0,
    mrp: p.mrp != null ? parseFloat(p.mrp) : undefined,
    taxRateId: p.tax_rate_id || 'gst_18',
    taxRate: parseFloat(p.tax_rate) || 18,
    quantityOnHand: parseInt(p.quantity_on_hand) || 0,
    unit: p.unit || 'pcs',
    imageUrl: p.image_url,
    hasVariants: p.has_variants || false,
    variants: p.variants?.map((v: any) => ({
      id: v.id,
      sku: v.sku,
      barcode: v.barcode,
      name: v.name,
      attributes: v.attributes || {},
      sellingPrice: parseFloat(v.selling_price) || 0,
      quantityOnHand: parseInt(v.quantity_on_hand) || 0,
    })),
  };
}

function mapCart(cart: any, sessionId: string): Cart {
  const items = (cart?.items || []).map((item: any) => ({
    id: item.id || item.sku,
    productId: item.product_id,
    variantId: item.variant_id,
    sku: item.sku,
    barcode: item.barcode,
    name: item.name || item.product_name,
    quantity: parseInt(item.quantity) || 1,
    unitPrice: parseFloat(item.unit_price || item.price) || 0,
    taxRateId: item.tax_rate_id || 'gst_18',
    taxRate: parseFloat(item.tax_rate) || 18,
    taxAmount: parseFloat(item.tax_amount) || 0,
    discountType: item.discount_type,
    discountValue: item.discount_value != null ? parseFloat(item.discount_value) : undefined,
    discountAmount: parseFloat(item.discount_amount) || 0,
    lineTotal: parseFloat(item.line_total || item.subtotal) || 0,
    notes: item.notes,
  }));

  return {
    id: cart?.id || `cart-${sessionId}`,
    sessionId,
    customerId: cart?.customer_id,
    customerName: cart?.customer_name,
    items,
    subtotal: parseFloat(cart?.subtotal) || 0,
    taxBreakdown: cart?.tax_breakdown || [],
    taxTotal: parseFloat(cart?.tax_total) || 0,
    discountTotal: parseFloat(cart?.discount_total) || 0,
    grandTotal: parseFloat(cart?.grand_total || cart?.total) || 0,
    heldAt: cart?.held_at,
    holdNote: cart?.hold_note,
  };
}

function mapTransaction(tx: any): Transaction {
  return {
    id: tx.id,
    transactionNumber: tx.transaction_number,
    type: tx.type || 'sale',
    sessionId: tx.session_id,
    storeId: tx.store_id,
    customerId: tx.customer_id,
    customerName: tx.customer_name,
    items: tx.items || [],
    subtotal: parseFloat(tx.subtotal) || 0,
    taxBreakdown: tx.tax_breakdown || [],
    taxTotal: parseFloat(tx.tax_total) || 0,
    discountTotal: parseFloat(tx.discount_total) || 0,
    grandTotal: parseFloat(tx.grand_total || tx.total) || 0,
    roundingAdjustment: tx.rounding_adjustment,
    payments: tx.payments || [],
    amountPaid: parseFloat(tx.amount_paid) || 0,
    changeGiven: parseFloat(tx.change_given) || 0,
    originalTransactionId: tx.original_transaction_id,
    invoiceId: tx.invoice_id,
    status: tx.status || 'completed',
    notes: tx.notes,
    createdBy: tx.created_by,
    createdAt: tx.created_at || tx.timestamp,
  };
}

function mapCustomer(c: any): Customer {
  return {
    id: c.id,
    customerNumber: c.customer_number || c.id,
    firstName: c.first_name || c.name?.split(' ')[0] || '',
    lastName: c.last_name || c.name?.split(' ').slice(1).join(' ') || '',
    email: c.email,
    phone: c.phone,
    alternatePhone: c.alternate_phone,
    dateOfBirth: c.date_of_birth,
    anniversary: c.anniversary,
    gender: c.gender,
    address: c.address,
    loyaltyTierId: c.loyalty_tier_id,
    loyaltyPoints: parseInt(c.loyalty_points) || 0,
    lifetimePoints: parseInt(c.lifetime_points) || 0,
    lifetimeSpend: parseFloat(c.lifetime_spend) || 0,
    creditLimit: c.credit_limit != null ? parseFloat(c.credit_limit) : undefined,
    creditBalance: parseFloat(c.credit_balance) || 0,
    taxId: c.tax_id,
    preferredPaymentMethod: c.preferred_payment_method,
    marketingOptIn: c.marketing_opt_in ?? true,
    isActive: c.is_active ?? true,
    firstPurchaseDate: c.first_purchase_date,
    lastPurchaseDate: c.last_purchase_date,
    totalOrders: parseInt(c.total_orders) || 0,
    averageOrderValue: parseFloat(c.average_order_value) || 0,
    notes: c.notes,
    tags: c.tags,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}
