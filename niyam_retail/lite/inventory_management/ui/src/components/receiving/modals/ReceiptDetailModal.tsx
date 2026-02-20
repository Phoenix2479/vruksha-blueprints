import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Plus, CheckCircle, Package, Loader2 } from 'lucide-react'
import { receivingApi } from '@/lib/api'
import { formatCurrency, formatNumber, formatDate, cn } from '@/lib/utils'
import type { GoodsReceipt, GoodsReceiptItem } from '@/types/inventory'
import AddItemModal from './AddItemModal'

interface ReceiptDetailModalProps {
  receipt: GoodsReceipt
  onClose: () => void
}

const inspectionColors: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  passed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  partial: 'bg-yellow-100 text-yellow-700',
}

export default function ReceiptDetailModal({ receipt, onClose }: ReceiptDetailModalProps) {
  const queryClient = useQueryClient()
  const [showAddItem, setShowAddItem] = useState(false)

  const { data: receiptDetails } = useQuery({
    queryKey: ['receiving', receipt.id],
    queryFn: () => receivingApi.get(receipt.id),
  })

  const items: GoodsReceiptItem[] = receiptDetails?.items || []

  const completeMutation = useMutation({
    mutationFn: receivingApi.complete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receiving'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl m-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{receipt.grn_number}</h2>
            <p className="text-sm text-gray-500">
              {receipt.supplier_name && `${receipt.supplier_name} • `}
              {formatDate(receipt.receipt_date)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {(receipt.status === 'draft' || receipt.status === 'pending_inspection') && (
              <>
                <button
                  onClick={() => setShowAddItem(true)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Item
                </button>
                <button
                  onClick={() => completeMutation.mutate(receipt.id)}
                  disabled={completeMutation.isPending || items.length === 0}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {completeMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  <CheckCircle className="h-4 w-4" />
                  Complete Receipt
                </button>
              </>
            )}
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="px-6 py-3 bg-gray-50 border-b grid grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500">PO Number</p>
            <p className="font-medium">{receipt.po_number || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Location</p>
            <p className="font-medium">{receipt.location_name || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Items</p>
            <p className="font-medium">{formatNumber(receipt.total_items)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Value</p>
            <p className="font-medium">{formatCurrency(receipt.total_value)}</p>
          </div>
        </div>

        {/* Items Table */}
        <div className="flex-1 overflow-auto">
          {items.length === 0 ? (
            <div className="p-8 text-center">
              <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500">No items added yet</p>
              <button
                onClick={() => setShowAddItem(true)}
                className="mt-2 text-blue-600 hover:underline"
              >
                Add items to this receipt
              </button>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ordered</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Received</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Rejected</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Unit Cost</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Inspection</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch/Expiry</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium">{item.product_name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{item.sku}</td>
                    <td className="px-6 py-4 text-right">{formatNumber(item.ordered_quantity)}</td>
                    <td className="px-6 py-4 text-right font-medium text-green-600">
                      {formatNumber(item.received_quantity)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {item.rejected_quantity > 0 ? (
                        <span className="text-red-600">{formatNumber(item.rejected_quantity)}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">{formatCurrency(item.unit_cost)}</td>
                    <td className="px-6 py-4 text-right font-medium">{formatCurrency(item.total_cost)}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={cn(
                        'px-2 py-1 text-xs font-medium rounded-full capitalize',
                        inspectionColors[item.inspection_status]
                      )}>
                        {item.inspection_status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {item.batch_number && <span className="block">{item.batch_number}</span>}
                      {item.expiry_date && (
                        <span className="text-gray-500">{formatDate(item.expiry_date)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Add Item Modal */}
        {showAddItem && (
          <AddItemModal
            receiptId={receipt.id}
            onClose={() => setShowAddItem(false)}
          />
        )}
      </div>
    </div>
  )
}
