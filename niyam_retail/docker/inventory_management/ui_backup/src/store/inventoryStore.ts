import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Product } from '../../../../shared/types/retail';
import type { TaxRegion } from '../../../../shared/config/tax';

interface InventoryFilters {
  search: string;
  categoryId: string;
  status: 'all' | 'active' | 'inactive' | 'low_stock' | 'out_of_stock';
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

interface InventoryState {
  // Filters
  filters: InventoryFilters;
  setFilter: <K extends keyof InventoryFilters>(key: K, value: InventoryFilters[K]) => void;
  resetFilters: () => void;
  
  // View
  viewMode: 'table' | 'grid';
  setViewMode: (mode: 'table' | 'grid') => void;
  
  // Selection
  selectedProducts: Set<string>;
  toggleSelectProduct: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  
  // Dialogs
  isAddDialogOpen: boolean;
  setAddDialogOpen: (open: boolean) => void;
  isAdjustDialogOpen: boolean;
  setAdjustDialogOpen: (open: boolean) => void;
  isTransferDialogOpen: boolean;
  setTransferDialogOpen: (open: boolean) => void;
  isImportDialogOpen: boolean;
  setImportDialogOpen: (open: boolean) => void;
  
  // Edit state
  editingProduct: Product | null;
  setEditingProduct: (product: Product | null) => void;
  
  // Adjustment state
  adjustmentProduct: Product | null;
  setAdjustmentProduct: (product: Product | null) => void;
  
  // Settings
  currency: string;
  setCurrency: (currency: string) => void;
  taxRegion: TaxRegion;
  setTaxRegion: (region: TaxRegion) => void;
}

const DEFAULT_FILTERS: InventoryFilters = {
  search: '',
  categoryId: '',
  status: 'all',
  sortBy: 'name',
  sortOrder: 'asc',
};

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set) => ({
      // Filters
      filters: DEFAULT_FILTERS,
      setFilter: (key, value) => set((state) => ({
        filters: { ...state.filters, [key]: value },
      })),
      resetFilters: () => set({ filters: DEFAULT_FILTERS }),
      
      // View
      viewMode: 'table',
      setViewMode: (viewMode) => set({ viewMode }),
      
      // Selection
      selectedProducts: new Set(),
      toggleSelectProduct: (id) => set((state) => {
        const newSet = new Set(state.selectedProducts);
        if (newSet.has(id)) {
          newSet.delete(id);
        } else {
          newSet.add(id);
        }
        return { selectedProducts: newSet };
      }),
      selectAll: (ids) => set({ selectedProducts: new Set(ids) }),
      clearSelection: () => set({ selectedProducts: new Set() }),
      
      // Dialogs
      isAddDialogOpen: false,
      setAddDialogOpen: (open) => set({ isAddDialogOpen: open }),
      isAdjustDialogOpen: false,
      setAdjustDialogOpen: (open) => set({ isAdjustDialogOpen: open }),
      isTransferDialogOpen: false,
      setTransferDialogOpen: (open) => set({ isTransferDialogOpen: open }),
      isImportDialogOpen: false,
      setImportDialogOpen: (open) => set({ isImportDialogOpen: open }),
      
      // Edit state
      editingProduct: null,
      setEditingProduct: (product) => set({ editingProduct: product }),
      
      // Adjustment state
      adjustmentProduct: null,
      setAdjustmentProduct: (product) => set({ adjustmentProduct: product }),
      
      // Settings
      currency: 'INR',
      setCurrency: (currency) => set({ currency }),
      taxRegion: 'IN',
      setTaxRegion: (taxRegion) => set({ taxRegion }),
    }),
    {
      name: 'niyam-inventory-store',
      partialize: (state) => ({
        viewMode: state.viewMode,
        currency: state.currency,
        taxRegion: state.taxRegion,
      }),
    }
  )
);
