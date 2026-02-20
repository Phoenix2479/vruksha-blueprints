import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Trash2, Plus, Search, CheckCircle, XCircle, Clock, AlertTriangle,
  X, Loader2, Eye, FileText, Package
} from 'lucide-react'
import { writeoffsApi, productsApi } from '@/lib/api'
import { formatCurrency, formatNumber, formatDateTime, formatDate, cn } from '@/lib/utils'
import type { WriteOff, WriteOffItem } from '@/types/inventory'

export default function WriteOffs() {
  const [showCreate, setShowCreate] = useState(false)
  const [selectedWriteOff, setSelectedWriteOff] = useState<WriteOff | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const { data: writeoffs = [], isLoading } = useQuery({
    queryKey: ['writeoffs', statusFilter],
    queryFn: () => writeoffsApi.list({ status: statusFilter !== 'all' ? statusFilter : undefined }),
  })

  const filteredWriteoffs = writeoffs.filter((w: WriteOff) =>
    w.reference_number.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const statusCounts = {
    pending: writeoffs.filter((w: WriteOff) => w.status === 'pending_approval' || w.status === 'draft').length,
    approved: writeoffs.filter((w: WriteOff) => w.status === 'approved' || w.status === 'completed').length,
    rejected: writeoffs.filter((w: WriteOff) => w.status === 'rejected').length,
  }

  const totalValue = writeoffs
    .filter((w: WriteOff) => w.status === 'approved' || w.status === 'completed')
    .reduce((sum: number, w: WriteOff) => sum + w.total_value, 0)

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    pending_approval: 'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    completed: 'bg-blue-100 text-blue-700',
  }

  const reasonLabels: Record<string, string> = {
    damaged: 'Damaged',
    expired: 'Expired',
    lost: 'Lost',
    theft: 'Theft',
    obsolete: 'Obsolete',
    other: 'Other',
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Pending Approval"
          count={statusCounts.pending}
          icon={<Clock className="h-5 w-5 text-yellow-500" />}
          color="yellow"
          active={statusFilter === 'pending_approval'}
          onClick={() => setStatusFilter(statusFilter === 'pending_approval' ? 'all' : 'pending_approval')}
        />
        <StatCard
          label="Approved"
          count={statusCounts.approved}
          icon={<CheckCircle className="h-5 w-5 text-green-500" />}
          color="green"
          active={statusFilter === 'approved'}
          onClick={() => setStatusFilter(statusFilter === 'approved' ? 'all' : 'approved')}
        />
        <StatCard
          label="Rejected"
          count={statusCounts.rejected}
          icon={<XCircle className="h-5 w-5 text-red-500" />}
          color="red"
          active={statusFilter === 'rejected'}
          onClick={() => setStatusFilter(statusFilter === 'rejected' ? 'all' : 'rejected')}
        />
        <StatCard
          label="Total Written Off"
          count={formatCurrency(totalValue)}
          icon={<Trash2 className="h-5 w-5 text-gray-500" />}
          color="gray"
          isValue
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search write-offs..."
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
          New Write-Off
        </button>
      </div>

      {/* Write-offs List */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : filteredWriteoffs.length === 0 ? (
          <div className="p-8 text-center">
            <Trash2 className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500">No write-offs found</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-2 text-blue-600 hover:underline"
            >
              Create a write-off request
            </button>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Items</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Requested By</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredWriteoffs.map((writeoff: WriteOff) => (
                <tr key={writeoff.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <span className="font-medium text-blue-600">{writeoff.reference_number}</span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className="capitalize">{reasonLabels[writeoff.reason] || writeoff.reason}</span>
                  </td>
                  <td className="px-6 py-4 text-center text-sm">
                    {formatNumber(writeoff.total_items)} items
                    <span className="text-gray-400 ml-1">
                      ({formatNumber(writeoff.total_quantity)} units)
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-medium text-red-600">
                    {formatCurrency(writeoff.total_value)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {writeoff.requested_by}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={cn(
                      'px-2 py-1 text-xs font-medium rounded-full capitalize',
                      statusColors[writeoff.status]
                    )}>
                      {writeoff.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDate(writeoff.created_at)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => setSelectedWriteOff(writeoff)}
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
        <CreateWriteOffModal
          onClose={() => setShowCreate(false)}
          onCreated={(writeoff) => {
            setShowCreate(false)
            setSelectedWriteOff(writeoff)
          }}
        />
      )}

      {/* Write-off Detail Modal */}
      {selectedWriteOff && (
        <WriteOffDetailModal
          writeoff={selectedWriteOff}
          onClose={() => setSelectedWriteOff(null)}
        />
      )}
    </div>
  )
}

function StatCard({
  label,
  count,
  icon,
  color,
  active,
  onClick,
  isValue,
}: {
  label: string
  count: number | string
  icon: React.ReactNode
  color: 'yellow' | 'green' | 'red' | 'gray'
  active?: boolean
  onClick?: () => void
  isValue?: boolean
}) {
  const bgColors = {
    yellow: 'bg-yellow-50 border-yellow-100',
    green: 'bg-green-50 border-green-100',
    red: 'bg-red-50 border-red-100',
    gray: 'bg-gray-50 border-gray-100',
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-lg border p-4 transition-all',
        bgColors[color],
        onClick && 'cursor-pointer hover:shadow-md',
        active && 'ring-2 ring-blue-500'
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold">
            {isValue ? count : formatNumber(count as number)}
          </p>
        </div>
        {icon}
      </div>
    </div>
  )
}

function CreateWriteOffModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (writeoff: WriteOff) => void
}) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<'info' | 'items'>('info')
  const [formData, setFormData] = useState({
    reason: 'damaged' as WriteOff['reason'],
    notes: '',
    items: [] as { product_id: string; quantity: number; reason: string }[],
  })
  const [newItem, setNewItem] = useState({ product_id: '', quantity: 0, reason: '' })

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsApi.list(),
  })

  const createMutation = useMutation({
    mutationFn: writeoffsApi.create,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['writeoffs'] })
      onCreated(data)
    },
  })

  const addItem = () => {
    if (newItem.product_id && newItem.quantity > 0) {
      setFormData({
        ...formData,
        items: [...formData.items, { ...newItem, reason: newItem.reason || formData.reason }],
      })
      setNewItem({ product_id: '', quantity: 0, reason: '' })
    }
  }

  const removeItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index),
    })
  }

  const getProduct = (id: string) => products.find((p: any) => p.id === id)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl m-4 max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Create Write-Off Request</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Steps */}
        <div className="px-6 py-3 border-b bg-gray-50">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setStep('info')}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium',
                step === 'info' ? 'bg-blue-600 text-white' : 'bg-gray-200'
              )}
            >
              <span className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center text-xs">1</span>
              Basic Info
            </button>
            <button
              onClick={() => setStep('items')}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium',
                step === 'items' ? 'bg-blue-600 text-white' : 'bg-gray-200'
              )}
            >
              <span className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center text-xs">2</span>
              Add Items
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {step === 'info' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
                <select
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value as any })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="damaged">Damaged Goods</option>
                  <option value="expired">Expired Products</option>
                  <option value="lost">Lost/Missing</option>
                  <option value="theft">Theft</option>
                  <option value="obsolete">Obsolete/Discontinued</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={4}
                  placeholder="Describe the reason for write-off..."
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Add Item Form */}
              <div className="p-4 bg-gray-50 rounded-lg space-y-3">
                <h4 className="font-medium">Add Item</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <select
                      value={newItem.product_id}
                      onChange={(e) => setNewItem({ ...newItem, product_id: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select product...</option>
                      {products.map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku}) - {formatNumber(p.quantity)} in stock
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <input
                      type="number"
                      min="1"
                      value={newItem.quantity || ''}
                      onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Qty"
                    />
                  </div>
                </div>
                <button
                  onClick={addItem}
                  disabled={!newItem.product_id || newItem.quantity <= 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  Add to Write-Off
                </button>
              </div>

              {/* Items List */}
              {formData.items.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  No items added yet
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Quantity</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Est. Value</th>
                      <th className="px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {formData.items.map((item, i) => {
                      const product = getProduct(item.product_id)
                      return (
                        <tr key={i}>
                          <td className="px-4 py-3">
                            <p className="font-medium">{product?.name}</p>
                            <p className="text-sm text-gray-500">{product?.sku}</p>
                          </td>
                          <td className="px-4 py-3 text-right">{formatNumber(item.quantity)}</td>
                          <td className="px-4 py-3 text-right text-red-600">
                            {formatCurrency((product?.cost_price || 0) * item.quantity)}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => removeItem(i)}
                              className="p-1 hover:bg-gray-100 rounded"
                            >
                              <X className="h-4 w-4 text-gray-400" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t flex justify-between">
          {step === 'items' && (
            <button
              onClick={() => setStep('info')}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Back
            </button>
          )}
          <div className="flex gap-3 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            {step === 'info' ? (
              <button
                onClick={() => setStep('items')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Next: Add Items
              </button>
            ) : (
              <button
                onClick={() => createMutation.mutate(formData)}
                disabled={createMutation.isPending || formData.items.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Submit for Approval
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function WriteOffDetailModal({
  writeoff,
  onClose,
}: {
  writeoff: WriteOff
  onClose: () => void
}) {
  const queryClient = useQueryClient()

  const { data: details } = useQuery({
    queryKey: ['writeoff', writeoff.id],
    queryFn: () => writeoffsApi.get(writeoff.id),
  })

  const items: WriteOffItem[] = details?.items || []

  const approveMutation = useMutation({
    mutationFn: () => writeoffsApi.approve(writeoff.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['writeoffs'] })
      onClose()
    },
  })

  const rejectMutation = useMutation({
    mutationFn: () => writeoffsApi.reject(writeoff.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['writeoffs'] })
      onClose()
    },
  })

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    pending_approval: 'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    completed: 'bg-blue-100 text-blue-700',
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl m-4 max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{writeoff.reference_number}</h2>
            <p className="text-sm text-gray-500 capitalize">{writeoff.reason} - {writeoff.requested_by}</p>
          </div>
          <div className="flex items-center gap-3">
            {writeoff.status === 'pending_approval' && (
              <>
                <button
                  onClick={() => rejectMutation.mutate()}
                  disabled={rejectMutation.isPending}
                  className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 flex items-center gap-2"
                >
                  {rejectMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  <XCircle className="h-4 w-4" />
                  Reject
                </button>
                <button
                  onClick={() => approveMutation.mutate()}
                  disabled={approveMutation.isPending}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {approveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  <CheckCircle className="h-4 w-4" />
                  Approve
                </button>
              </>
            )}
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="px-6 py-3 bg-gray-50 border-b grid grid-cols-5 gap-4">
          <div>
            <p className="text-xs text-gray-500">Status</p>
            <span className={cn(
              'px-2 py-0.5 text-xs font-medium rounded-full capitalize',
              statusColors[writeoff.status]
            )}>
              {writeoff.status.replace('_', ' ')}
            </span>
          </div>
          <div>
            <p className="text-xs text-gray-500">Items</p>
            <p className="font-medium">{formatNumber(writeoff.total_items)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Quantity</p>
            <p className="font-medium">{formatNumber(writeoff.total_quantity)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Value</p>
            <p className="font-medium text-red-600">{formatCurrency(writeoff.total_value)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Date</p>
            <p className="font-medium">{formatDate(writeoff.created_at)}</p>
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Quantity</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Unit Cost</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{item.product_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{item.sku}</td>
                  <td className="px-6 py-4 text-right">{formatNumber(item.quantity)}</td>
                  <td className="px-6 py-4 text-right">{formatCurrency(item.unit_cost)}</td>
                  <td className="px-6 py-4 text-right font-medium text-red-600">
                    {formatCurrency(item.total_cost)}
                  </td>
                  <td className="px-6 py-4 text-sm capitalize">{item.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Notes */}
        {writeoff.notes && (
          <div className="px-6 py-4 border-t bg-gray-50">
            <p className="text-sm text-gray-500 mb-1">Notes</p>
            <p className="text-sm">{writeoff.notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}
