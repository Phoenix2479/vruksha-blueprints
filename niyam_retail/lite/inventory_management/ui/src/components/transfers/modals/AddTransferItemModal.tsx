import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Loader2 } from 'lucide-react'
import { transfersApi, productsApi } from '@/lib/api'
import { formatNumber } from '@/lib/utils'

interface AddTransferItemModalProps {
  transferId: string
  onClose: () => void
}

export default function AddTransferItemModal({ transferId, onClose }: AddTransferItemModalProps) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    product_id: '',
    requested_quantity: 0,
    batch_number: '',
  })

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsApi.list(),
  })

  const addMutation = useMutation({
    mutationFn: (data: any) => transfersApi.addItem(transferId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfer', transferId] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md m-4">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="font-semibold">Add Transfer Item</h3>
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product *</label>
            <select
              required
              value={formData.product_id}
              onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
            <input
              type="number"
              min="1"
              required
              value={formData.requested_quantity}
              onChange={(e) => setFormData({ ...formData, requested_quantity: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Batch Number</label>
            <input
              type="text"
              value={formData.batch_number}
              onChange={(e) => setFormData({ ...formData, batch_number: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Optional"
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
              Add Item
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
