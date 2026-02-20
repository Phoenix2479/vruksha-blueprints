import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Truck, Plus, Search, CheckCircle, Clock, Package, Loader2, Eye, FileText } from 'lucide-react'
import { receivingApi } from '@/lib/api'
import { formatCurrency, formatNumber, formatDate, cn } from '@/lib/utils'
import type { GoodsReceipt } from '@/types/inventory'
import StatCard from './StatCard'
import CreateReceiptModal from './modals/CreateReceiptModal'
import ReceiptDetailModal from './modals/ReceiptDetailModal'

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  pending_inspection: 'bg-yellow-100 text-yellow-700',
  partial: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

export default function GoodsReceiving() {
  const [showCreate, setShowCreate] = useState(false)
  const [selectedReceipt, setSelectedReceipt] = useState<GoodsReceipt | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const { data: receipts = [], isLoading } = useQuery({
    queryKey: ['receiving', statusFilter],
    queryFn: () => receivingApi.list({ status: statusFilter !== 'all' ? statusFilter : undefined }),
  })

  const filteredReceipts = receipts.filter((r: GoodsReceipt) =>
    r.grn_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.supplier_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.po_number?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const statusCounts = {
    pending: receipts.filter((r: GoodsReceipt) => r.status === 'pending_inspection' || r.status === 'draft').length,
    partial: receipts.filter((r: GoodsReceipt) => r.status === 'partial').length,
    completed: receipts.filter((r: GoodsReceipt) => r.status === 'completed').length,
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Pending Receipts"
          count={statusCounts.pending}
          icon={<Clock className="h-5 w-5 text-yellow-500" />}
          color="yellow"
        />
        <StatCard
          label="Partial Received"
          count={statusCounts.partial}
          icon={<Package className="h-5 w-5 text-blue-500" />}
          color="blue"
        />
        <StatCard
          label="Completed"
          count={statusCounts.completed}
          icon={<CheckCircle className="h-5 w-5 text-green-500" />}
          color="green"
        />
        <StatCard
          label="Total Value Received"
          count={formatCurrency(receipts.reduce((sum: number, r: GoodsReceipt) => sum + r.total_value, 0))}
          icon={<Truck className="h-5 w-5 text-gray-500" />}
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
            placeholder="Search by GRN, PO, or supplier..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="pending_inspection">Pending Inspection</option>
            <option value="partial">Partial</option>
            <option value="completed">Completed</option>
          </select>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            New Receipt
          </button>
        </div>
      </div>

      {/* Receipts List */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : filteredReceipts.length === 0 ? (
          <div className="p-8 text-center">
            <Truck className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500">No goods receipts found</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-2 text-blue-600 hover:underline"
            >
              Create a new receipt
            </button>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">GRN #</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">PO #</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Items</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredReceipts.map((receipt: GoodsReceipt) => (
                <tr key={receipt.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <span className="font-medium text-blue-600">{receipt.grn_number}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{receipt.po_number || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{receipt.supplier_name || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{receipt.location_name || '-'}</td>
                  <td className="px-6 py-4 text-center text-sm">{formatNumber(receipt.total_items)} items</td>
                  <td className="px-6 py-4 text-right text-sm font-medium">{formatCurrency(receipt.total_value)}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={cn(
                      'px-2 py-1 text-xs font-medium rounded-full capitalize',
                      statusColors[receipt.status]
                    )}>
                      {receipt.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatDate(receipt.receipt_date)}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setSelectedReceipt(receipt)}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                        title="View Details"
                      >
                        <Eye className="h-4 w-4 text-gray-500" />
                      </button>
                      <button className="p-2 hover:bg-gray-100 rounded-lg" title="Print GRN">
                        <FileText className="h-4 w-4 text-gray-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {showCreate && (
        <CreateReceiptModal
          onClose={() => setShowCreate(false)}
          onCreated={(receipt) => {
            setShowCreate(false)
            setSelectedReceipt(receipt)
          }}
        />
      )}

      {selectedReceipt && (
        <ReceiptDetailModal
          receipt={selectedReceipt}
          onClose={() => setSelectedReceipt(null)}
        />
      )}
    </div>
  )
}
