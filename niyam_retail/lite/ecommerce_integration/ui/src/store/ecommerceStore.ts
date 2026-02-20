import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TabId } from '@/types/ecommerce'

interface EcommerceState {
  // Navigation
  activeTab: TabId
  sidebarCollapsed: boolean
  
  // Action results
  actionResult: {
    action: string
    success: boolean
    data?: any
    error?: string
  } | null
  actionLoading: string | null
  
  // Actions
  setActiveTab: (tab: TabId) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setActionResult: (result: EcommerceState['actionResult']) => void
  setActionLoading: (action: string | null) => void
  clearActionResult: () => void
}

export const useEcommerceStore = create<EcommerceState>()(
  persist(
    (set) => ({
      // Initial state
      activeTab: 'overview',
      sidebarCollapsed: false,
      actionResult: null,
      actionLoading: null,
      
      // Actions
      setActiveTab: (tab) => set({ activeTab: tab }),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setActionResult: (result) => set({ actionResult: result }),
      setActionLoading: (action) => set({ actionLoading: action }),
      clearActionResult: () => set({ actionResult: null }),
    }),
    {
      name: 'ecommerce-store',
      partialize: (state) => ({
        activeTab: state.activeTab,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
)
