import { create } from 'zustand';
import type { CartItem } from '@shared/types/models.ts';

interface CartState {
  items: CartItem[];
  sessionId: string | null;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  setCart: (items: CartItem[], sessionId: string) => void;
  addItem: (item: CartItem) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  removeItem: (itemId: string) => void;
  applyDiscount: (discountAmount: number) => void;
  clearCart: () => void;
  calculateTotals: () => void;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  sessionId: null,
  subtotal: 0,
  tax: 0,
  discount: 0,
  total: 0,

  setCart: (items, sessionId) => {
    set({ items, sessionId });
    get().calculateTotals();
  },

  addItem: (item) => {
    const items = [...get().items];
    const existingIndex = items.findIndex(i => i.product_id === item.product_id);
    
    if (existingIndex >= 0) {
      items[existingIndex].quantity += item.quantity;
      items[existingIndex].total = items[existingIndex].quantity * items[existingIndex].unit_price;
    } else {
      items.push(item);
    }
    
    set({ items });
    get().calculateTotals();
  },

  updateQuantity: (itemId, quantity) => {
    const items = get().items.map(item => {
      if (item.id === itemId) {
        return { ...item, quantity, total: quantity * item.unit_price };
      }
      return item;
    });
    
    set({ items });
    get().calculateTotals();
  },

  removeItem: (itemId) => {
    const items = get().items.filter(item => item.id !== itemId);
    set({ items });
    get().calculateTotals();
  },

  applyDiscount: (discountAmount) => {
    set({ discount: discountAmount });
    get().calculateTotals();
  },

  clearCart: () => {
    set({ items: [], subtotal: 0, tax: 0, discount: 0, total: 0 });
  },

  calculateTotals: () => {
    const items = get().items;
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const tax = items.reduce((sum, item) => sum + (item.total * item.tax_rate / 100), 0);
    const discount = get().discount;
    const total = subtotal + tax - discount;
    
    set({ subtotal, tax, total });
  },
}));
