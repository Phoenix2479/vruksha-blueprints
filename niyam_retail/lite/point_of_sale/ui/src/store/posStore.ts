import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { 
  POSSession, 
  Cart, 
  CartItem, 
  HeldTransaction,
  Customer,
  TaxBreakdown 
} from '@shared/types/retail';
import type { TaxRegion } from '@shared/config/tax';
import type { Currency } from '@shared/config/currency';

interface POSState {
  // Session
  session: POSSession | null;
  setSession: (session: POSSession | null) => void;
  
  // Cart
  cart: Cart | null;
  setCart: (cart: Cart | null) => void;
  addToCart: (item: Omit<CartItem, 'id'>) => void;
  updateCartItem: (itemId: string, updates: Partial<CartItem>) => void;
  removeFromCart: (itemId: string) => void;
  clearCart: () => void;
  
  // Customer
  selectedCustomer: Customer | null;
  setSelectedCustomer: (customer: Customer | null) => void;
  
  // Held Transactions
  heldTransactions: HeldTransaction[];
  holdCurrentCart: (note?: string) => void;
  recallHeldTransaction: (id: string) => void;
  deleteHeldTransaction: (id: string) => void;
  
  // Settings
  currency: Currency;
  setCurrency: (currency: Currency) => void;
  taxRegion: TaxRegion;
  setTaxRegion: (region: TaxRegion) => void;
  taxInclusive: boolean;
  setTaxInclusive: (inclusive: boolean) => void;
  
  // UI State
  isPaymentModalOpen: boolean;
  setPaymentModalOpen: (open: boolean) => void;
  isCustomerSearchOpen: boolean;
  setCustomerSearchOpen: (open: boolean) => void;
  isHoldListOpen: boolean;
  setHoldListOpen: (open: boolean) => void;
  
  // Calculations
  calculateCartTotals: () => void;
}

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const createEmptyCart = (sessionId: string): Cart => ({
  id: generateId(),
  sessionId,
  items: [],
  subtotal: 0,
  taxBreakdown: [],
  taxTotal: 0,
  discountTotal: 0,
  grandTotal: 0,
});

export const usePOSStore = create<POSState>()(
  persist(
    (set, get) => ({
      // Session
      session: null,
      setSession: (session) => set({ 
        session,
        cart: session ? createEmptyCart(session.id) : null 
      }),
      
      // Cart
      cart: null,
      setCart: (cart) => set({ cart }),
      
      addToCart: (item) => {
        const { cart, session, calculateCartTotals } = get();
        if (!cart || !session) return;
        
        // Check if item already exists
        const existingIndex = cart.items.findIndex(
          i => i.productId === item.productId && i.variantId === item.variantId
        );
        
        if (existingIndex >= 0) {
          // Update quantity
          const updatedItems = [...cart.items];
          updatedItems[existingIndex] = {
            ...updatedItems[existingIndex],
            quantity: updatedItems[existingIndex].quantity + item.quantity,
          };
          set({ 
            cart: { ...cart, items: updatedItems } 
          });
        } else {
          // Add new item
          const newItem: CartItem = {
            ...item,
            id: generateId(),
          };
          set({ 
            cart: { ...cart, items: [...cart.items, newItem] } 
          });
        }
        
        calculateCartTotals();
      },
      
      updateCartItem: (itemId, updates) => {
        const { cart, calculateCartTotals } = get();
        if (!cart) return;
        
        const updatedItems = cart.items.map(item =>
          item.id === itemId ? { ...item, ...updates } : item
        );
        
        set({ cart: { ...cart, items: updatedItems } });
        calculateCartTotals();
      },
      
      removeFromCart: (itemId) => {
        const { cart, calculateCartTotals } = get();
        if (!cart) return;
        
        const updatedItems = cart.items.filter(item => item.id !== itemId);
        set({ cart: { ...cart, items: updatedItems } });
        calculateCartTotals();
      },
      
      clearCart: () => {
        const { session } = get();
        if (!session) return;
        set({ cart: createEmptyCart(session.id), selectedCustomer: null });
      },
      
      // Customer
      selectedCustomer: null,
      setSelectedCustomer: (customer) => {
        const { cart } = get();
        set({ 
          selectedCustomer: customer,
          cart: cart ? {
            ...cart,
            customerId: customer?.id,
            customerName: customer ? `${customer.firstName} ${customer.lastName}` : undefined,
          } : null
        });
      },
      
      // Held Transactions
      heldTransactions: [],
      
      holdCurrentCart: (note) => {
        const { cart, session, selectedCustomer, clearCart } = get();
        if (!cart || !session || cart.items.length === 0) return;
        
        const heldTransaction: HeldTransaction = {
          id: generateId(),
          sessionId: session.id,
          cart: { ...cart },
          heldAt: new Date().toISOString(),
          heldBy: session.cashierName,
          note,
          customerName: selectedCustomer 
            ? `${selectedCustomer.firstName} ${selectedCustomer.lastName}` 
            : undefined,
          customerPhone: selectedCustomer?.phone,
        };
        
        set(state => ({
          heldTransactions: [...state.heldTransactions, heldTransaction],
        }));
        
        clearCart();
      },
      
      recallHeldTransaction: (id) => {
        const { heldTransactions, setCart } = get();
        const held = heldTransactions.find(h => h.id === id);
        if (!held) return;
        
        setCart(held.cart);
        // Note: would need to fetch customer details if needed
        
        set(state => ({
          heldTransactions: state.heldTransactions.filter(h => h.id !== id),
        }));
      },
      
      deleteHeldTransaction: (id) => {
        set(state => ({
          heldTransactions: state.heldTransactions.filter(h => h.id !== id),
        }));
      },
      
      // Settings
      currency: 'INR',
      setCurrency: (currency) => set({ currency }),
      taxRegion: 'IN',
      setTaxRegion: (taxRegion) => set({ taxRegion }),
      taxInclusive: false,
      setTaxInclusive: (taxInclusive) => set({ taxInclusive }),
      
      // UI State
      isPaymentModalOpen: false,
      setPaymentModalOpen: (open) => set({ isPaymentModalOpen: open }),
      isCustomerSearchOpen: false,
      setCustomerSearchOpen: (open) => set({ isCustomerSearchOpen: open }),
      isHoldListOpen: false,
      setHoldListOpen: (open) => set({ isHoldListOpen: open }),
      
      // Calculate totals
      calculateCartTotals: () => {
        const { cart, taxInclusive } = get();
        if (!cart) return;
        
        let subtotal = 0;
        let taxTotal = 0;
        let discountTotal = 0;
        const taxBreakdownMap = new Map<string, TaxBreakdown>();
        
        const updatedItems = cart.items.map(item => {
          const basePrice = item.unitPrice * item.quantity;
          const discountAmount = item.discountValue 
            ? (item.discountType === 'percentage' 
                ? basePrice * (item.discountValue / 100)
                : item.discountValue)
            : 0;
          
          const taxableAmount = basePrice - discountAmount;
          const taxAmount = taxInclusive
            ? taxableAmount - (taxableAmount / (1 + item.taxRate / 100))
            : taxableAmount * (item.taxRate / 100);
          
          const lineTotal = taxInclusive
            ? taxableAmount
            : taxableAmount + taxAmount;
          
          // Aggregate tax breakdown
          const existing = taxBreakdownMap.get(item.taxRateId);
          if (existing) {
            existing.taxableAmount += taxableAmount;
            existing.taxAmount += taxAmount;
          } else {
            taxBreakdownMap.set(item.taxRateId, {
              taxRateId: item.taxRateId,
              taxName: `Tax ${item.taxRate}%`,
              taxRate: item.taxRate,
              taxableAmount,
              taxAmount,
            });
          }
          
          subtotal += taxInclusive ? (taxableAmount - taxAmount) : taxableAmount;
          taxTotal += taxAmount;
          discountTotal += discountAmount;
          
          return {
            ...item,
            taxAmount,
            discountAmount,
            lineTotal,
          };
        });
        
        const grandTotal = subtotal + taxTotal;
        
        set({
          cart: {
            ...cart,
            items: updatedItems,
            subtotal: Math.round(subtotal * 100) / 100,
            taxBreakdown: Array.from(taxBreakdownMap.values()),
            taxTotal: Math.round(taxTotal * 100) / 100,
            discountTotal: Math.round(discountTotal * 100) / 100,
            grandTotal: Math.round(grandTotal * 100) / 100,
          },
        });
      },
    }),
    {
      name: 'niyam-pos-store',
      partialize: (state) => ({
        currency: state.currency,
        taxRegion: state.taxRegion,
        taxInclusive: state.taxInclusive,
        heldTransactions: state.heldTransactions,
      }),
    }
  )
);
