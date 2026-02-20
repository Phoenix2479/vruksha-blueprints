import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useBarcodeStore } from '@/store/barcodeStore'
import type { TabId } from '@/types/barcode'

import {
  Button,
  Badge,
  ScrollArea,
} from '@/components/ui'

import { ThemeToggle } from '@/components/blocks'

import {
  Tags,
  RefreshCw,
  Loader2,
  FileText,
  Package,
  History,
  Printer,
  ChevronRight,
  BarChart3,
  Settings,
} from 'lucide-react'

import TemplatesTab from '@/components/tabs/TemplatesTab'
import ProductsTab from '@/components/tabs/ProductsTab'
import PrintHistoryTab from '@/components/tabs/PrintHistoryTab'

interface NavItem {
  id: TabId
  label: string
  icon: React.ElementType
  description: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'templates', label: 'Templates', icon: FileText, description: 'Manage label designs' },
  { id: 'products', label: 'Products', icon: Package, description: 'Select items to print' },
  { id: 'history', label: 'Print History', icon: History, description: 'View past print jobs' },
]

export default function BarcodeMainPage() {
  const { activeTab, setActiveTab, selectedProductIds } = useBarcodeStore()

  const { data: health, isLoading: healthLoading, refetch } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get('/healthz').then(r => r.data),
    refetchInterval: 30000,
  })

  const { data: templatesData } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get('/api/templates').then(r => r.data),
  })

  const { data: printJobsData } = useQuery({
    queryKey: ['print-jobs'],
    queryFn: () => api.get('/api/print-jobs', { params: { limit: 10 } }).then(r => r.data),
  })

  const templateCount = templatesData?.templates?.length || 0
  const recentPrintCount = printJobsData?.printJobs?.length || 0

  const getBadgeCount = (tabId: TabId): number | null => {
    switch (tabId) {
      case 'templates': return templateCount > 0 ? templateCount : null
      case 'products': return selectedProductIds.length > 0 ? selectedProductIds.length : null
      case 'history': return recentPrintCount > 0 ? recentPrintCount : null
      default: return null
    }
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left Sidebar */}
      <aside className="w-64 bg-muted/30 border-r flex flex-col fixed left-0 top-0 bottom-0">
        {/* Logo / Header */}
        <div className="p-4 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100">
              <Tags className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="font-semibold text-base">Barcode & Labels</h1>
              <p className="text-xs text-muted-foreground">Design & Print</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id
            const badgeCount = getBadgeCount(item.id)

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all
                  ${isActive 
                    ? 'bg-background shadow-sm border border-border' 
                    : 'hover:bg-background/60'
                  }
                `}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {item.label}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {item.description}
                  </div>
                </div>
                {badgeCount !== null && (
                  <Badge 
                    variant={item.id === 'products' && selectedProductIds.length > 0 ? 'default' : 'secondary'} 
                    className="h-5 px-1.5 text-xs"
                  >
                    {badgeCount}
                  </Badge>
                )}
                {isActive && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            )
          })}
        </nav>

        {/* Status Footer */}
        <div className="p-4 border-t space-y-3">
          {/* Connection Status */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Status</span>
            {healthLoading ? (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            ) : health?.success ? (
              <Badge variant="default" className="bg-green-500 text-xs h-5">Connected</Badge>
            ) : (
              <Badge variant="destructive" className="text-xs h-5">Disconnected</Badge>
            )}
          </div>

          {/* Quick Stats */}
          {selectedProductIds.length > 0 && (
            <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-lg">
              <Printer className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-primary">
                {selectedProductIds.length} products ready to print
              </span>
            </div>
          )}

          {/* Refresh Button */}
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full" 
            onClick={() => refetch()}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64">
        {/* Top Bar */}
        <header className="sticky top-0 z-10 bg-background border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">
                {NAV_ITEMS.find(n => n.id === activeTab)?.label}
              </h2>
              <p className="text-sm text-muted-foreground">
                {NAV_ITEMS.find(n => n.id === activeTab)?.description}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              {selectedProductIds.length > 0 && activeTab !== 'products' && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setActiveTab('products')}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Print {selectedProductIds.length} items
                </Button>
              )}
            </div>
          </div>
        </header>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'templates' && <TemplatesTab />}
          {activeTab === 'products' && <ProductsTab />}
          {activeTab === 'history' && <PrintHistoryTab />}
        </div>
      </main>
    </div>
  )
}
