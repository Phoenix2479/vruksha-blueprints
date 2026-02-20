import { create } from 'zustand';

interface CatalogFilters {
  search: string;
  categoryId: string;
  brandId: string;
  status: 'all' | 'active' | 'inactive';
  hasVariants?: boolean;
  tags?: string[];
}

interface CatalogState {
  // Filters
  filters: CatalogFilters;
  setFilters: (filters: Partial<CatalogFilters>) => void;
  clearFilters: () => void;
  
  // View
  viewMode: 'list' | 'grid';
  setViewMode: (mode: 'list' | 'grid') => void;
  
  // Selection
  selectedProducts: Set<string>;
  toggleSelectProduct: (id: string) => void;
  selectAllProducts: (ids: string[]) => void;
  clearSelection: () => void;
  
  // Pagination
  page: number;
  setPage: (page: number) => void;
  
  // Currency & Tax settings
  currency: string;
  setCurrency: (currency: string) => void;
  taxRegion: string;
  setTaxRegion: (region: string) => void;
}

const initialFilters: CatalogFilters = {
  search: '',
  categoryId: '',
  brandId: '',
  status: 'all',
};

export const useCatalogStore = create<CatalogState>((set) => ({
  // Filters
  filters: initialFilters,
  setFilters: (newFilters) =>
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
      page: 1,
    })),
  clearFilters: () =>
    set({ filters: initialFilters, page: 1 }),
  
  // View
  viewMode: 'list',
  setViewMode: (mode) => set({ viewMode: mode }),
  
  // Selection
  selectedProducts: new Set(),
  toggleSelectProduct: (id) =>
    set((state) => {
      const newSet = new Set(state.selectedProducts);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return { selectedProducts: newSet };
    }),
  selectAllProducts: (ids) =>
    set({ selectedProducts: new Set(ids) }),
  clearSelection: () =>
    set({ selectedProducts: new Set() }),
  
  // Pagination
  page: 1,
  setPage: (page) => set({ page }),
  
  // Currency & Tax
  currency: 'INR',
  setCurrency: (currency) => set({ currency }),
  taxRegion: 'IN',
  setTaxRegion: (region) => set({ taxRegion: region }),
}));
