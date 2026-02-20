import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Loader2, Send, Download, AlertTriangle, Package } from 'lucide-react'
import { transfersApi } from '@/lib/api'
import { formatNumber, formatDate, cn } from '@/lib/utils'
import type { StockTransfer, StockTransferItem } from '@/types/inventory'
import AddTransferItemModal from './AddTransferItemModal'

interface TransferDetailModalProps {
  transfer: StockTransfer
  onClose: () => void
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  shipped: 'bg-blue-100 text-blue-700',
  received: 'bg-green-100 text-green-700',
  partial: 'bg-orange-100 text-orange-700',
}

export default function TransferDetailModal({ transfer, onClose }: TransferDetailModalProps) {
  const queryClient = useQueryClient()
  const [showAddItem, setShowAddItem] = useState(false)

  const { data: transferDetails } = useQuery({
    queryKey: ['transfer', transfer.id],
    queryFn: () => transfersApi.get(transfer.id),
  })

  const items: StockTransferItem[] = transferDetails?.items || []

  const shipMutation = useMutation({
    mutationFn: transfersApi.ship,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] })
      queryClient.invalidateQueries({ queryKey: ['transfer', transfer.id] })
    },
  })

  const receiveMutation = useMutation({
    mutationFn: transfersApi.receive,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] })
      queryClient.invalidateQueries({ queryKey: ['transfer', transfer.id] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl m-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{transfer.transfer_number}</h2>
            <p className="text-sm text-gray-500">
              {transfer.from_location_name} → {transfer.to_location_name}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {transfer.status === 'pending' && items.length > 0 && (
              <button
                onClick={() => shipMutation.mutate(transfer.id)}
                disabled={shipMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {shipMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                <Send className="h-4 w-4" />
                Ship Transfer
              </button>
            )}
            {transfer.status === 'in_transit' && (
              <button
                onClick={() => receiveMutation.mutate(transfer.id)}
                disabled={receiveMutation.isPending}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
              >
                {receiveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                <Download className="h-4 w-4" />
                Receive Transfer
              </button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Transfer Info */}
        <div className="px-6 py-3 bg-gray-50 border-b grid grid-cols-5 gap-4">
          <div>
            <p className="text-xs text-gray-500">Priority</p>
            <p className="font-medium capitalize">{transfer.priority}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Requested</p>
            <p className="font-medium">{formatDate(transfer.requested_date)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Shipped</p>
            <p className="font-medium">{transfer.shipped_date ? formatDate(transfer.shipped_date) : '-'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Received</p>
            <p className="font-medium">{transfer.received_date ? formatDate(transfer.received_date) : '-'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Status</p>
            <span className={cn(
              'px-2 py-0.5 text-xs font-medium rounded-full capitalize',
              statusColors[transfer.status] || 'bg-gray-100 text-gray-700'
            )}>
              {transfer.status.replace('_', ' ')}
            </span>
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-auto">
          {transfer.status === 'pending' && (
            <div className="p-4 border-b bg-yellow-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-yellow-800">
                  <AlertTriangle className="h-5 w-5" />
                  <span className="text-sm">Add items to this transfer before shipping</span>
                </div>
                <button
                  onClick={() => setShowAddItem(true)}
                  className="px-3 py-1.5 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700"
                >
                  Add Item
                </button>
              </div>
            </div>
          )}
          {items.length === 0 ? (
            <div className="p-8 text-center">
              <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500">No items in this transfer</p>
              {transfer.status === 'pending' && (
                <button
                  onClick={() => setShowAddItem(true)}
                  className="mt-2 text-blue-600 hover:underline"
                >
                  Add items
                </button>
              )}
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Requested</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Shipped</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Received</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium">{item.product_name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{item.sku}</td>
                    <td className="px-6 py-4 text-right">{formatNumber(item.requested_quantity)}</td>
                    <td className="px-6 py-4 text-right">
                      {item.shipped_quantity > 0 ? (
                        <span className="text-blue-600">{formatNumber(item.shipped_quantity)}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {item.received_quantity > 0 ? (
                        <span className="text-green-600">{formatNumber(item.received_quantity)}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={cn(
                        'px-2 py-1 text-xs font-medium rounded-full capitalize',
                        statusColors[item.status]
                      )}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {item.batch_number || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Add Item Modal */}
        {showAddItem && (
          <AddTransferItemModal
            transferId={transfer.id}
            onClose={() => setShowAddItem(false)}
          />
        )}
      </div>
    </div>
  )
}
