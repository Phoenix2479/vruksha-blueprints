export interface Channel {
  id: string
  name: string
  platform: string
  status: 'active' | 'inactive' | 'error'
  lastSync: string
  products: number
  orders: number
}

export interface SyncJob {
  id: string
  type: 'products' | 'orders' | 'inventory'
  status: 'pending' | 'running' | 'completed' | 'failed'
  startedAt: string
  completedAt?: string
  itemsProcessed: number
  itemsTotal: number
  errors: number
}

export interface EcommerceStats {
  activeChannels: number
  totalProducts: number
  pendingOrders: number
  lastSync: string | null
}

export type TabId = 'overview' | 'channels' | 'connections' | 'sync' | 'actions' | 'settings'
