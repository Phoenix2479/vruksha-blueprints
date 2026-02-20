import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Hash, Search, Plus, Filter, Package, CheckCircle, XCircle,
  AlertTriangle, ShieldCheck, X, Loader2, Eye, Edit2
} from 'lucide-react'
import { productsApi } from '@/lib/api'
import { formatDate, cn } from '@/lib/utils'
import type { SerialNumber, Product } from '@/types/inventory'

export default function SerialTracking() {
  const [selectedProductId, setSelectedProductId] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [selectedSerial, setSelectedSerial] = useState<SerialNumber | null>(null)

  const queryClient = useQueryClient()

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsApi.list(),
  })

  const { data: serials = [], isLoading } = useQuery({
    queryKey: ['serials', selectedProductId],
    queryFn: () => selectedProductId ? productsApi.getSerials(selectedProductId) : Promise.resolve([]),
    enabled: !!selectedProductId,
  })

  const filteredSerials = serials.filter((s: SerialNumber) => {
    const matchesSearch = s.serial_number.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const statusCounts = {
    available: serials.filter((s: SerialNumber) => s.status === 'available').length,
    sold: serials.filter((s: SerialNumber) => s.status === 'sold').length,
    reserved: serials.filter((s: SerialNumber) => s.status === 'reserved').length,
    damaged: serials.filter((s: SerialNumber) => s.status === 'damaged').length,
    warranty: serials.filter((s: SerialNumber) => s.status === 'warranty').length,
  }

  const statusColors: Record<string, string> = {
    available: 'bg-green-100 text-green-700',
    sold: 'bg-blue-100 text-blue-700',
    reserved: 'bg-yellow-100 text-yellow-700',
    damaged: 'bg-red-100 text-red-700',
    returned: 'bg-orange-100 text-orange-700',
    warranty: 'bg-purple-100 text-purple-700',
  }

  const statusIcons: Record<string, React.ReactNode> = {
    available: <CheckCircle className="h-4 w-4 text-green-500" />,
    sold: <Package className="h-4 w-4 text-blue-500" />,
    reserved: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
    damaged: <XCircle className="h-4 w-4 text-red-500" />,
    warranty: <ShieldCheck className="h-4 w-4 text-purple-500" />,
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
          <option value="">Choose a product to view serial numbers...</option>
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
              label="Available"
              count={statusCounts.available}
              icon={<CheckCircle className="h-5 w-5 text-green-500" />}
              active={statusFilter === 'available'}
              onClick={() => setStatusFilter(statusFilter === 'available' ? 'all' : 'available')}
            />
            <StatCard
              label="Sold"
              count={statusCounts.sold}
              icon={<Package className="h-5 w-5 text-blue-500" />}
              active={statusFilter === 'sold'}
              onClick={() => setStatusFilter(statusFilter === 'sold' ? 'all' : 'sold')}
            />
            <StatCard
              label="Reserved"
              count={statusCounts.reserved}
              icon={<AlertTriangle className="h-5 w-5 text-yellow-500" />}
              active={statusFilter === 'reserved'}
              onClick={() => setStatusFilter(statusFilter === 'reserved' ? 'all' : 'reserved')}
            />
            <StatCard
              label="Damaged"
              count={statusCounts.damaged}
              icon={<XCircle className="h-5 w-5 text-red-500" />}
              active={statusFilter === 'damaged'}
              onClick={() => setStatusFilter(statusFilter === 'damaged' ? 'all' : 'damaged')}
            />
            <StatCard
              label="In Warranty"
              count={statusCounts.warranty}
              icon={<ShieldCheck className="h-5 w-5 text-purple-500" />}
              active={statusFilter === 'warranty'}
              onClick={() => setStatusFilter(statusFilter === 'warranty' ? 'all' : 'warranty')}
            />
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search serial numbers..."
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
              Add Serial
            </button>
          </div>

          {/* Serials List */}
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            {isLoading ? (
              <div className="p-8 flex justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : filteredSerials.length === 0 ? (
              <div className="p-8 text-center">
                <Hash className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p className="text-gray-500">No serial numbers found</p>
                <button
                  onClick={() => setShowAdd(true)}
                  className="mt-2 text-blue-600 hover:underline"
                >
                  Add serial numbers
                </button>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Serial Number</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Purchase Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sale Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Warranty</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredSerials.map((serial: SerialNumber) => (
                    <tr key={serial.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {statusIcons[serial.status]}
                          <span className="font-mono font-medium">{serial.serial_number}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={cn(
                          'px-2 py-1 text-xs font-medium rounded-full capitalize',
                          statusColors[serial.status]
                        )}>
                          {serial.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {serial.location_name || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {serial.purchase_date ? formatDate(serial.purchase_date) : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {serial.sale_date ? formatDate(serial.sale_date) : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {serial.warranty_expiry ? (
                          <span className={cn(
                            new Date(serial.warranty_expiry) < new Date() ? 'text-red-600' : 'text-green-600'
                          )}>
                            {formatDate(serial.warranty_expiry)}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setSelectedSerial(serial)}
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
        </>
      )}

      {/* Add Serial Modal */}
      {showAdd && selectedProductId && (
        <AddSerialModal
          productId={selectedProductId}
          onClose={() => setShowAdd(false)}
        />
      )}

      {/* Serial Detail Modal */}
      {selectedSerial && (
        <SerialDetailModal
          serial={selectedSerial}
          onClose={() => setSelectedSerial(null)}
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
        'bg-white rounded-lg border p-3 cursor-pointer transition-all hover:shadow-md',
        active && 'ring-2 ring-blue-500'
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

function AddSerialModal({
  productId,
  onClose,
}: {
  productId: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'single' | 'bulk'>('single')
  const [formData, setFormData] = useState({
    serial_number: '',
    serial_numbers: '',
    location_id: '',
    purchase_date: new Date().toISOString().split('T')[0],
    warranty_expiry: '',
    notes: '',
  })

  const addMutation = useMutation({
    mutationFn: (data: any) => productsApi.addSerial(productId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serials', productId] })
      onClose()
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === 'single') {
      addMutation.mutate({
        serial_number: formData.serial_number,
        purchase_date: formData.purchase_date,
        warranty_expiry: formData.warranty_expiry || undefined,
        notes: formData.notes || undefined,
      })
    } else {
      const serials = formData.serial_numbers.split('\n').filter(s => s.trim())
      serials.forEach(serial => {
        addMutation.mutate({
          serial_number: serial.trim(),
          purchase_date: formData.purchase_date,
          warranty_expiry: formData.warranty_expiry || undefined,
        })
      })
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg m-4">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add Serial Numbers</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Mode Toggle */}
          <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
            <button
              type="button"
              onClick={() => setMode('single')}
              className={cn(
                'flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                mode === 'single' ? 'bg-white shadow' : 'hover:bg-gray-200'
              )}
            >
              Single
            </button>
            <button
              type="button"
              onClick={() => setMode('bulk')}
              className={cn(
                'flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                mode === 'bulk' ? 'bg-white shadow' : 'hover:bg-gray-200'
              )}
            >
              Bulk Import
            </button>
          </div>

          {mode === 'single' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Serial Number *</label>
              <input
                type="text"
                required
                value={formData.serial_number}
                onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                placeholder="e.g., SN-12345-ABCD"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Serial Numbers (one per line) *</label>
              <textarea
                required
                value={formData.serial_numbers}
                onChange={(e) => setFormData({ ...formData, serial_numbers: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                rows={6}
                placeholder="SN-12345-ABCD&#10;SN-12345-EFGH&#10;SN-12345-IJKL"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Date</label>
              <input
                type="date"
                value={formData.purchase_date}
                onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Warranty Expiry</label>
              <input
                type="date"
                value={formData.warranty_expiry}
                onChange={(e) => setFormData({ ...formData, warranty_expiry: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {mode === 'single' && (
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
          )}

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
              Add Serial{mode === 'bulk' ? 's' : ''}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function SerialDetailModal({
  serial,
  onClose,
}: {
  serial: SerialNumber
  onClose: () => void
}) {
  const statusColors: Record<string, string> = {
    available: 'bg-green-100 text-green-700',
    sold: 'bg-blue-100 text-blue-700',
    reserved: 'bg-yellow-100 text-yellow-700',
    damaged: 'bg-red-100 text-red-700',
    returned: 'bg-orange-100 text-orange-700',
    warranty: 'bg-purple-100 text-purple-700',
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md m-4">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Serial Number Details</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="text-center py-4 bg-gray-50 rounded-lg">
            <p className="text-2xl font-mono font-bold">{serial.serial_number}</p>
            <span className={cn(
              'mt-2 inline-block px-3 py-1 text-sm font-medium rounded-full capitalize',
              statusColors[serial.status]
            )}>
              {serial.status}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">Product</p>
              <p className="font-medium">{serial.product_name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Location</p>
              <p className="font-medium">{serial.location_name || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Purchase Date</p>
              <p className="font-medium">{serial.purchase_date ? formatDate(serial.purchase_date) : '-'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Sale Date</p>
              <p className="font-medium">{serial.sale_date ? formatDate(serial.sale_date) : '-'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Warranty Expiry</p>
              <p className={cn(
                'font-medium',
                serial.warranty_expiry && new Date(serial.warranty_expiry) < new Date() ? 'text-red-600' : ''
              )}>
                {serial.warranty_expiry ? formatDate(serial.warranty_expiry) : '-'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Created</p>
              <p className="font-medium">{formatDate(serial.created_at)}</p>
            </div>
          </div>

          {serial.notes && (
            <div>
              <p className="text-xs text-gray-500">Notes</p>
              <p className="text-sm">{serial.notes}</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={onClose}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Close
            </button>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
              <Edit2 className="h-4 w-4" />
              Edit Status
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
