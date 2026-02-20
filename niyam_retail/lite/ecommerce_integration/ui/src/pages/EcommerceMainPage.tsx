import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useEcommerceStore } from '@/store/ecommerceStore'
import type { Channel, SyncJob, TabId } from '@/types/ecommerce'

// Shared components
import { Button, Badge } from '@/components/ui'
import { 
  PageHeader, 
  Sidebar, 
  ThemeToggle,
  type SidebarGroup 
} from '@/components/blocks'

// Icons
import { 
  ShoppingCart, 
  RefreshCw, 
  Loader2, 
  LayoutDashboard,
  Store,
  History,
  Zap,
  Link2,
  Settings,
  CheckCircle,
  XCircle,
} from 'lucide-react'

// Tab components
import OverviewTab from '@/components/tabs/OverviewTab'
import ChannelsTab from '@/components/tabs/ChannelsTab'
import SyncHistoryTab from '@/components/tabs/SyncHistoryTab'
import ActionsTab from '@/components/tabs/ActionsTab'

// No mock data - using real API

// Sidebar configuration
const sidebarGroups: SidebarGroup[] = [
  {
    label: 'Dashboard',
    items: [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Marketplaces',
    items: [
      { id: 'channels', label: 'Channels', icon: Store },
      { id: 'connections', label: 'API Connections', icon: Link2 },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'sync', label: 'Sync History', icon: History },
      { id: 'actions', label: 'Quick Actions', icon: Zap },
    ],
  },
  {
    label: 'Settings',
    items: [
      { id: 'settings', label: 'Configuration', icon: Settings },
    ],
  },
]

const tabConfig: Record<TabId | 'connections' | 'settings', { 
  label: string
  description: string
  icon: typeof ShoppingCart 
}> = {
  overview: {
    label: 'Overview',
    description: 'Dashboard and marketplace statistics',
    icon: LayoutDashboard,
  },
  channels: {
    label: 'Channels',
    description: 'Manage your marketplace connections',
    icon: Store,
  },
  connections: {
    label: 'API Connections',
    description: 'Configure OAuth and API integrations',
    icon: Link2,
  },
  sync: {
    label: 'Sync History',
    description: 'View synchronization logs and status',
    icon: History,
  },
  actions: {
    label: 'Quick Actions',
    description: 'Common operations and bulk actions',
    icon: Zap,
  },
  settings: {
    label: 'Configuration',
    description: 'E-commerce integration settings',
    icon: Settings,
  },
}

export default function EcommerceMainPage() {
  const { 
    activeTab, 
    setActiveTab,
    sidebarCollapsed,
    setSidebarCollapsed,
  } = useEcommerceStore()

  const { data: health, isLoading: healthLoading, refetch } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get('/healthz').then(r => r.data),
    refetchInterval: 30000,
  })

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.get('/stats').then(r => r.data),
  })

  const { data: channels = [] } = useQuery({
    queryKey: ['channels'],
    queryFn: () => api.get('/channels').then(r => r.data?.data?.channels || []),
  })

  const { data: recentSyncs = [] } = useQuery({
    queryKey: ['sync-jobs'],
    queryFn: () => api.get('/sync/jobs').then(r => r.data?.data?.jobs || []),
  })

  // Current tab config
  const currentTab = tabConfig[activeTab as keyof typeof tabConfig] || tabConfig.overview
  const TabIcon = currentTab.icon

  // Render content based on active tab
  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <OverviewTab 
            stats={stats} 
            channels={channels} 
            recentSyncs={recentSyncs} 
          />
        )
      case 'channels':
        return <ChannelsTab channels={channels} />
      case 'connections':
        return <ConnectionsContent />
      case 'sync':
        return <SyncHistoryTab syncs={recentSyncs} />
      case 'actions':
        return <ActionsTab />
      case 'settings':
        return <SettingsContent />
      default:
        return (
          <OverviewTab 
            stats={stats} 
            channels={channels} 
            recentSyncs={recentSyncs} 
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
            <div className="p-1.5 bg-pink-100 dark:bg-pink-900/30 rounded-lg">
              <ShoppingCart className="h-5 w-5 text-pink-600 dark:text-pink-400" />
            </div>
            <span className="font-semibold text-foreground">E-commerce</span>
          </div>
        }
        footer={
          <div className="flex items-center gap-2 text-sm">
            {healthLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : health?.status === 'ok' ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500" />
            )}
            <span className="text-muted-foreground">
              {healthLoading ? 'Checking...' : health?.status === 'ok' ? 'Connected' : 'Disconnected'}
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
          iconColor="text-pink-600 dark:text-pink-400"
          iconBg="bg-pink-100 dark:bg-pink-900/30"
          sticky
          badge={
            healthLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : health?.status === 'ok' ? (
              <Badge variant="default" className="bg-green-500">Connected</Badge>
            ) : (
              <Badge variant="destructive">Disconnected</Badge>
            )
          }
          actions={
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button variant="ghost" size="icon" onClick={() => refetch()}>
                <RefreshCw className="h-5 w-5" />
              </Button>
            </div>
          }
        />

        <main className="flex-1 p-6 overflow-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  )
}

// API Connections Content
function ConnectionsContent() {
  const { data: oauthStatus } = useQuery({
    queryKey: ['oauth-status'],
    queryFn: () => api.get('/oauth/status').then(r => r.data),
  })

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Shopify */}
        <div className="bg-card border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <Store className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h3 className="font-semibold">Shopify</h3>
              <p className="text-sm text-muted-foreground">Connect your Shopify store</p>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              OAuth 2.0 integration for product, order, and inventory sync.
            </p>
            <Badge variant={oauthStatus?.data?.platforms?.shopify?.oauth_available ? 'default' : 'secondary'}>
              {oauthStatus?.data?.platforms?.shopify?.oauth_available ? 'Configured' : 'Not Configured'}
            </Badge>
            <Button className="w-full" variant="outline">
              <Link2 className="h-4 w-4 mr-2" />
              Connect Shopify
            </Button>
          </div>
        </div>

        {/* WooCommerce */}
        <div className="bg-card border rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Store className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="font-semibold">WooCommerce</h3>
              <p className="text-sm text-muted-foreground">Connect your WooCommerce store</p>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              REST API integration for WordPress-based stores.
            </p>
            <Badge variant={oauthStatus?.data?.platforms?.woocommerce?.oauth_available ? 'default' : 'secondary'}>
              {oauthStatus?.data?.platforms?.woocommerce?.oauth_available ? 'Configured' : 'Not Configured'}
            </Badge>
            <Button className="w-full" variant="outline">
              <Link2 className="h-4 w-4 mr-2" />
              Connect WooCommerce
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-muted/50 border rounded-lg p-4">
        <h4 className="font-medium mb-2">API Configuration</h4>
        <p className="text-sm text-muted-foreground">
          To enable OAuth connections, configure the following environment variables:
        </p>
        <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
          <li>SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET</li>
          <li>WOOCOMMERCE_CONSUMER_KEY and WOOCOMMERCE_CONSUMER_SECRET</li>
        </ul>
      </div>
    </div>
  )
}

// Settings Content
function SettingsContent() {
  return (
    <div className="space-y-6">
      <div className="bg-card border rounded-lg p-6">
        <h3 className="font-semibold mb-4">Sync Settings</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Auto-sync Products</p>
              <p className="text-sm text-muted-foreground">Automatically sync products every hour</p>
            </div>
            <Badge variant="secondary">Coming Soon</Badge>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Auto-sync Orders</p>
              <p className="text-sm text-muted-foreground">Automatically import new orders</p>
            </div>
            <Badge variant="secondary">Coming Soon</Badge>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Inventory Sync</p>
              <p className="text-sm text-muted-foreground">Keep inventory levels in sync</p>
            </div>
            <Badge variant="secondary">Coming Soon</Badge>
          </div>
        </div>
      </div>

      <div className="bg-card border rounded-lg p-6">
        <h3 className="font-semibold mb-4">Webhook Settings</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Configure webhooks to receive real-time updates from marketplaces.
        </p>
        <div className="bg-muted rounded p-3 font-mono text-sm">
          POST /webhooks/shopify
          <br />
          POST /webhooks/woocommerce
        </div>
      </div>
    </div>
  )
}
