import { posAPI, inventoryAPI } from '@shared/utils/api.ts';
import type { POSSession, CartItem, Transaction } from '@shared/types/models.ts';

const mapSession = (s: any): POSSession => ({
  id: s.id,
  store_id: s.store_id,
  cashier_id: s.cashier_id,
  register_number: s.register_number,
  opening_balance: typeof s.opening_balance === 'number' ? s.opening_balance : parseFloat(s.opening_balance ?? 0),
  closing_balance: s.closing_balance != null ? (typeof s.closing_balance === 'number' ? s.closing_balance : parseFloat(s.closing_balance)) : undefined,
  actual_cash: s.actual_cash != null ? (typeof s.actual_cash === 'number' ? s.actual_cash : parseFloat(s.actual_cash)) : undefined,
  status: s.status,
  opened_at: s.opened_at,
  closed_at: s.closed_at ?? undefined,
});

const mapCartItems = (cart: any, sessionId: string): CartItem[] => {
  const items = cart?.items || [];
  return items.map((item: any) => ({
    id: item.sku,
    session_id: sessionId,
    product_id: item.product_id,
    product_name: item.name,
    quantity: item.quantity,
    unit_price: item.price,
    tax_rate: item.tax_rate,
    discount_amount: 0,
    total: item.subtotal,
  }));
};

// Session Management
export const openSession = async (data: {
  store_id: string;
  cashier_id: string;
  opening_balance: number;
  register_number?: string;
}): Promise<POSSession> => {
  const response = await posAPI.post('/sessions/open', data);
  return mapSession(response.data.session);
};

export const getActiveSession = async (cashierId: string): Promise<POSSession | null> => {
  try {
    const response = await posAPI.get(`/sessions/active/${cashierId}`);
    return mapSession(response.data.session);
  } catch (error) {
    return null;
  }
};

export const closeSession = async (sessionId: string, data: {
  closing_balance: number;
  actual_cash?: number;
}): Promise<POSSession> => {
  const response = await posAPI.post(`/sessions/${sessionId}/close`, data);
  return response.data.session;
};

// Cart Management
export const getCart = async (sessionId: string): Promise<CartItem[]> => {
  const response = await posAPI.get(`/cart/${sessionId}`);
  const cart = response.data.cart || { items: [] };
  return mapCartItems(cart, sessionId);
};

export const addItemToCart = async (sessionId: string, sku: string, quantity = 1): Promise<CartItem[]> => {
  const response = await posAPI.post('/cart/items/add', {
    session_id: sessionId,
    sku,
    quantity,
  });

  return mapCartItems(response.data.cart, sessionId);
};

export const updateCartItem = async (sessionId: string, itemId: string, quantity: number): Promise<CartItem[]> => {
  const response = await posAPI.patch(`/cart/${sessionId}/items/${itemId}`, { quantity });
  return mapCartItems(response.data.cart, sessionId);
};

export const removeCartItem = async (sessionId: string, itemId: string): Promise<CartItem[]> => {
  const response = await posAPI.delete(`/cart/${sessionId}/items/${itemId}`);
  return mapCartItems(response.data.cart, sessionId);
};

export const clearRemoteCart = async (sessionId: string): Promise<void> => {
  await posAPI.delete(`/cart/${sessionId}`);
};

// Discount
export const validateDiscount = async (code: string): Promise<{
  valid: boolean;
  discount: { type: string; value: number; description: string } | null;
}> => {
  const response = await posAPI.post('/discounts/validate', { code });
  return response.data;
};

// Transaction
export const completeTransaction = async (sessionId: string, data: {
  payment_method: string;
  amount_paid: number;
  customer_id?: string;
}): Promise<Transaction> => {
  const payments = [
    {
      method: data.payment_method,
      amount: data.amount_paid,
    },
  ];

  const response = await posAPI.post(`/checkout/${sessionId}`, {
    payments,
    customer_id: data.customer_id,
  });

  const tx = response.data.transaction;

  return {
    id: tx.id,
    session_id: sessionId,
    transaction_number: tx.transaction_number,
    payment_method: data.payment_method,
    subtotal: 0,
    tax_amount: 0,
    discount_amount: 0,
    total_amount: tx.total,
    amount_paid: data.amount_paid,
    change_given: data.amount_paid - tx.total,
    customer_id: data.customer_id,
    status: 'completed',
    created_at: tx.timestamp,
  };
};

// Search Products (mock for now - would integrate with product catalog)
export const searchProducts = async (query: string): Promise<any[]> => {
  if (!query || query.trim().length < 2) return [];

  const response = await inventoryAPI.get('/products', {
    params: { search: query },
  });

  const products = response.data.products || [];

  return products.map((p: any) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    price: p.unit_price,
    tax_rate: p.tax_rate,
    in_stock: (p.quantity_on_hand ?? 0) > 0,
  }));
};
