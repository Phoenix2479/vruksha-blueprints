import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ShoppingCart, AlertTriangle, TrendingUp, Package, Clock,
  Download, Loader2, RefreshCw, Check, X, Settings, Plus
} from 'lucide-react'
import { reorderApi, forecastApi } from '@/lib/api'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import type { ReorderSuggestion, DemandForecast } from '@/types/inventory'

export default function ReorderManagement() {
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [urgencyFilter, setUrgencyFilter] = useState<string>('all')
  const [showSettings, setShowSettings] = useState(false)
  const [showForecast, setShowForecast] = useState<string | null>(null)

  const queryClient = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['reorder-suggestions', urgencyFilter],
    queryFn: () => reorderApi.getSuggestions({ urgency: urgencyFilter !== 'all' ? urgencyFilter : undefined }),
  })

  const suggestions: ReorderSuggestion[] = data?.suggestions || []
  const summary = data?.summary || { total_items: 0, total_cost: 0, critical: 0, high: 0 }

  const createPOMutation = useMutation({
    mutationFn: reorderApi.createPO,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reorder-suggestions'] })
      setSelectedItems([])
    },
  })

  const toggleSelect = (id: string) => {
    setSelectedItems(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const selectAll = () => {
    if (selectedItems.length === suggestions.length) {
      setSelectedItems([])
    } else {
      setSelectedItems(suggestions.map(s => s.product_id))
    }
  }

  const handleCreatePO = () => {
    const items = suggestions.filter(s => selectedItems.includes(s.product_id))
    createPOMutation.mutate({ items })
  }

  const urgencyCounts = {
    critical: suggestions.filter(s => s.urgency === 'critical').length,
    high: suggestions.filter(s => s.urgency === 'high').length,
    medium: suggestions.filter(s => s.urgency === 'medium').length,
    low: suggestions.filter(s => s.urgency === 'low').length,
  }

  const urgencyColors: Record<string, string> = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    high: 'bg-orange-100 text-orange-700 border-orange-200',
    medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    low: 'bg-green-100 text-green-700 border-green-200',
  }

  const selectedTotal = suggestions
    .filter(s => selectedItems.includes(s.product_id))
    .reduce((sum, s) => sum + s.total_cost, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Reorder Management</h2>
          <p className="text-sm text-gray-500">Smart reorder suggestions based on sales velocity</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <RefreshCw className="h-5 w-5 text-gray-500" />
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <Settings className="h-5 w-5 text-gray-500" />
          </button>
          <button className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50">
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard
          label="Items to Reorder"
          value={formatNumber(summary.total_items)}
          icon={<Package className="h-6 w-6 text-blue-500" />}
          color="blue"
        />
        <SummaryCard
          label="Est. Order Value"
          value={formatCurrency(summary.total_cost)}
          icon={<ShoppingCart className="h-6 w-6 text-green-500" />}
          color="green"
        />
        <SummaryCard
          label="Critical Items"
          value={formatNumber(urgencyCounts.critical)}
          icon={<AlertTriangle className="h-6 w-6 text-red-500" />}
          color="red"
          active={urgencyFilter === 'critical'}
          onClick={() => setUrgencyFilter(urgencyFilter === 'critical' ? 'all' : 'critical')}
        />
        <SummaryCard
          label="High Priority"
          value={formatNumber(urgencyCounts.high)}
          icon={<Clock className="h-6 w-6 text-orange-500" />}
          color="orange"
          active={urgencyFilter === 'high'}
          onClick={() => setUrgencyFilter(urgencyFilter === 'high' ? 'all' : 'high')}
        />
      </div>

      {/* Selection Actions */}
      {selectedItems.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-blue-800 font-medium">
              {selectedItems.length} items selected
            </span>
            <span className="text-blue-600">
              Total: {formatCurrency(selectedTotal)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedItems([])}
              className="px-3 py-1.5 text-sm border border-blue-300 rounded-lg hover:bg-blue-100"
            >
              Clear Selection
            </button>
            <button
              onClick={handleCreatePO}
              disabled={createPOMutation.isPending}
              className="px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {createPOMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <Plus className="h-4 w-4" />
              Create Purchase Order
            </button>
          </div>
        </div>
      )}

      {/* Suggestions Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {/* Toolbar */}
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedItems.length === suggestions.length && suggestions.length > 0}
              onChange={selectAll}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-600">Select all</span>
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Filter:</span>
            {['all', 'critical', 'high', 'medium', 'low'].map((urgency) => (
              <button
                key={urgency}
                onClick={() => setUrgencyFilter(urgency)}
                className={cn(
                  'px-3 py-1 text-sm rounded-lg capitalize',
                  urgencyFilter === urgency
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 hover:bg-gray-200'
                )}
              >
                {urgency === 'all' ? 'All' : urgency}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : suggestions.length === 0 ? (
          <div className="p-8 text-center">
            <Check className="h-12 w-12 mx-auto mb-3 text-green-400" />
            <p className="text-gray-500">All caught up!</p>
            <p className="text-sm text-gray-400">No reorder suggestions at this time</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 w-10"></th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Current</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Reorder Lvl</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Suggested Qty</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Unit Cost</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Days of Stock</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Urgency</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Forecast</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {suggestions.map((item) => (
                <tr
                  key={item.product_id}
                  className={cn(
                    'hover:bg-gray-50',
                    selectedItems.includes(item.product_id) && 'bg-blue-50'
                  )}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedItems.includes(item.product_id)}
                      onChange={() => toggleSelect(item.product_id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium">{item.product_name}</p>
                      <p className="text-sm text-gray-500">{item.sku}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={item.current_stock <= item.reorder_level ? 'text-red-600 font-medium' : ''}>
                      {formatNumber(item.current_stock)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {formatNumber(item.reorder_level)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-blue-600">
                    {formatNumber(item.suggested_quantity)}
                  </td>
                  <td className="px-4 py-3 text-right">{formatCurrency(item.unit_cost)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(item.total_cost)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn(
                      'font-medium',
                      item.days_of_stock <= 3 ? 'text-red-600' :
                      item.days_of_stock <= 7 ? 'text-orange-600' :
                      item.days_of_stock <= 14 ? 'text-yellow-600' : 'text-green-600'
                    )}>
                      {item.days_of_stock} days
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn(
                      'px-2 py-1 text-xs font-medium rounded-full capitalize',
                      urgencyColors[item.urgency]
                    )}>
                      {item.urgency}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => setShowForecast(item.product_id)}
                      className="p-1.5 hover:bg-gray-100 rounded-lg"
                      title="View Forecast"
                    >
                      <TrendingUp className="h-4 w-4 text-gray-500" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Forecast Modal */}
      {showForecast && (
        <ForecastModal
          productId={showForecast}
          productName={suggestions.find(s => s.product_id === showForecast)?.product_name || ''}
          onClose={() => setShowForecast(null)}
        />
      )}

      {/* Settings Modal */}
      {showSettings && (
        <ReorderSettingsModal onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  icon,
  color,
  active,
  onClick,
}: {
  label: string
  value: string
  icon: React.ReactNode
  color: 'blue' | 'green' | 'red' | 'orange'
  active?: boolean
  onClick?: () => void
}) {
  const bgColors = {
    blue: 'bg-blue-50 border-blue-100',
    green: 'bg-green-50 border-green-100',
    red: 'bg-red-50 border-red-100',
    orange: 'bg-orange-50 border-orange-100',
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl border p-5 transition-all',
        bgColors[color],
        onClick && 'cursor-pointer hover:shadow-md',
        active && 'ring-2 ring-blue-500'
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        {icon}
      </div>
    </div>
  )
}

function ForecastModal({
  productId,
  productName,
  onClose,
}: {
  productId: string
  productName: string
  onClose: () => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['forecast', productId],
    queryFn: () => forecastApi.getDemand(productId, { periods: 4 }),
  })

  const forecast: DemandForecast | null = data || null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg m-4">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Demand Forecast</h2>
            <p className="text-sm text-gray-500">{productName}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6">
          {isLoading ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : forecast ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">Current Stock</p>
                  <p className="text-xl font-bold">{formatNumber(forecast.current_stock)}</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">Avg Daily Demand</p>
                  <p className="text-xl font-bold">{forecast.avg_daily_demand.toFixed(1)}</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">Stockout Risk</p>
                  <p className={cn(
                    'text-xl font-bold capitalize',
                    forecast.stockout_risk === 'high' ? 'text-red-600' :
                    forecast.stockout_risk === 'medium' ? 'text-orange-600' : 'text-green-600'
                  )}>
                    {forecast.stockout_risk}
                  </p>
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-3">Forecast by Period</h3>
                <div className="space-y-2">
                  {forecast.forecast_periods.map((period) => (
                    <div key={period.period} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium">{period.period}</p>
                        <p className="text-xs text-gray-500">
                          {period.start_date} - {period.end_date}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{formatNumber(period.forecasted_demand)}</p>
                        <p className="text-xs text-gray-500">
                          Range: {formatNumber(period.confidence_low)} - {formatNumber(period.confidence_high)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Recommended Order:</strong> {formatNumber(forecast.recommended_order_quantity)} units
                </p>
              </div>
            </div>
          ) : (
            <p className="text-center text-gray-500 py-8">No forecast data available</p>
          )}
        </div>
        <div className="px-6 py-4 border-t">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function ReorderSettingsModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()

  const { data: settings } = useQuery({
    queryKey: ['reorder-settings'],
    queryFn: reorderApi.getSettings,
  })

  const [formData, setFormData] = useState({
    default_lead_time: settings?.default_lead_time || 7,
    safety_stock_days: settings?.safety_stock_days || 14,
    auto_suggest: settings?.auto_suggest ?? true,
    include_forecast: settings?.include_forecast ?? true,
  })

  const updateMutation = useMutation({
    mutationFn: reorderApi.updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reorder-settings'] })
      queryClient.invalidateQueries({ queryKey: ['reorder-suggestions'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md m-4">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Reorder Settings</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default Lead Time (days)
            </label>
            <input
              type="number"
              min="1"
              value={formData.default_lead_time}
              onChange={(e) => setFormData({ ...formData, default_lead_time: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Safety Stock Buffer (days)
            </label>
            <input
              type="number"
              min="0"
              value={formData.safety_stock_days}
              onChange={(e) => setFormData({ ...formData, safety_stock_days: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-3 pt-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.auto_suggest}
                onChange={(e) => setFormData({ ...formData, auto_suggest: e.target.checked })}
                className="rounded border-gray-300"
              />
              <span className="text-sm">Auto-generate reorder suggestions</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.include_forecast}
                onChange={(e) => setFormData({ ...formData, include_forecast: e.target.checked })}
                className="rounded border-gray-300"
              />
              <span className="text-sm">Include demand forecast in calculations</span>
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
