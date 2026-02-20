import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, Bell, BellOff, ShoppingCart, Filter, RefreshCw,
  ChevronDown, ChevronUp, Settings, X, Check, Loader2, Package
} from 'lucide-react'
import { alertsApi } from '@/lib/api'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import type { LowStockAlert } from '@/types/inventory'

interface LowStockAlertsProps {
  onCreatePO?: (items: LowStockAlert[]) => void
}

export default function LowStockAlerts({ onCreatePO }: LowStockAlertsProps) {
  const [selectedAlerts, setSelectedAlerts] = useState<string[]>([])
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [showSettings, setShowSettings] = useState(false)
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null)

  const queryClient = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['low-stock-alerts', priorityFilter],
    queryFn: () => alertsApi.getLowStock({ 
      threshold: priorityFilter !== 'all' ? undefined : undefined 
    }),
  })

  const alerts: LowStockAlert[] = data?.alerts || []
  const summary = data?.summary || { critical: 0, high: 0, medium: 0, low: 0, total: 0, total_value: 0 }

  const dismissMutation = useMutation({
    mutationFn: alertsApi.dismissAlert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['low-stock-alerts'] })
    },
  })

  const filteredAlerts = priorityFilter === 'all' 
    ? alerts 
    : alerts.filter(a => a.priority === priorityFilter)

  const toggleSelect = (id: string) => {
    setSelectedAlerts(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const selectAll = () => {
    if (selectedAlerts.length === filteredAlerts.length) {
      setSelectedAlerts([])
    } else {
      setSelectedAlerts(filteredAlerts.map(a => a.id))
    }
  }

  const handleCreatePO = () => {
    const selected = alerts.filter(a => selectedAlerts.includes(a.id))
    onCreatePO?.(selected)
  }

  const priorityColors = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    high: 'bg-orange-100 text-orange-700 border-orange-200',
    medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    low: 'bg-blue-100 text-blue-700 border-blue-200',
  }

  const priorityBadge = {
    critical: 'bg-red-500',
    high: 'bg-orange-500',
    medium: 'bg-yellow-500',
    low: 'bg-blue-500',
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard
          label="Critical"
          count={summary.critical}
          color="red"
          active={priorityFilter === 'critical'}
          onClick={() => setPriorityFilter(priorityFilter === 'critical' ? 'all' : 'critical')}
        />
        <SummaryCard
          label="High"
          count={summary.high}
          color="orange"
          active={priorityFilter === 'high'}
          onClick={() => setPriorityFilter(priorityFilter === 'high' ? 'all' : 'high')}
        />
        <SummaryCard
          label="Medium"
          count={summary.medium}
          color="yellow"
          active={priorityFilter === 'medium'}
          onClick={() => setPriorityFilter(priorityFilter === 'medium' ? 'all' : 'medium')}
        />
        <SummaryCard
          label="Low"
          count={summary.low}
          color="blue"
          active={priorityFilter === 'low'}
          onClick={() => setPriorityFilter(priorityFilter === 'low' ? 'all' : 'low')}
        />
        <SummaryCard
          label="Total Value at Risk"
          count={formatCurrency(summary.total_value)}
          color="gray"
          isValue
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 bg-white rounded-lg border p-3">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedAlerts.length === filteredAlerts.length && filteredAlerts.length > 0}
              onChange={selectAll}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-600">
              {selectedAlerts.length > 0 ? `${selectedAlerts.length} selected` : 'Select all'}
            </span>
          </label>
        </div>
        <div className="flex items-center gap-2">
          {selectedAlerts.length > 0 && (
            <button
              onClick={handleCreatePO}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
            >
              <ShoppingCart className="h-4 w-4" />
              Create PO
            </button>
          )}
          <button
            onClick={() => refetch()}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4 text-gray-500" />
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title="Alert Settings"
          >
            <Settings className="h-4 w-4 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Alerts List */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="p-8 text-center">
            <Bell className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500">No low stock alerts</p>
            <p className="text-sm text-gray-400 mt-1">All products are well stocked!</p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredAlerts.map((alert) => (
              <div
                key={alert.id}
                className={cn(
                  'transition-colors',
                  selectedAlerts.includes(alert.id) && 'bg-blue-50'
                )}
              >
                <div className="flex items-center gap-4 p-4">
                  <input
                    type="checkbox"
                    checked={selectedAlerts.includes(alert.id)}
                    onChange={() => toggleSelect(alert.id)}
                    className="rounded border-gray-300"
                  />
                  
                  <div className={cn(
                    'w-2 h-12 rounded-full',
                    priorityBadge[alert.priority]
                  )} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-gray-900 truncate">{alert.product_name}</h4>
                      <span className={cn(
                        'px-2 py-0.5 text-xs font-medium rounded-full capitalize',
                        priorityColors[alert.priority]
                      )}>
                        {alert.priority}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">SKU: {alert.sku}</p>
                  </div>

                  <div className="text-right">
                    <p className="font-medium text-gray-900">{formatNumber(alert.current_stock)} in stock</p>
                    <p className="text-sm text-red-600">
                      {alert.shortage > 0 ? `${formatNumber(alert.shortage)} below reorder level` : 'At reorder level'}
                    </p>
                  </div>

                  <div className="text-right hidden md:block">
                    <p className="text-sm text-gray-500">Days of Stock</p>
                    <p className={cn(
                      'font-medium',
                      alert.days_of_stock <= 3 ? 'text-red-600' :
                      alert.days_of_stock <= 7 ? 'text-orange-600' : 'text-gray-900'
                    )}>
                      {alert.days_of_stock} days
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => dismissMutation.mutate(alert.id)}
                      className="p-2 hover:bg-gray-100 rounded-lg"
                      title="Dismiss"
                    >
                      <BellOff className="h-4 w-4 text-gray-400" />
                    </button>
                    <button
                      onClick={() => setExpandedAlert(expandedAlert === alert.id ? null : alert.id)}
                      className="p-2 hover:bg-gray-100 rounded-lg"
                    >
                      {expandedAlert === alert.id ? (
                        <ChevronUp className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedAlert === alert.id && (
                  <div className="px-4 pb-4 pt-0 ml-14 bg-gray-50 border-t">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-3">
                      <div>
                        <p className="text-xs text-gray-500">Reorder Level</p>
                        <p className="font-medium">{formatNumber(alert.reorder_level)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Reorder Quantity</p>
                        <p className="font-medium">{formatNumber(alert.reorder_quantity)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Last Sale</p>
                        <p className="font-medium">{alert.last_sale_date || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Alert Status</p>
                        <p className="font-medium capitalize">{alert.status}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
                        Create Purchase Order
                      </button>
                      <button className="px-3 py-1.5 border rounded text-sm hover:bg-gray-100">
                        View Product
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <AlertSettingsModal onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}

function SummaryCard({ 
  label, 
  count, 
  color, 
  active, 
  onClick,
  isValue 
}: { 
  label: string
  count: number | string
  color: 'red' | 'orange' | 'yellow' | 'blue' | 'gray'
  active?: boolean
  onClick?: () => void
  isValue?: boolean
}) {
  const colors = {
    red: 'border-red-200 bg-red-50',
    orange: 'border-orange-200 bg-orange-50',
    yellow: 'border-yellow-200 bg-yellow-50',
    blue: 'border-blue-200 bg-blue-50',
    gray: 'border-gray-200 bg-gray-50',
  }

  const textColors = {
    red: 'text-red-700',
    orange: 'text-orange-700',
    yellow: 'text-yellow-700',
    blue: 'text-blue-700',
    gray: 'text-gray-700',
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-lg border p-3 transition-all',
        colors[color],
        onClick && 'cursor-pointer hover:shadow-md',
        active && 'ring-2 ring-blue-500'
      )}
    >
      <p className="text-xs text-gray-500 uppercase">{label}</p>
      <p className={cn('text-xl font-bold', textColors[color])}>
        {isValue ? count : formatNumber(count as number)}
      </p>
    </div>
  )
}

function AlertSettingsModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  
  const { data: settings, isLoading } = useQuery({
    queryKey: ['alert-settings'],
    queryFn: alertsApi.getAlertSettings,
  })

  const [formData, setFormData] = useState({
    default_threshold: settings?.default_threshold || 10,
    critical_days: settings?.critical_days || 3,
    high_days: settings?.high_days || 7,
    medium_days: settings?.medium_days || 14,
    email_notifications: settings?.email_notifications ?? true,
    auto_create_po: settings?.auto_create_po ?? false,
  })

  const updateMutation = useMutation({
    mutationFn: alertsApi.updateAlertSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-settings'] })
      queryClient.invalidateQueries({ queryKey: ['low-stock-alerts'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md m-4">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Alert Settings</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default Reorder Threshold
            </label>
            <input
              type="number"
              min="1"
              value={formData.default_threshold}
              onChange={(e) => setFormData({ ...formData, default_threshold: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Critical (days)</label>
              <input
                type="number"
                min="1"
                value={formData.critical_days}
                onChange={(e) => setFormData({ ...formData, critical_days: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">High (days)</label>
              <input
                type="number"
                min="1"
                value={formData.high_days}
                onChange={(e) => setFormData({ ...formData, high_days: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Medium (days)</label>
              <input
                type="number"
                min="1"
                value={formData.medium_days}
                onChange={(e) => setFormData({ ...formData, medium_days: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.email_notifications}
                onChange={(e) => setFormData({ ...formData, email_notifications: e.target.checked })}
                className="rounded border-gray-300"
              />
              <span className="text-sm">Email notifications for critical alerts</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.auto_create_po}
                onChange={(e) => setFormData({ ...formData, auto_create_po: e.target.checked })}
                className="rounded border-gray-300"
              />
              <span className="text-sm">Auto-create PO for critical items</span>
            </label>
          </div>
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => updateMutation.mutate(formData)}
            disabled={updateMutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}
