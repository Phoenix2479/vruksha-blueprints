import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardList, Plus, Search, Filter, CheckCircle, Clock,
  AlertCircle, X, Loader2, ChevronRight, Play, Square, Eye
} from 'lucide-react'
import { stockCountsApi, locationsApi, productsApi } from '@/lib/api'
import { formatNumber, formatDateTime, cn } from '@/lib/utils'
import type { StockCount, StockCountItem } from '@/types/inventory'

export default function StockCounts() {
  const [showCreate, setShowCreate] = useState(false)
  const [selectedCount, setSelectedCount] = useState<StockCount | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const queryClient = useQueryClient()

  const { data: counts = [], isLoading } = useQuery({
    queryKey: ['stock-counts', statusFilter],
    queryFn: () => stockCountsApi.list({ status: statusFilter !== 'all' ? statusFilter : undefined }),
  })

  const filteredCounts = counts.filter((c: StockCount) =>
    c.reference_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.location_name?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const statusCounts = {
    draft: counts.filter((c: StockCount) => c.status === 'draft').length,
    in_progress: counts.filter((c: StockCount) => c.status === 'in_progress').length,
    completed: counts.filter((c: StockCount) => c.status === 'completed').length,
  }

  const statusColors = {
    draft: 'bg-gray-100 text-gray-700',
    in_progress: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
  }

  const typeLabels = {
    full: 'Full Count',
    cycle: 'Cycle Count',
    spot: 'Spot Check',
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="Draft"
          count={statusCounts.draft}
          icon={<Clock className="h-5 w-5 text-gray-500" />}
          active={statusFilter === 'draft'}
          onClick={() => setStatusFilter(statusFilter === 'draft' ? 'all' : 'draft')}
        />
        <StatCard
          label="In Progress"
          count={statusCounts.in_progress}
          icon={<Play className="h-5 w-5 text-blue-500" />}
          active={statusFilter === 'in_progress'}
          onClick={() => setStatusFilter(statusFilter === 'in_progress' ? 'all' : 'in_progress')}
        />
        <StatCard
          label="Completed"
          count={statusCounts.completed}
          icon={<CheckCircle className="h-5 w-5 text-green-500" />}
          active={statusFilter === 'completed'}
          onClick={() => setStatusFilter(statusFilter === 'completed' ? 'all' : 'completed')}
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search counts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          New Count
        </button>
      </div>

      {/* Counts List */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : filteredCounts.length === 0 ? (
          <div className="p-8 text-center">
            <ClipboardList className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500">No stock counts found</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-2 text-blue-600 hover:underline"
            >
              Create your first count
            </button>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Progress</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Variances</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredCounts.map((count: StockCount) => (
                <tr key={count.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <span className="font-medium text-gray-900">{count.reference_number}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {typeLabels[count.type]}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {count.location_name || 'All Locations'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${count.total_items ? (count.counted_items / count.total_items) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500">
                        {count.counted_items}/{count.total_items}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {count.variance_count > 0 ? (
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                        {count.variance_count} items
                      </span>
                    ) : (
                      <span className="text-gray-400 text-sm">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={cn(
                      'px-2 py-1 text-xs font-medium rounded-full capitalize',
                      statusColors[count.status]
                    )}>
                      {count.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDateTime(count.created_at)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => setSelectedCount(count)}
                      className="p-2 hover:bg-gray-100 rounded-lg"
                      title="View Details"
                    >
                      <Eye className="h-4 w-4 text-gray-500" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <CreateCountModal
          onClose={() => setShowCreate(false)}
          onCreated={(count) => {
            setShowCreate(false)
            setSelectedCount(count)
          }}
        />
      )}

      {/* Count Detail Modal */}
      {selectedCount && (
        <CountDetailModal
          count={selectedCount}
          onClose={() => setSelectedCount(null)}
        />
      )}
    </div>
  )
}

function StatCard({
  label,
  count,
  icon,
  active,
  onClick,
}: {
  label: string
  count: number
  icon: React.ReactNode
  active?: boolean
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white rounded-lg border p-4 cursor-pointer transition-all hover:shadow-md',
        active && 'ring-2 ring-blue-500'
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold">{formatNumber(count)}</p>
        </div>
        {icon}
      </div>
    </div>
  )
}

function CreateCountModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (count: StockCount) => void
}) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    type: 'cycle' as 'full' | 'cycle' | 'spot',
    location_id: '',
    category_id: '',
    notes: '',
  })

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => locationsApi.list(),
  })

  const createMutation = useMutation({
    mutationFn: stockCountsApi.create,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['stock-counts'] })
      onCreated(data)
    },
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg m-4">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Create Stock Count</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            createMutation.mutate(formData)
          }}
          className="p-6 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Count Type *</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="full">Full Inventory Count</option>
              <option value="cycle">Cycle Count (by location/category)</option>
              <option value="spot">Spot Check (random items)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <select
              value={formData.location_id}
              onChange={(e) => setFormData({ ...formData, location_id: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Locations</option>
              {locations.map((loc: any) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="Optional notes..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Count
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CountDetailModal({
  count,
  onClose,
}: {
  count: StockCount
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [countedItems, setCountedItems] = useState<Record<string, number>>({})

  const { data: countDetails } = useQuery({
    queryKey: ['stock-count', count.id],
    queryFn: () => stockCountsApi.get(count.id),
  })

  const items: StockCountItem[] = countDetails?.items || []

  const addItemMutation = useMutation({
    mutationFn: ({ countId, data }: { countId: string; data: any }) =>
      stockCountsApi.addItem(countId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-count', count.id] })
    },
  })

  const completeMutation = useMutation({
    mutationFn: stockCountsApi.complete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-counts'] })
      queryClient.invalidateQueries({ queryKey: ['stock-count', count.id] })
      onClose()
    },
  })

  const handleCountChange = (itemId: string, value: number) => {
    setCountedItems(prev => ({ ...prev, [itemId]: value }))
  }

  const handleSubmitCount = (item: StockCountItem) => {
    const counted = countedItems[item.id]
    if (counted !== undefined) {
      addItemMutation.mutate({
        countId: count.id,
        data: {
          product_id: item.product_id,
          counted_quantity: counted,
        },
      })
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl m-4 max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{count.reference_number}</h2>
            <p className="text-sm text-gray-500">
              {count.type === 'full' ? 'Full Count' : count.type === 'cycle' ? 'Cycle Count' : 'Spot Check'}
              {count.location_name && ` - ${count.location_name}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {count.status === 'in_progress' && (
              <button
                onClick={() => completeMutation.mutate(count.id)}
                disabled={completeMutation.isPending}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
              >
                {completeMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                <CheckCircle className="h-4 w-4" />
                Complete Count
              </button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="px-6 py-3 bg-gray-50 border-b">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Counting Progress</span>
            <span className="text-sm font-medium">
              {count.counted_items} / {count.total_items} items
            </span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${count.total_items ? (count.counted_items / count.total_items) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">System Qty</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Counted Qty</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Variance</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{item.product_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{item.sku}</td>
                  <td className="px-6 py-4 text-right">{formatNumber(item.system_quantity)}</td>
                  <td className="px-6 py-4 text-right">
                    {item.status === 'counted' ? (
                      formatNumber(item.counted_quantity || 0)
                    ) : (
                      <input
                        type="number"
                        min="0"
                        value={countedItems[item.id] ?? ''}
                        onChange={(e) => handleCountChange(item.id, parseInt(e.target.value) || 0)}
                        className="w-20 px-2 py-1 border rounded text-right focus:ring-2 focus:ring-blue-500"
                        placeholder="0"
                      />
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {item.variance !== undefined && item.variance !== 0 ? (
                      <span className={item.variance > 0 ? 'text-green-600' : 'text-red-600'}>
                        {item.variance > 0 ? '+' : ''}{formatNumber(item.variance)}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={cn(
                      'px-2 py-1 text-xs font-medium rounded-full capitalize',
                      item.status === 'counted' ? 'bg-green-100 text-green-700' :
                      item.status === 'verified' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    )}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {item.status === 'pending' && countedItems[item.id] !== undefined && (
                      <button
                        onClick={() => handleSubmitCount(item)}
                        disabled={addItemMutation.isPending}
                        className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                      >
                        Save
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary Footer */}
        {count.variance_count > 0 && (
          <div className="px-6 py-4 border-t bg-yellow-50">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              <span className="text-sm text-yellow-800">
                {count.variance_count} items with variances totaling {formatNumber(count.variance_value)} value adjustment
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
