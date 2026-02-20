import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useInventoryStore, type TabId } from '@/store/inventoryStore'
import { productsApi, stockApi, healthApi } from '@/lib/api'
import type { Product } from '@/types/inventory'

// Shared components
import { Button } from '@shared/components/ui'
import {
  Sidebar,
  PageHeader,
  EmptyState,
  ConfirmDialog,
  ThemeToggle,
  type SidebarGroup,
} from '@shared/components/blocks'

// Icons
import {
  Package, Plus, RefreshCw, CheckCircle, XCircle,
  Bell, ClipboardList, Truck, ArrowRightLeft, MapPin,
  Hash, Layers, DollarSign, Target, Archive, Clock,
  ShoppingCart, Trash2, Upload, LayoutDashboard,
} from 'lucide-react'

// Feature Components
import InventoryKPIs from '@/components/dashboard/InventoryKPIs'
import ProductsContent from '@/components/products/ProductsContent'
import ProductModal from '@/components/products/ProductModal'
import AdjustStockModal from '@/components/products/AdjustStockModal'
import LowStockAlerts from '@/components/alerts/LowStockAlerts'
import StockCounts from '@/components/stock-counts/StockCounts'
import GoodsReceiving from '@/components/receiving/GoodsReceiving'
import StockTransfers from '@/components/transfers/StockTransfers'
import LocationManagement from '@/components/locations/LocationManagement'
import SerialTracking from '@/components/serials/SerialTracking'
import BatchTracking from '@/components/batches/BatchTracking'
import InventoryValuation from '@/components/valuation/InventoryValuation'
import ABCAnalysis from '@/components/analysis/ABCAnalysis'
import DeadStockAnalysis from '@/components/analysis/DeadStockAnalysis'
import StockAging from '@/components/analysis/StockAging'
import ReorderManagement from '@/components/reorder/ReorderManagement'
import WriteOffs from '@/components/writeoffs/WriteOffs'
import ImportModal from '@/components/import/ImportModal'

// Sidebar configuration
const sidebarGroups: SidebarGroup[] = [
  {
    label: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { id: 'products', label: 'Products', icon: Package },
      { id: 'alerts', label: 'Low Stock Alerts', icon: Bell },
      { id: 'locations', label: 'Locations', icon: MapPin },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'counts', label: 'Stock Counts', icon: ClipboardList },
      { id: 'receiving', label: 'Goods Receiving', icon: Truck },
      { id: 'transfers', label: 'Stock Transfers', icon: ArrowRightLeft },
    ],
  },
  {
    label: 'Tracking',
    items: [
      { id: 'serials', label: 'Serial Numbers', icon: Hash },
      { id: 'batches', label: 'Batch/Lot', icon: Layers },
    ],
  },
  {
    label: 'Planning',
    items: [
      { id: 'reorder', label: 'Reorder', icon: ShoppingCart },
      { id: 'writeoffs', label: 'Write-offs', icon: Trash2 },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { id: 'valuation', label: 'Valuation', icon: DollarSign },
      { id: 'abc', label: 'ABC Analysis', icon: Target },
      { id: 'dead-stock', label: 'Dead Stock', icon: Archive },
      { id: 'aging', label: 'Stock Aging', icon: Clock },
    ],
  },
]

const tabConfig: Record<TabId, { 
  label: string
  description: string
  icon: typeof Package 
}> = {
  dashboard: {
    label: 'Dashboard',
    description: 'Inventory overview and key metrics',
    icon: LayoutDashboard,
  },
  products: {
    label: 'Products',
    description: 'Manage your product catalog and inventory levels',
    icon: Package,
  },
  alerts: {
    label: 'Low Stock Alerts',
    description: 'Monitor products below reorder level',
    icon: Bell,
  },
  counts: {
    label: 'Stock Counts',
    description: 'Cycle counting and inventory verification',
    icon: ClipboardList,
  },
  receiving: {
    label: 'Goods Receiving',
    description: 'Process incoming goods and update stock',
    icon: Truck,
  },
  transfers: {
    label: 'Stock Transfers',
    description: 'Move stock between locations',
    icon: ArrowRightLeft,
  },
  locations: {
    label: 'Locations',
    description: 'Manage warehouses, zones, and bins',
    icon: MapPin,
  },
  serials: {
    label: 'Serial Numbers',
    description: 'Track individual items by serial number',
    icon: Hash,
  },
  batches: {
    label: 'Batch/Lot Tracking',
    description: 'Track items by batch or lot number',
    icon: Layers,
  },
  valuation: {
    label: 'Inventory Valuation',
    description: 'Calculate inventory value using FIFO/LIFO/WAC',
    icon: DollarSign,
  },
  abc: {
    label: 'ABC Analysis',
    description: 'Classify products by value contribution',
    icon: Target,
  },
  'dead-stock': {
    label: 'Dead Stock Analysis',
    description: 'Identify slow-moving inventory',
    icon: Archive,
  },
  aging: {
    label: 'Stock Aging',
    description: 'Analyze stock by age brackets',
    icon: Clock,
  },
  reorder: {
    label: 'Reorder Management',
    description: 'Smart reorder suggestions and PO creation',
    icon: ShoppingCart,
  },
  writeoffs: {
    label: 'Write-offs',
    description: 'Manage damaged, expired, or lost stock',
    icon: Trash2,
  },
}

export default function InventoryMainPage() {
  const queryClient = useQueryClient()
  const [showImportModal, setShowImportModal] = useState(false)
  
  // Store state
  const {
    activeTab,
    setActiveTab,
    sidebarCollapsed,
    setSidebarCollapsed,
    searchQuery,
    setSearchQuery,
    filterLowStock,
    setFilterLowStock,
    showAddModal,
    showAdjustModal,
    editingProduct,
    selectedProduct,
    deleteConfirm,
    openAddModal,
    openEditModal,
    openAdjustModal,
    openDeleteConfirm,
    closeAllModals,
    setDeleteConfirm,
  } = useInventoryStore()

  // Data queries
  const { data: products = [], isLoading: productsLoading, refetch } = useQuery({
    queryKey: ['products', searchQuery, filterLowStock],
    queryFn: () => productsApi.list({ 
      search: searchQuery || undefined,
      low_stock: filterLowStock || undefined 
    }),
  })

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: healthApi.status,
    refetchInterval: 30000,
  })

  // Mutations
  const createProduct = useMutation({
    mutationFn: productsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      closeAllModals()
    },
  })

  const updateProduct = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Product> }) => 
      productsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      closeAllModals()
    },
  })

  const deleteProduct = useMutation({
    mutationFn: productsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setDeleteConfirm({ open: false, product: null })
    },
  })

  const adjustStock = useMutation({
    mutationFn: stockApi.adjust,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['stock-history'] })
      closeAllModals()
    },
  })

  // Current tab config
  const currentTab = tabConfig[activeTab]
  const TabIcon = currentTab.icon

  // Render tab content
  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <InventoryKPIs />
      case 'products':
        return (
          <ProductsContent
            products={products}
            isLoading={productsLoading}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            filterLowStock={filterLowStock}
            onFilterLowStockChange={setFilterLowStock}
            onAdd={openAddModal}
            onEdit={openEditModal}
            onDelete={openDeleteConfirm}
            onAdjust={openAdjustModal}
          />
        )
      case 'alerts':
        return <LowStockAlerts />
      case 'counts':
        return <StockCounts />
      case 'receiving':
        return <GoodsReceiving />
      case 'transfers':
        return <StockTransfers />
      case 'locations':
        return <LocationManagement />
      case 'serials':
        return <SerialTracking />
      case 'batches':
        return <BatchTracking />
      case 'valuation':
        return <InventoryValuation />
      case 'abc':
        return <ABCAnalysis />
      case 'dead-stock':
        return <DeadStockAnalysis />
      case 'aging':
        return <StockAging />
      case 'reorder':
        return <ReorderManagement />
      case 'writeoffs':
        return <WriteOffs />
      default:
        return (
          <EmptyState 
            icon={Package} 
            title="Coming Soon" 
            description="This feature is under development" 
          />
        )
    }
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <Sidebar
        groups={sidebarGroups}
        activeItem={activeTab}
        onItemClick={(id) => setActiveTab(id as TabId)}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        header={
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-primary/10 rounded-lg">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <span className="font-semibold text-foreground">Inventory</span>
          </div>
        }
        footer={
          <div className="flex items-center gap-2 text-sm">
            {health?.status === 'ok' ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500" />
            )}
            <span className="text-muted-foreground">
              {health?.status || 'Checking...'}
            </span>
          </div>
        }
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen">
        <PageHeader
          title={currentTab.label}
          description={currentTab.description}
          icon={TabIcon}
          iconColor="text-primary"
          iconBg="bg-primary/10"
          sticky
          actions={
            <div className="flex items-center gap-2">
              <ThemeToggle />
              {activeTab === 'products' && (
                <Button 
                  variant="outline" 
                  onClick={() => setShowImportModal(true)}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Import
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => refetch()}>
                <RefreshCw className="h-5 w-5" />
              </Button>
            </div>
          }
          primaryAction={activeTab === 'products' ? {
            label: 'Add Product',
            icon: Plus,
            onClick: openAddModal,
          } : undefined}
        />

        <main className="flex-1 p-6 overflow-auto">
          {renderContent()}
        </main>
      </div>

      {/* Product Add/Edit Modal */}
      {showAddModal && (
        <ProductModal
          product={editingProduct}
          onClose={closeAllModals}
          onSave={(data) => {
            if (editingProduct) {
              updateProduct.mutate({ id: editingProduct.id, data })
            } else {
              createProduct.mutate(data)
            }
          }}
          isLoading={createProduct.isPending || updateProduct.isPending}
        />
      )}

      {/* Stock Adjustment Modal */}
      {showAdjustModal && selectedProduct && (
        <AdjustStockModal
          product={selectedProduct}
          onClose={closeAllModals}
          onSave={(data) => adjustStock.mutate(data)}
          isLoading={adjustStock.isPending}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => 
          setDeleteConfirm({ open, product: open ? deleteConfirm.product : null })
        }
        title="Delete Product"
        description={`Are you sure you want to delete "${deleteConfirm.product?.name}"? This action cannot be undone.`}
        variant="destructive"
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteConfirm.product) {
            deleteProduct.mutate(deleteConfirm.product.id)
          }
        }}
        loading={deleteProduct.isPending}
      />

      {/* Import Modal */}
      <ImportModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['products'] })
        }}
      />
    </div>
  )
}
