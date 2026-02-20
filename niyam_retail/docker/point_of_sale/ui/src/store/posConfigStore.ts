import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Worker/Cashier profile with their personalized settings
export interface WorkerProfile {
  id: string;
  name: string;
  code: string; // 4-6 digit security code for quick switch
  role: 'cashier' | 'supervisor' | 'manager';
  avatarUrl?: string;
  settings: POSDisplaySettings;
  createdAt: string;
  lastActiveAt: string;
}

// Layout presets
export type LayoutPreset = 'minimal' | 'standard' | 'full';

// Product card display options
export interface ProductCardConfig {
  showImage: boolean;
  showSku: boolean;
  showCategory: boolean;
  showSizeSelector: boolean;
  showColorSelector: boolean;
  showStockCount: boolean; // Show remaining inventory
  showOriginalPrice: boolean; // For discounted items
  cardSize: 'compact' | 'normal' | 'large';
}

// Cart panel configuration
export interface CartPanelConfig {
  showCustomerSearch: boolean;
  showDiscountCode: boolean;
  showItemNotes: boolean;
  showItemImage: boolean;
  showTaxBreakdown: boolean;
  showHoldButton: boolean;
  showReceiptPreview: boolean;
  position: 'right' | 'bottom';
}

// Sidebar navigation config
export interface SidebarConfig {
  visible: boolean;
  collapsed: boolean;
  items: {
    overview: boolean;
    orders: boolean;
    categories: boolean;
    promos: boolean;
    transactions: boolean;
    products: boolean;
    reporting: boolean;
    userManagement: boolean;
    bankAccount: boolean;
    deliveryOrders: boolean;
  };
}

// Payment methods config
export interface PaymentConfig {
  enableCash: boolean;
  enableCard: boolean;
  enableUPI: boolean;
  enableWallet: boolean;
  enableCredit: boolean; // Store credit
  enableSplitPayment: boolean;
  defaultMethod: 'cash' | 'card' | 'upi';
}

// Quick actions toolbar
export interface QuickActionsConfig {
  showBarcodeScanner: boolean;
  showManualEntry: boolean;
  showCategoryFilter: boolean;
  showSortOptions: boolean;
  showViewToggle: boolean; // Grid/List
  showQuickProducts: boolean; // Frequently sold items
}

// Complete display settings
export interface POSDisplaySettings {
  preset: LayoutPreset;
  theme: 'light' | 'dark' | 'system';
  productCard: ProductCardConfig;
  cartPanel: CartPanelConfig;
  sidebar: SidebarConfig;
  payment: PaymentConfig;
  quickActions: QuickActionsConfig;
  productView: 'grid' | 'list';
  gridColumns: 2 | 3 | 4 | 5;
  fontSize: 'small' | 'medium' | 'large';
  soundEffects: boolean;
  autoFocusSearch: boolean;
  confirmBeforeClear: boolean;
  showKeyboardShortcuts: boolean;
}

// Default settings for each preset
const minimalPreset: POSDisplaySettings = {
  preset: 'minimal',
  theme: 'system',
  productCard: {
    showImage: true,
    showSku: false,
    showCategory: false,
    showSizeSelector: false,
    showColorSelector: false,
    showStockCount: true,
    showOriginalPrice: false,
    cardSize: 'compact',
  },
  cartPanel: {
    showCustomerSearch: false,
    showDiscountCode: false,
    showItemNotes: false,
    showItemImage: false,
    showTaxBreakdown: false,
    showHoldButton: false,
    showReceiptPreview: false,
    position: 'right',
  },
  sidebar: {
    visible: false,
    collapsed: true,
    items: {
      overview: false,
      orders: true,
      categories: false,
      promos: false,
      transactions: false,
      products: false,
      reporting: false,
      userManagement: false,
      bankAccount: false,
      deliveryOrders: false,
    },
  },
  payment: {
    enableCash: true,
    enableCard: true,
    enableUPI: false,
    enableWallet: false,
    enableCredit: false,
    enableSplitPayment: false,
    defaultMethod: 'cash',
  },
  quickActions: {
    showBarcodeScanner: true,
    showManualEntry: false,
    showCategoryFilter: false,
    showSortOptions: false,
    showViewToggle: false,
    showQuickProducts: false,
  },
  productView: 'grid',
  gridColumns: 4,
  fontSize: 'medium',
  soundEffects: false,
  autoFocusSearch: true,
  confirmBeforeClear: false,
  showKeyboardShortcuts: false,
};

const standardPreset: POSDisplaySettings = {
  preset: 'standard',
  theme: 'system',
  productCard: {
    showImage: true,
    showSku: false,
    showCategory: true,
    showSizeSelector: true,
    showColorSelector: true,
    showStockCount: true,
    showOriginalPrice: true,
    cardSize: 'normal',
  },
  cartPanel: {
    showCustomerSearch: true,
    showDiscountCode: true,
    showItemNotes: false,
    showItemImage: true,
    showTaxBreakdown: false,
    showHoldButton: true,
    showReceiptPreview: false,
    position: 'right',
  },
  sidebar: {
    visible: true,
    collapsed: false,
    items: {
      overview: true,
      orders: true,
      categories: true,
      promos: true,
      transactions: true,
      products: true,
      reporting: false,
      userManagement: false,
      bankAccount: false,
      deliveryOrders: false,
    },
  },
  payment: {
    enableCash: true,
    enableCard: true,
    enableUPI: true,
    enableWallet: false,
    enableCredit: false,
    enableSplitPayment: false,
    defaultMethod: 'card',
  },
  quickActions: {
    showBarcodeScanner: true,
    showManualEntry: true,
    showCategoryFilter: true,
    showSortOptions: true,
    showViewToggle: true,
    showQuickProducts: false,
  },
  productView: 'grid',
  gridColumns: 3,
  fontSize: 'medium',
  soundEffects: true,
  autoFocusSearch: true,
  confirmBeforeClear: true,
  showKeyboardShortcuts: true,
};

const fullPreset: POSDisplaySettings = {
  preset: 'full',
  theme: 'system',
  productCard: {
    showImage: true,
    showSku: true,
    showCategory: true,
    showSizeSelector: true,
    showColorSelector: true,
    showStockCount: true,
    showOriginalPrice: true,
    cardSize: 'normal',
  },
  cartPanel: {
    showCustomerSearch: true,
    showDiscountCode: true,
    showItemNotes: true,
    showItemImage: true,
    showTaxBreakdown: true,
    showHoldButton: true,
    showReceiptPreview: true,
    position: 'right',
  },
  sidebar: {
    visible: true,
    collapsed: false,
    items: {
      overview: true,
      orders: true,
      categories: true,
      promos: true,
      transactions: true,
      products: true,
      reporting: true,
      userManagement: true,
      bankAccount: true,
      deliveryOrders: true,
    },
  },
  payment: {
    enableCash: true,
    enableCard: true,
    enableUPI: true,
    enableWallet: true,
    enableCredit: true,
    enableSplitPayment: true,
    defaultMethod: 'card',
  },
  quickActions: {
    showBarcodeScanner: true,
    showManualEntry: true,
    showCategoryFilter: true,
    showSortOptions: true,
    showViewToggle: true,
    showQuickProducts: true,
  },
  productView: 'grid',
  gridColumns: 3,
  fontSize: 'medium',
  soundEffects: true,
  autoFocusSearch: true,
  confirmBeforeClear: true,
  showKeyboardShortcuts: true,
};

export const presets: Record<LayoutPreset, POSDisplaySettings> = {
  minimal: minimalPreset,
  standard: standardPreset,
  full: fullPreset,
};

interface POSConfigState {
  // Current active worker
  activeWorker: WorkerProfile | null;
  
  // All registered workers on this device
  workers: WorkerProfile[];
  
  // Current display settings (from active worker or default)
  settings: POSDisplaySettings;
  
  // Quick switch mode
  isQuickSwitchOpen: boolean;
  quickSwitchError: string | null;
  
  // Settings panel
  isSettingsOpen: boolean;
  settingsTab: 'presets' | 'products' | 'cart' | 'sidebar' | 'payment' | 'advanced';
  
  // Actions
  setActiveWorker: (worker: WorkerProfile | null) => void;
  loginWithCode: (code: string) => WorkerProfile | null;
  registerWorker: (worker: Omit<WorkerProfile, 'id' | 'createdAt' | 'lastActiveAt' | 'settings'>) => WorkerProfile;
  updateWorker: (id: string, updates: Partial<WorkerProfile>) => void;
  removeWorker: (id: string) => void;
  
  // Settings actions
  applyPreset: (preset: LayoutPreset) => void;
  updateSettings: (updates: Partial<POSDisplaySettings>) => void;
  updateProductCardConfig: (updates: Partial<ProductCardConfig>) => void;
  updateCartPanelConfig: (updates: Partial<CartPanelConfig>) => void;
  updateSidebarConfig: (updates: Partial<SidebarConfig>) => void;
  updatePaymentConfig: (updates: Partial<PaymentConfig>) => void;
  updateQuickActionsConfig: (updates: Partial<QuickActionsConfig>) => void;
  
  // UI actions
  setQuickSwitchOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setSettingsTab: (tab: POSConfigState['settingsTab']) => void;
}

const generateId = () => `worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export const usePOSConfigStore = create<POSConfigState>()(
  persist(
    (set, get) => ({
      activeWorker: null,
      workers: [],
      settings: standardPreset,
      isQuickSwitchOpen: false,
      quickSwitchError: null,
      isSettingsOpen: false,
      settingsTab: 'presets',
      
      setActiveWorker: (worker) => {
        if (worker) {
          // Update last active time
          const now = new Date().toISOString();
          set(state => ({
            activeWorker: { ...worker, lastActiveAt: now },
            settings: worker.settings,
            workers: state.workers.map(w => 
              w.id === worker.id ? { ...w, lastActiveAt: now } : w
            ),
          }));
        } else {
          set({ activeWorker: null, settings: standardPreset });
        }
      },
      
      loginWithCode: (code) => {
        const { workers, setActiveWorker } = get();
        const worker = workers.find(w => w.code === code);
        
        if (worker) {
          setActiveWorker(worker);
          set({ quickSwitchError: null, isQuickSwitchOpen: false });
          return worker;
        }
        
        set({ quickSwitchError: 'Invalid code. Please try again.' });
        return null;
      },
      
      registerWorker: (workerData) => {
        const now = new Date().toISOString();
        const newWorker: WorkerProfile = {
          ...workerData,
          id: generateId(),
          settings: standardPreset,
          createdAt: now,
          lastActiveAt: now,
        };
        
        set(state => ({
          workers: [...state.workers, newWorker],
        }));
        
        return newWorker;
      },
      
      updateWorker: (id, updates) => {
        set(state => ({
          workers: state.workers.map(w => 
            w.id === id ? { ...w, ...updates } : w
          ),
          activeWorker: state.activeWorker?.id === id 
            ? { ...state.activeWorker, ...updates }
            : state.activeWorker,
        }));
      },
      
      removeWorker: (id) => {
        set(state => ({
          workers: state.workers.filter(w => w.id !== id),
          activeWorker: state.activeWorker?.id === id ? null : state.activeWorker,
        }));
      },
      
      applyPreset: (preset) => {
        const newSettings = { ...presets[preset] };
        const { activeWorker, updateWorker } = get();
        
        set({ settings: newSettings });
        
        if (activeWorker) {
          updateWorker(activeWorker.id, { settings: newSettings });
        }
      },
      
      updateSettings: (updates) => {
        const { activeWorker, updateWorker, settings } = get();
        const newSettings = { ...settings, ...updates, preset: 'standard' as LayoutPreset };
        
        set({ settings: newSettings });
        
        if (activeWorker) {
          updateWorker(activeWorker.id, { settings: newSettings });
        }
      },
      
      updateProductCardConfig: (updates) => {
        const { settings, updateSettings } = get();
        updateSettings({
          productCard: { ...settings.productCard, ...updates },
        });
      },
      
      updateCartPanelConfig: (updates) => {
        const { settings, updateSettings } = get();
        updateSettings({
          cartPanel: { ...settings.cartPanel, ...updates },
        });
      },
      
      updateSidebarConfig: (updates) => {
        const { settings, updateSettings } = get();
        updateSettings({
          sidebar: { ...settings.sidebar, ...updates },
        });
      },
      
      updatePaymentConfig: (updates) => {
        const { settings, updateSettings } = get();
        updateSettings({
          payment: { ...settings.payment, ...updates },
        });
      },
      
      updateQuickActionsConfig: (updates) => {
        const { settings, updateSettings } = get();
        updateSettings({
          quickActions: { ...settings.quickActions, ...updates },
        });
      },
      
      setQuickSwitchOpen: (open) => set({ isQuickSwitchOpen: open, quickSwitchError: null }),
      setSettingsOpen: (open) => set({ isSettingsOpen: open }),
      setSettingsTab: (tab) => set({ settingsTab: tab }),
    }),
    {
      name: 'niyam-pos-config',
      partialize: (state) => ({
        workers: state.workers,
        activeWorker: state.activeWorker,
        settings: state.settings,
      }),
    }
  )
);
