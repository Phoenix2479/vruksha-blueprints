import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Product } from '@/types/inventory'

type TabId = 
  | 'dashboard'
  | 'products' 
  | 'alerts' 
  | 'counts' 
  | 'receiving' 
  | 'transfers' 
  | 'locations'
  | 'serials'
  | 'batches'
  | 'valuation'
  | 'abc'
  | 'dead-stock'
  | 'aging'
  | 'reorder'
  | 'writeoffs'

interface InventoryState {
  // Navigation
  activeTab: TabId
  sidebarCollapsed: boolean
  
  // Search & Filters
  searchQuery: string
  filterLowStock: boolean
  
  // Product Selection
  selectedProduct: Product | null
  editingProduct: Product | null
  
  // Modals
  showAddModal: boolean
  showAdjustModal: boolean
  deleteConfirm: { open: boolean; product: Product | null }
  
  // Settings
  currency: string
  locale: string
  
  // Actions
  setActiveTab: (tab: TabId) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setSearchQuery: (query: string) => void
  setFilterLowStock: (filter: boolean) => void
  setSelectedProduct: (product: Product | null) => void
  setEditingProduct: (product: Product | null) => void
  setShowAddModal: (show: boolean) => void
  setShowAdjustModal: (show: boolean) => void
  setDeleteConfirm: (confirm: { open: boolean; product: Product | null }) => void
  
  // Helper actions
  openAddModal: () => void
  openEditModal: (product: Product) => void
  openAdjustModal: (product: Product) => void
  openDeleteConfirm: (product: Product) => void
  closeAllModals: () => void
}

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set) => ({
      // Initial state
      activeTab: 'dashboard',
      sidebarCollapsed: false,
      searchQuery: '',
      filterLowStock: false,
      selectedProduct: null,
      editingProduct: null,
      showAddModal: false,
      showAdjustModal: false,
      deleteConfirm: { open: false, product: null },
      currency: 'INR',
      locale: 'en-IN',
      
      // Actions
      setActiveTab: (tab) => set({ activeTab: tab }),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setFilterLowStock: (filter) => set({ filterLowStock: filter }),
      setSelectedProduct: (product) => set({ selectedProduct: product }),
      setEditingProduct: (product) => set({ editingProduct: product }),
      setShowAddModal: (show) => set({ showAddModal: show }),
      setShowAdjustModal: (show) => set({ showAdjustModal: show }),
      setDeleteConfirm: (confirm) => set({ deleteConfirm: confirm }),
      
      // Helper actions
      openAddModal: () => set({ 
        showAddModal: true, 
        editingProduct: null 
      }),
      openEditModal: (product) => set({ 
        showAddModal: true, 
        editingProduct: product 
      }),
      openAdjustModal: (product) => set({ 
        showAdjustModal: true, 
        selectedProduct: product 
      }),
      openDeleteConfirm: (product) => set({ 
        deleteConfirm: { open: true, product } 
      }),
      closeAllModals: () => set({ 
        showAddModal: false, 
        showAdjustModal: false, 
        editingProduct: null, 
        selectedProduct: null,
        deleteConfirm: { open: false, product: null }
      }),
    }),
    {
      name: 'inventory-store',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        currency: state.currency,
        locale: state.locale,
      }),
    }
  )
)

export type { TabId }
