import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TabId, LabelTemplate, LabelElement } from '@/types/barcode'

interface BarcodeState {
  // Navigation
  activeTab: TabId
  
  // Templates
  editingTemplate: LabelTemplate | null
  showTemplateForm: boolean
  deleteConfirm: { open: boolean; template: LabelTemplate | null }
  duplicateTemplate: LabelTemplate | null
  
  // Designer state
  selectedElementId: string | null
  clipboardElement: LabelElement | null
  
  // Products
  selectedProductIds: string[]
  productSearch: string
  showPrintModal: boolean
  
  // Print settings
  defaultCopies: number
  
  // Actions
  setActiveTab: (tab: TabId) => void
  setEditingTemplate: (template: LabelTemplate | null) => void
  setShowTemplateForm: (show: boolean) => void
  setDeleteConfirm: (confirm: { open: boolean; template: LabelTemplate | null }) => void
  setSelectedProductIds: (ids: string[]) => void
  toggleProductSelection: (id: string) => void
  selectAllProducts: (ids: string[]) => void
  clearProductSelection: () => void
  setProductSearch: (search: string) => void
  setShowPrintModal: (show: boolean) => void
  setDefaultCopies: (copies: number) => void
  
  // Designer actions
  setSelectedElementId: (id: string | null) => void
  setClipboardElement: (element: LabelElement | null) => void
  
  // Helper actions
  openNewTemplateForm: () => void
  openEditTemplateForm: (template: LabelTemplate) => void
  openDuplicateTemplateForm: (template: LabelTemplate) => void
  closeTemplateForm: () => void
  openDeleteConfirm: (template: LabelTemplate) => void
  closeDeleteConfirm: () => void
}

export const useBarcodeStore = create<BarcodeState>()(
  persist(
    (set, get) => ({
      // Initial state
      activeTab: 'templates',
      editingTemplate: null,
      showTemplateForm: false,
      deleteConfirm: { open: false, template: null },
      duplicateTemplate: null,
      selectedElementId: null,
      clipboardElement: null,
      selectedProductIds: [],
      productSearch: '',
      showPrintModal: false,
      defaultCopies: 1,
      
      // Actions
      setActiveTab: (tab) => set({ activeTab: tab }),
      setEditingTemplate: (template) => set({ editingTemplate: template }),
      setShowTemplateForm: (show) => set({ showTemplateForm: show }),
      setDeleteConfirm: (confirm) => set({ deleteConfirm: confirm }),
      setSelectedProductIds: (ids) => set({ selectedProductIds: ids }),
      toggleProductSelection: (id) => {
        const { selectedProductIds } = get()
        if (selectedProductIds.includes(id)) {
          set({ selectedProductIds: selectedProductIds.filter(i => i !== id) })
        } else {
          set({ selectedProductIds: [...selectedProductIds, id] })
        }
      },
      selectAllProducts: (ids) => set({ selectedProductIds: ids }),
      clearProductSelection: () => set({ selectedProductIds: [] }),
      setProductSearch: (search) => set({ productSearch: search }),
      setShowPrintModal: (show) => set({ showPrintModal: show }),
      setDefaultCopies: (copies) => set({ defaultCopies: Math.max(1, Math.min(100, copies)) }),
      
      // Designer actions
      setSelectedElementId: (id) => set({ selectedElementId: id }),
      setClipboardElement: (element) => set({ clipboardElement: element }),
      
      // Helper actions
      openNewTemplateForm: () => set({ 
        showTemplateForm: true, 
        editingTemplate: null,
        duplicateTemplate: null,
        selectedElementId: null 
      }),
      openEditTemplateForm: (template) => set({ 
        showTemplateForm: true, 
        editingTemplate: template,
        duplicateTemplate: null,
        selectedElementId: null 
      }),
      openDuplicateTemplateForm: (template) => set({
        showTemplateForm: true,
        editingTemplate: null,
        duplicateTemplate: template,
        selectedElementId: null
      }),
      closeTemplateForm: () => set({ 
        showTemplateForm: false, 
        editingTemplate: null,
        duplicateTemplate: null,
        selectedElementId: null 
      }),
      openDeleteConfirm: (template) => set({ deleteConfirm: { open: true, template } }),
      closeDeleteConfirm: () => set({ deleteConfirm: { open: false, template: null } }),
    }),
    {
      name: 'barcode-store',
      partialize: (state) => ({
        activeTab: state.activeTab,
        defaultCopies: state.defaultCopies,
      }),
    }
  )
)
