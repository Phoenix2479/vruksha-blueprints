import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Layers, Search, Plus, Filter, Package, CheckCircle, XCircle,
  AlertTriangle, Calendar, X, Loader2, Eye, Clock
} from 'lucide-react'
import { productsApi } from '@/lib/api'
import { formatNumber, formatDate, formatCurrency, cn } from '@/lib/utils'
import type { Batch, Product } from '@/types/inventory'

export default function BatchTracking() {
  const [selectedProductId, setSelectedProductId] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null)

  const queryClient = useQueryClient()

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsApi.list(),
  })

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['batches', selectedProductId],
    queryFn: () => selectedProductId ? productsApi.getBatches(selectedProductId) : Promise.resolve([]),
    enabled: !!selectedProductId,
  })

  const filteredBatches = batches.filter((b: Batch) => {
    const matchesSearch = b.batch_number.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || b.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const statusCounts = {
    active: batches.filter((b: Batch) => b.status === 'active').length,
    expired: batches.filter((b: Batch) => b.status === 'expired').length,
    recalled: batches.filter((b: Batch) => b.status === 'recalled').length,
    depleted: batches.filter((b: Batch) => b.status === 'depleted').length,
  }

  // Check for expiring soon batches
  const today = new Date()
  const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
  const expiringSoon = batches.filter((b: Batch) => 
    b.expiry_date && 
    new Date(b.expiry_date) > today && 
    new Date(b.expiry_date) <= thirtyDaysFromNow &&
    b.status === 'active'
  ).length

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    expired: 'bg-red-100 text-red-700',
    recalled: 'bg-orange-100 text-orange-700',
    depleted: 'bg-gray-100 text-gray-700',
  }

  return (
    <div className="space-y-4">
      {/* Product Selector */}
      <div className="bg-white rounded-lg border p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Select Product</label>
        <select
          value={selectedProductId}
          onChange={(e) => setSelectedProductId(e.target.value)}
          className="w-full max-w-md px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Choose a product to view batches...</option>
          {products.map((p: Product) => (
            <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
          ))}
        </select>
      </div>

      {selectedProductId && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-5 gap-3">
            <StatCard
              label="Active Batches"
              count={statusCounts.active}
              icon={<CheckCircle className="h-5 w-5 text-green-500" />}
              active={statusFilter === 'active'}
              onClick={() => setStatusFilter(statusFilter === 'active' ? 'all' : 'active')}
            />
            <StatCard
              label="Expiring Soon"
              count={expiringSoon}
              icon={<Clock className="h-5 w-5 text-yellow-500" />}
              highlight={expiringSoon > 0}
            />
            <StatCard
              label="Expired"
              count={statusCounts.expired}
              icon={<XCircle className="h-5 w-5 text-red-500" />}
              active={statusFilter === 'expired'}
              onClick={() => setStatusFilter(statusFilter === 'expired' ? 'all' : 'expired')}
            />
            <StatCard
              label="Recalled"
              count={statusCounts.recalled}
              icon={<AlertTriangle className="h-5 w-5 text-orange-500" />}
              active={statusFilter === 'recalled'}
              onClick={() => setStatusFilter(statusFilter === 'recalled' ? 'all' : 'recalled')}
            />
            <StatCard
              label="Depleted"
              count={statusCounts.depleted}
              icon={<Package className="h-5 w-5 text-gray-500" />}
              active={statusFilter === 'depleted'}
              onClick={() => setStatusFilter(statusFilter === 'depleted' ? 'all' : 'depleted')}
            />
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search batch numbers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Add Batch
            </button>
          </div>

          {/* Batches List */}
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            {isLoading ? (
              <div className="p-8 flex justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : filteredBatches.length === 0 ? (
              <div className="p-8 text-center">
                <Layers className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p className="text-gray-500">No batches found</p>
                <button
                  onClick={() => setShowAdd(true)}
                  className="mt-2 text-blue-600 hover:underline"
                >
                  Add a batch
                </button>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch Number</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Quantity</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Available</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mfg Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expiry Date</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredBatches.map((batch: Batch) => {
                    const isExpiringSoon = batch.expiry_date && 
                      new Date(batch.expiry_date) > today && 
                      new Date(batch.expiry_date) <= thirtyDaysFromNow
                    const isExpired = batch.expiry_date && new Date(batch.expiry_date) < today

                    return (
                      <tr key={batch.id} className={cn(
                        'hover:bg-gray-50',
                        isExpired && 'bg-red-50',
                        isExpiringSoon && 'bg-yellow-50'
                      )}>
                        <td className="px-6 py-4">
                          <span className="font-mono font-medium">{batch.batch_number}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={cn(
                            'px-2 py-1 text-xs font-medium rounded-full capitalize',
                            statusColors[batch.status]
                          )}>
                            {batch.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">{formatNumber(batch.quantity)}</td>
                        <td className="px-6 py-4 text-right">
                          <span className={batch.available_quantity > 0 ? 'text-green-600 font-medium' : 'text-gray-400'}>
                            {formatNumber(batch.available_quantity)}
                          </span>
                          {batch.reserved_quantity > 0 && (
                            <span className="text-xs text-orange-600 ml-1">
                              ({formatNumber(batch.reserved_quantity)} reserved)
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {batch.manufacturing_date ? formatDate(batch.manufacturing_date) : '-'}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {batch.expiry_date ? (
                            <span className={cn(
                              'flex items-center gap-1',
                              isExpired && 'text-red-600 font-medium',
                              isExpiringSoon && 'text-yellow-600 font-medium'
                            )}>
                              {isExpiringSoon && <Clock className="h-3 w-3" />}
                              {isExpired && <XCircle className="h-3 w-3" />}
                              {formatDate(batch.expiry_date)}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="px-6 py-4 text-right text-sm">
                          {batch.cost_price ? formatCurrency(batch.cost_price) : '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {batch.supplier_name || '-'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => setSelectedBatch(batch)}
                            className="p-2 hover:bg-gray-100 rounded-lg"
                            title="View Details"
                          >
                            <Eye className="h-4 w-4 text-gray-500" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Add Batch Modal */}
      {showAdd && selectedProductId && (
        <AddBatchModal
          productId={selectedProductId}
          onClose={() => setShowAdd(false)}
        />
      )}

      {/* Batch Detail Modal */}
      {selectedBatch && (
        <BatchDetailModal
          batch={selectedBatch}
          onClose={() => setSelectedBatch(null)}
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
  highlight,
}: {
  label: string
  count: number
  icon: React.ReactNode
  active?: boolean
  onClick?: () => void
  highlight?: boolean
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white rounded-lg border p-3 transition-all',
        onClick && 'cursor-pointer hover:shadow-md',
        active && 'ring-2 ring-blue-500',
        highlight && 'border-yellow-400 bg-yellow-50'
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-xl font-bold">{count}</p>
        </div>
        {icon}
      </div>
    </div>
  )
}

function AddBatchModal({
  productId,
  onClose,
}: {
  productId: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    batch_number: '',
    quantity: 0,
    manufacturing_date: '',
    expiry_date: '',
    supplier_name: '',
    cost_price: 0,
    location_id: '',
    notes: '',
  })

  const addMutation = useMutation({
    mutationFn: (data: any) => productsApi.addBatch(productId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches', productId] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg m-4">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add Batch</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            addMutation.mutate(formData)
          }}
          className="p-6 space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Batch Number *</label>
              <input
                type="text"
                required
                value={formData.batch_number}
                onChange={(e) => setFormData({ ...formData, batch_number: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                placeholder="e.g., LOT-2024-001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
              <input
                type="number"
                required
                min="1"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturing Date</label>
              <input
                type="date"
                value={formData.manufacturing_date}
                onChange={(e) => setFormData({ ...formData, manufacturing_date: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
              <input
                type="date"
                value={formData.expiry_date}
                onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
              <input
                type="text"
                value={formData.supplier_name}
                onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Supplier name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cost Price</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.cost_price}
                onChange={(e) => setFormData({ ...formData, cost_price: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              rows={2}
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
              disabled={addMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {addMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Add Batch
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function BatchDetailModal({
  batch,
  onClose,
}: {
  batch: Batch
  onClose: () => void
}) {
  const today = new Date()
  const isExpired = batch.expiry_date && new Date(batch.expiry_date) < today
  const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
  const isExpiringSoon = batch.expiry_date && 
    new Date(batch.expiry_date) > today && 
    new Date(batch.expiry_date) <= thirtyDaysFromNow

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    expired: 'bg-red-100 text-red-700',
    recalled: 'bg-orange-100 text-orange-700',
    depleted: 'bg-gray-100 text-gray-700',
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md m-4">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Batch Details</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className={cn(
            'text-center py-4 rounded-lg',
            isExpired ? 'bg-red-50' : isExpiringSoon ? 'bg-yellow-50' : 'bg-gray-50'
          )}>
            <p className="text-2xl font-mono font-bold">{batch.batch_number}</p>
            <span className={cn(
              'mt-2 inline-block px-3 py-1 text-sm font-medium rounded-full capitalize',
              statusColors[batch.status]
            )}>
              {batch.status}
            </span>
            {isExpiringSoon && (
              <p className="mt-2 text-sm text-yellow-600 flex items-center justify-center gap-1">
                <Clock className="h-4 w-4" />
                Expiring soon!
              </p>
            )}
            {isExpired && (
              <p className="mt-2 text-sm text-red-600 flex items-center justify-center gap-1">
                <XCircle className="h-4 w-4" />
                Expired
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">Product</p>
              <p className="font-medium">{batch.product_name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Location</p>
              <p className="font-medium">{batch.location_name || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Quantity</p>
              <p className="font-medium">{formatNumber(batch.quantity)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Available</p>
              <p className="font-medium text-green-600">{formatNumber(batch.available_quantity)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Reserved</p>
              <p className="font-medium text-orange-600">{formatNumber(batch.reserved_quantity)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Cost Price</p>
              <p className="font-medium">{batch.cost_price ? formatCurrency(batch.cost_price) : '-'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Manufacturing Date</p>
              <p className="font-medium">{batch.manufacturing_date ? formatDate(batch.manufacturing_date) : '-'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Expiry Date</p>
              <p className={cn(
                'font-medium',
                isExpired && 'text-red-600',
                isExpiringSoon && 'text-yellow-600'
              )}>
                {batch.expiry_date ? formatDate(batch.expiry_date) : '-'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Supplier</p>
              <p className="font-medium">{batch.supplier_name || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Created</p>
              <p className="font-medium">{formatDate(batch.created_at)}</p>
            </div>
          </div>

          {batch.notes && (
            <div>
              <p className="text-xs text-gray-500">Notes</p>
              <p className="text-sm">{batch.notes}</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={onClose}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Close
            </button>
            {batch.status === 'active' && (
              <button className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Recall Batch
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
