import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Archive, AlertTriangle, Tag, Trash2, Package, RotateCcw,
  Download, Loader2, RefreshCw, DollarSign, Calendar
} from 'lucide-react'
import {
  BarList,
  DonutChart,
  ProgressCircle,
  Card,
  Metric,
  Text,
  Flex,
  BadgeDelta,
} from '@tremor/react'
import { analysisApi } from '@/lib/api'
import { formatCurrency, formatNumber, formatDate, cn } from '@/lib/utils'
import type { DeadStockItem } from '@/types/inventory'

export default function DeadStockAnalysis() {
  const [daysThreshold, setDaysThreshold] = useState<number>(90)
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [actionFilter, setActionFilter] = useState<string>('all')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dead-stock', daysThreshold],
    queryFn: () => analysisApi.getDeadStock({ days_threshold: daysThreshold }),
  })

  const deadStock: DeadStockItem[] = data?.items || []
  const summary = data?.summary || { total_items: 0, total_value: 0, avg_days: 0 }

  const filteredItems = actionFilter === 'all'
    ? deadStock
    : deadStock.filter(i => i.recommended_action === actionFilter)

  const toggleSelect = (id: string) => {
    setSelectedItems(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const selectAll = () => {
    if (selectedItems.length === filteredItems.length) {
      setSelectedItems([])
    } else {
      setSelectedItems(filteredItems.map(i => i.product_id))
    }
  }

  const actionCounts = {
    discount: deadStock.filter(i => i.recommended_action === 'discount').length,
    bundle: deadStock.filter(i => i.recommended_action === 'bundle').length,
    return_to_vendor: deadStock.filter(i => i.recommended_action === 'return_to_vendor').length,
    write_off: deadStock.filter(i => i.recommended_action === 'write_off').length,
  }

  const actionLabels: Record<string, string> = {
    discount: 'Discount',
    bundle: 'Bundle',
    return_to_vendor: 'Return to Vendor',
    write_off: 'Write Off',
  }

  const actionColors: Record<string, string> = {
    discount: 'bg-yellow-100 text-yellow-700',
    bundle: 'bg-blue-100 text-blue-700',
    return_to_vendor: 'bg-purple-100 text-purple-700',
    write_off: 'bg-red-100 text-red-700',
  }

  const actionIcons: Record<string, React.ReactNode> = {
    discount: <Tag className="h-4 w-4" />,
    bundle: <Package className="h-4 w-4" />,
    return_to_vendor: <RotateCcw className="h-4 w-4" />,
    write_off: <Trash2 className="h-4 w-4" />,
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">No sales for:</label>
            <select
              value={daysThreshold}
              onChange={(e) => setDaysThreshold(parseInt(e.target.value))}
              className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value={30}>30+ days</option>
              <option value={60}>60+ days</option>
              <option value={90}>90+ days</option>
              <option value={180}>180+ days</option>
              <option value={365}>365+ days</option>
            </select>
          </div>
          <button
            onClick={() => refetch()}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <RefreshCw className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50">
          <Download className="h-4 w-4" />
          Export Report
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-red-50 rounded-xl border border-red-200 p-5">
          <div className="flex items-center justify-between mb-2">
            <Archive className="h-6 w-6 text-red-500" />
            <AlertTriangle className="h-5 w-5 text-red-400" />
          </div>
          <p className="text-sm text-red-600">Dead Stock Items</p>
          <p className="text-2xl font-bold text-red-700">{formatNumber(summary.total_items)}</p>
        </div>
        <div className="bg-orange-50 rounded-xl border border-orange-200 p-5">
          <div className="flex items-center justify-between mb-2">
            <DollarSign className="h-6 w-6 text-orange-500" />
          </div>
          <p className="text-sm text-orange-600">Capital Tied Up</p>
          <p className="text-2xl font-bold text-orange-700">{formatCurrency(summary.total_value)}</p>
        </div>
        <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-5">
          <div className="flex items-center justify-between mb-2">
            <Calendar className="h-6 w-6 text-yellow-500" />
          </div>
          <p className="text-sm text-yellow-600">Avg. Days Since Sale</p>
          <p className="text-2xl font-bold text-yellow-700">{Math.round(summary.avg_days)} days</p>
        </div>
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-600 mb-2">Quick Actions</p>
          <div className="flex gap-2">
            <button className="flex-1 px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200">
              Bulk Discount
            </button>
            <button className="flex-1 px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200">
              Write Off
            </button>
          </div>
        </div>
      </div>

      {/* Action Filter Buttons */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">Filter by recommendation:</span>
        <button
          onClick={() => setActionFilter('all')}
          className={cn(
            'px-3 py-1.5 text-sm rounded-lg transition-colors',
            actionFilter === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 hover:bg-gray-200'
          )}
        >
          All ({deadStock.length})
        </button>
        {Object.entries(actionCounts).map(([action, count]) => (
          <button
            key={action}
            onClick={() => setActionFilter(actionFilter === action ? 'all' : action)}
            className={cn(
              'px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1.5',
              actionFilter === action ? 'bg-gray-900 text-white' : 'bg-gray-100 hover:bg-gray-200'
            )}
          >
            {actionIcons[action]}
            {actionLabels[action]} ({count})
          </button>
        ))}
      </div>

      {/* Dead Stock Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {/* Toolbar */}
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedItems.length === filteredItems.length && filteredItems.length > 0}
              onChange={selectAll}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-600">
              {selectedItems.length > 0 ? `${selectedItems.length} selected` : 'Select all'}
            </span>
          </label>
          {selectedItems.length > 0 && (
            <div className="flex items-center gap-2">
              <button className="px-3 py-1.5 text-sm bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 flex items-center gap-1">
                <Tag className="h-4 w-4" />
                Create Discount
              </button>
              <button className="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 flex items-center gap-1">
                <Trash2 className="h-4 w-4" />
                Write Off
              </button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-8 text-center">
            <Archive className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500">No dead stock found</p>
            <p className="text-sm text-gray-400 mt-1">Great! All items have recent sales</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 w-10"></th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Quantity</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Sale</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Days Stale</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Recommendation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredItems.map((item) => (
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
                  <td className="px-4 py-3 font-medium">{item.product_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{item.sku}</td>
                  <td className="px-4 py-3 text-right">{formatNumber(item.quantity)}</td>
                  <td className="px-4 py-3 text-right font-medium text-red-600">
                    {formatCurrency(item.value)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {item.last_sale_date ? formatDate(item.last_sale_date) : 'Never'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn(
                      'font-medium',
                      item.days_since_sale > 180 ? 'text-red-600' :
                      item.days_since_sale > 90 ? 'text-orange-600' : 'text-yellow-600'
                    )}>
                      {item.days_since_sale} days
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn(
                      'inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full',
                      actionColors[item.recommended_action]
                    )}>
                      {actionIcons[item.recommended_action]}
                      {actionLabels[item.recommended_action]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Insights Panel with Tremor Components */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h3 className="font-medium mb-4">Insights & Recommendations</h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Top Contributors Bar List */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">Top Contributors to Dead Stock</h4>
            <BarList
              data={deadStock.slice(0, 5).map(item => ({
                name: item.product_name,
                value: item.value,
              }))}
              valueFormatter={(number) => formatCurrency(number)}
              color="rose"
              showAnimation={true}
            />
          </div>

          {/* Action Distribution Donut */}
          <div className="flex flex-col items-center">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Recommended Actions</h4>
            <DonutChart
              className="h-40"
              data={[
                { name: 'Discount', value: actionCounts.discount },
                { name: 'Bundle', value: actionCounts.bundle },
                { name: 'Return to Vendor', value: actionCounts.return_to_vendor },
                { name: 'Write Off', value: actionCounts.write_off },
              ]}
              category="value"
              index="name"
              colors={['amber', 'blue', 'violet', 'rose']}
              showAnimation={true}
              valueFormatter={(number) => `${number} items`}
            />
          </div>

          {/* Recovery Potential */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">Recovery Potential</h4>
            <Card className="p-4">
              <Flex alignItems="center" justifyContent="between">
                <div>
                  <Text>Estimated Recovery (50% discount)</Text>
                  <Metric className="text-amber-600">
                    {formatCurrency(deadStock.filter(i => i.recommended_action === 'discount').reduce((s, i) => s + i.value * 0.5, 0))}
                  </Metric>
                </div>
                <ProgressCircle
                  value={Math.min(100, (deadStock.filter(i => i.recommended_action === 'discount').length / Math.max(1, deadStock.length)) * 100)}
                  size="md"
                  color="amber"
                >
                  <span className="text-xs font-medium">{actionCounts.discount}</span>
                </ProgressCircle>
              </Flex>
            </Card>
            <div className="mt-3 space-y-2">
              <div className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg">
                <Tag className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-800">Clearance Items: {actionCounts.discount}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-purple-50 rounded-lg">
                <RotateCcw className="h-5 w-5 text-purple-600 mt-0.5" />
                <div>
                  <p className="font-medium text-purple-800">Vendor Returns: {actionCounts.return_to_vendor}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
