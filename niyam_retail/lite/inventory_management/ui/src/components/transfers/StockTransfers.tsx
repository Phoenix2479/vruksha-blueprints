import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRightLeft, Plus, Search, Truck, CheckCircle, Clock, Loader2, Eye } from 'lucide-react'
import { transfersApi } from '@/lib/api'
import { formatNumber, formatDate, cn } from '@/lib/utils'
import type { StockTransfer } from '@/types/inventory'
import TransferStatCard from './TransferStatCard'
import CreateTransferModal from './modals/CreateTransferModal'
import TransferDetailModal from './modals/TransferDetailModal'

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  pending: 'bg-yellow-100 text-yellow-700',
  in_transit: 'bg-blue-100 text-blue-700',
  partial: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

const priorityColors: Record<string, string> = {
  low: 'text-gray-500',
  normal: 'text-blue-500',
  high: 'text-orange-500',
  urgent: 'text-red-500',
}

export default function StockTransfers() {
  const [showCreate, setShowCreate] = useState(false)
  const [selectedTransfer, setSelectedTransfer] = useState<StockTransfer | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const { data: transfers = [], isLoading } = useQuery({
    queryKey: ['transfers', statusFilter],
    queryFn: () => transfersApi.list({ status: statusFilter !== 'all' ? statusFilter : undefined }),
  })

  const filteredTransfers = transfers.filter((t: StockTransfer) =>
    t.transfer_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.from_location_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.to_location_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const statusCounts = {
    pending: transfers.filter((t: StockTransfer) => t.status === 'pending' || t.status === 'draft').length,
    in_transit: transfers.filter((t: StockTransfer) => t.status === 'in_transit').length,
    completed: transfers.filter((t: StockTransfer) => t.status === 'completed').length,
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <TransferStatCard
          label="Pending Transfers"
          count={statusCounts.pending}
          icon={<Clock className="h-5 w-5 text-yellow-500" />}
          color="yellow"
          active={statusFilter === 'pending'}
          onClick={() => setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending')}
        />
        <TransferStatCard
          label="In Transit"
          count={statusCounts.in_transit}
          icon={<Truck className="h-5 w-5 text-blue-500" />}
          color="blue"
          active={statusFilter === 'in_transit'}
          onClick={() => setStatusFilter(statusFilter === 'in_transit' ? 'all' : 'in_transit')}
        />
        <TransferStatCard
          label="Completed"
          count={statusCounts.completed}
          icon={<CheckCircle className="h-5 w-5 text-green-500" />}
          color="green"
          active={statusFilter === 'completed'}
          onClick={() => setStatusFilter(statusFilter === 'completed' ? 'all' : 'completed')}
        />
        <TransferStatCard
          label="Total Transfers"
          count={transfers.length}
          icon={<ArrowRightLeft className="h-5 w-5 text-gray-500" />}
          color="gray"
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search transfers..."
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
          New Transfer
        </button>
      </div>

      {/* Transfers List */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : filteredTransfers.length === 0 ? (
          <div className="p-8 text-center">
            <ArrowRightLeft className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500">No stock transfers found</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-2 text-blue-600 hover:underline"
            >
              Create a new transfer
            </button>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transfer #</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">From → To</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Items</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Priority</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Requested</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredTransfers.map((transfer: StockTransfer) => (
                <tr key={transfer.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <span className="font-medium text-blue-600">{transfer.transfer_number}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{transfer.from_location_name}</span>
                      <ArrowRightLeft className="h-4 w-4 text-gray-400" />
                      <span className="text-sm">{transfer.to_location_name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center text-sm">
                    {formatNumber(transfer.total_items)} items
                    <span className="text-gray-400 ml-1">
                      ({formatNumber(transfer.total_quantity)} units)
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={cn('capitalize font-medium', priorityColors[transfer.priority])}>
                      {transfer.priority}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={cn(
                      'px-2 py-1 text-xs font-medium rounded-full capitalize',
                      statusColors[transfer.status]
                    )}>
                      {transfer.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDate(transfer.requested_date)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => setSelectedTransfer(transfer)}
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

      {/* Modals */}
      {showCreate && (
        <CreateTransferModal
          onClose={() => setShowCreate(false)}
          onCreated={(transfer) => {
            setShowCreate(false)
            setSelectedTransfer(transfer)
          }}
        />
      )}

      {selectedTransfer && (
        <TransferDetailModal
          transfer={selectedTransfer}
          onClose={() => setSelectedTransfer(null)}
        />
      )}
    </div>
  )
}
