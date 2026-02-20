import axios from 'axios'
import type { Product, StockAdjustment, StockHistoryEntry } from '@/types/inventory'

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Products API
export const productsApi = {
  list: async (params?: { search?: string; category_id?: string; low_stock?: boolean }) => {
    const res = await api.get<{ success: boolean; products: Product[] }>('/products', { params })
    return res.data.products || []
  },

  get: async (id: string) => {
    const res = await api.get<{ success: boolean; product: Product }>(`/products/${id}`)
    return res.data.product
  },

  create: async (data: Partial<Product>) => {
    const res = await api.post<{ success: boolean; product: Product }>('/products', data)
    return res.data.product
  },

  update: async (id: string, data: Partial<Product>) => {
    const res = await api.patch<{ success: boolean; product: Product }>(`/products/${id}`, data)
    return res.data.product
  },

  delete: async (id: string) => {
    await api.delete(`/products/${id}`)
  },

  getVariants: async (productId: string) => {
    const res = await api.get(`/products/${productId}/variants`)
    return res.data.variants || []
  },

  createVariant: async (productId: string, data: any) => {
    const res = await api.post(`/products/${productId}/variants`, data)
    return res.data.variant
  },

  getSerials: async (productId: string) => {
    const res = await api.get(`/products/${productId}/serials`)
    return res.data.serials || []
  },

  addSerial: async (productId: string, data: any) => {
    const res = await api.post(`/products/${productId}/serials`, data)
    return res.data.serial
  },

  getBatches: async (productId: string) => {
    const res = await api.get(`/products/${productId}/batches`)
    return res.data.batches || []
  },

  addBatch: async (productId: string, data: any) => {
    const res = await api.post(`/products/${productId}/batches`, data)
    return res.data.batch
  },
}

// Stock API
export const stockApi = {
  getStock: async (productId: string) => {
    const res = await api.get(`/stock/${productId}`)
    return res.data
  },

  adjust: async (data: {
    product_id: string
    quantity_change: number
    reason: string
    notes?: string
  }) => {
    const res = await api.post<{ success: boolean; adjustment: StockAdjustment }>('/stock/adjust', data)
    return res.data.adjustment
  },

  getHistory: async (productId: string) => {
    const res = await api.get<{ success: boolean; history: StockHistoryEntry[] }>(`/stock/${productId}/history`)
    return res.data.history || []
  },
}

// Alerts API
export const alertsApi = {
  getLowStock: async (params?: { threshold?: number; category_id?: string }) => {
    const res = await api.get('/alerts/low-stock', { params })
    return res.data
  },

  getAlertSettings: async () => {
    const res = await api.get('/alerts/low-stock/settings')
    return res.data.settings
  },

  updateAlertSettings: async (data: any) => {
    const res = await api.put('/alerts/low-stock/settings', data)
    return res.data.settings
  },

  dismissAlert: async (alertId: string) => {
    const res = await api.post(`/alerts/low-stock/${alertId}/dismiss`)
    return res.data
  },
}

// Stock Counts API
export const stockCountsApi = {
  list: async (params?: { status?: string }) => {
    const res = await api.get('/stock-counts', { params })
    return res.data.counts || []
  },

  get: async (id: string) => {
    const res = await api.get(`/stock-counts/${id}`)
    return res.data.count
  },

  create: async (data: any) => {
    const res = await api.post('/stock-counts', data)
    return res.data.count
  },

  addItem: async (countId: string, data: any) => {
    const res = await api.post(`/stock-counts/${countId}/items`, data)
    return res.data.item
  },

  complete: async (countId: string) => {
    const res = await api.post(`/stock-counts/${countId}/complete`)
    return res.data
  },

  getVariances: async (countId: string) => {
    const res = await api.get(`/stock-counts/${countId}/variances`)
    return res.data.variances || []
  },
}

// Receiving (GRN) API
export const receivingApi = {
  list: async (params?: { status?: string; supplier_id?: string }) => {
    const res = await api.get('/receiving', { params })
    return res.data.receipts || []
  },

  get: async (id: string) => {
    const res = await api.get(`/receiving/${id}`)
    return res.data.receipt
  },

  create: async (data: any) => {
    const res = await api.post('/receiving', data)
    return res.data.receipt
  },

  addItem: async (receiptId: string, data: any) => {
    const res = await api.post(`/receiving/${receiptId}/items`, data)
    return res.data.item
  },

  complete: async (receiptId: string, data?: any) => {
    const res = await api.post(`/receiving/${receiptId}/complete`, data)
    return res.data
  },
}

// Transfers API
export const transfersApi = {
  list: async (params?: { status?: string; from_location?: string; to_location?: string }) => {
    const res = await api.get('/transfers', { params })
    return res.data.transfers || []
  },

  get: async (id: string) => {
    const res = await api.get(`/transfers/${id}`)
    return res.data.transfer
  },

  create: async (data: any) => {
    const res = await api.post('/transfers', data)
    return res.data.transfer
  },

  addItem: async (transferId: string, data: any) => {
    const res = await api.post(`/transfers/${transferId}/items`, data)
    return res.data.item
  },

  ship: async (transferId: string) => {
    const res = await api.post(`/transfers/${transferId}/ship`)
    return res.data
  },

  receive: async (transferId: string, data?: any) => {
    const res = await api.post(`/transfers/${transferId}/receive`, data)
    return res.data
  },
}

// Locations API
export const locationsApi = {
  list: async (params?: { type?: string; warehouse_id?: string }) => {
    const res = await api.get('/locations', { params })
    return res.data.locations || []
  },

  get: async (id: string) => {
    const res = await api.get(`/locations/${id}`)
    return res.data.location
  },

  create: async (data: any) => {
    const res = await api.post('/locations', data)
    return res.data.location
  },

  update: async (id: string, data: any) => {
    const res = await api.put(`/locations/${id}`, data)
    return res.data.location
  },

  delete: async (id: string) => {
    await api.delete(`/locations/${id}`)
  },

  getInventory: async (locationId: string) => {
    const res = await api.get(`/locations/${locationId}/inventory`)
    return res.data.inventory || []
  },
}

// Valuation API
export const valuationApi = {
  getSummary: async (params?: { method?: string; as_of_date?: string }) => {
    const res = await api.get('/valuation', { params })
    return res.data
  },

  getByCategory: async (params?: { method?: string }) => {
    const res = await api.get('/valuation/by-category', { params })
    return res.data.categories || []
  },

  getByLocation: async (params?: { method?: string }) => {
    const res = await api.get('/valuation/by-location', { params })
    return res.data.locations || []
  },

  getHistory: async (params?: { period?: string }) => {
    const res = await api.get('/valuation/history', { params })
    return res.data.history || []
  },
}

// Analysis API
export const analysisApi = {
  getABC: async (params?: { period?: string; criteria?: string }) => {
    const res = await api.get('/analysis/abc', { params })
    return res.data
  },

  getDeadStock: async (params?: { days_threshold?: number }) => {
    const res = await api.get('/analysis/dead-stock', { params })
    return res.data
  },

  getAging: async (params?: { brackets?: string }) => {
    const res = await api.get('/analysis/aging', { params })
    return res.data
  },

  getTurnover: async (params?: { period?: string }) => {
    const res = await api.get('/analysis/turnover', { params })
    return res.data
  },
}

// Forecast API
export const forecastApi = {
  getDemand: async (productId: string, params?: { periods?: number; method?: string }) => {
    const res = await api.get(`/forecast/${productId}`, { params })
    return res.data
  },

  getBulkForecast: async (params?: { category_id?: string; periods?: number }) => {
    const res = await api.get('/forecast', { params })
    return res.data.forecasts || []
  },
}

// Reorder API
export const reorderApi = {
  getSuggestions: async (params?: { category_id?: string; urgency?: string }) => {
    const res = await api.get('/reorder/suggestions', { params })
    return res.data
  },

  createPO: async (data: any) => {
    const res = await api.post('/reorder/create-po', data)
    return res.data
  },

  getSettings: async () => {
    const res = await api.get('/reorder/settings')
    return res.data.settings
  },

  updateSettings: async (data: any) => {
    const res = await api.put('/reorder/settings', data)
    return res.data.settings
  },
}

// Write-offs API
export const writeoffsApi = {
  list: async (params?: { status?: string; reason?: string }) => {
    const res = await api.get('/write-offs', { params })
    return res.data.writeoffs || []
  },

  get: async (id: string) => {
    const res = await api.get(`/write-offs/${id}`)
    return res.data.writeoff
  },

  create: async (data: any) => {
    const res = await api.post('/write-offs', data)
    return res.data.writeoff
  },

  approve: async (id: string, data?: any) => {
    const res = await api.post(`/write-offs/${id}/approve`, data)
    return res.data
  },

  reject: async (id: string, data?: any) => {
    const res = await api.post(`/write-offs/${id}/reject`, data)
    return res.data
  },
}

// Bundles API
export const bundlesApi = {
  list: async () => {
    const res = await api.get('/bundles')
    return res.data.bundles || []
  },

  get: async (id: string) => {
    const res = await api.get(`/bundles/${id}`)
    return res.data.bundle
  },

  create: async (data: any) => {
    const res = await api.post('/bundles', data)
    return res.data.bundle
  },

  update: async (id: string, data: any) => {
    const res = await api.put(`/bundles/${id}`, data)
    return res.data.bundle
  },

  checkAvailability: async (bundleId: string) => {
    const res = await api.get(`/bundles/${bundleId}/availability`)
    return res.data
  },
}

// Health API
export const healthApi = {
  status: async () => {
    const res = await api.get('/status')
    return res.data
  },

  stats: async () => {
    const res = await api.get('/stats')
    return res.data
  },
}

// Import API
export const importApi = {
  createSession: async () => {
    const res = await api.post<{ success: boolean; session_id: string }>('/inventory/import/sessions')
    return res.data
  },

  uploadFiles: async (sessionId: string, files: File[]) => {
    const formData = new FormData()
    files.forEach(file => formData.append('files', file))
    
    const res = await api.post(`/inventory/import/${sessionId}/files`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data
  },

  getPreview: async (sessionId: string) => {
    const res = await api.get(`/inventory/import/${sessionId}/preview`)
    return res.data
  },

  commitImport: async (sessionId: string, config: {
    strategy?: 'create' | 'upsert'
    rows?: any[]
    auto_sku?: {
      enabled: boolean
      prefix: string
      separator: string
      digits: number
      includeCategory: boolean
      startNumber: number
    }
    auto_barcode?: {
      enabled: boolean
      format: string
      prefix: string
      startNumber: number
    }
  }) => {
    const res = await api.post(`/inventory/import/${sessionId}/commit`, config)
    return res.data
  },

  downloadTemplate: async () => {
    const res = await api.get('/inventory/import/template', { responseType: 'blob' })
    return res.data
  },
}
