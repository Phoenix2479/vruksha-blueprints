import { useState } from 'react'
import type { Product, StockAdjustmentReason } from '@/types/inventory'
import { formatNumber, cn } from '@/lib/utils'
import {
  Button,
  Input,
  Label,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui'
import { Loader2 } from 'lucide-react'

interface AdjustStockModalProps {
  product: Product
  onClose: () => void
  onSave: (data: { 
    product_id: string
    quantity_change: number
    reason: string
    notes?: string 
  }) => void
  isLoading: boolean
}

const ADJUSTMENT_REASONS: { value: StockAdjustmentReason; label: string }[] = [
  { value: 'purchase', label: 'Purchase / Receiving' },
  { value: 'sale', label: 'Sale' },
  { value: 'return', label: 'Customer Return' },
  { value: 'damage', label: 'Damaged Goods' },
  { value: 'theft', label: 'Theft / Loss' },
  { value: 'correction', label: 'Inventory Correction' },
  { value: 'transfer_in', label: 'Transfer In' },
  { value: 'transfer_out', label: 'Transfer Out' },
  { value: 'expired', label: 'Expired' },
]

export default function AdjustStockModal({
  product,
  onClose,
  onSave,
  isLoading,
}: AdjustStockModalProps) {
  const [formData, setFormData] = useState({
    quantity_change: 0,
    reason: 'correction' as StockAdjustmentReason,
    notes: '',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      product_id: product.id,
      ...formData,
    })
  }

  const newQuantity = product.quantity + formData.quantity_change

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust Stock</DialogTitle>
          <DialogDescription>
            Adjust inventory quantity for {product.name}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-muted rounded-lg p-4">
            <p className="font-medium">{product.name}</p>
            <p className="text-sm text-muted-foreground">SKU: {product.sku}</p>
            <p className="text-sm text-muted-foreground">
              Current Stock: {formatNumber(product.quantity)}
            </p>
          </div>

          <div>
            <Label>Reason *</Label>
            <Select
              value={formData.reason}
              onValueChange={(value) => 
                setFormData(prev => ({ ...prev, reason: value as StockAdjustmentReason }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADJUSTMENT_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Quantity Change *</Label>
            <Input
              type="number"
              required
              value={formData.quantity_change}
              onChange={(e) => 
                setFormData(prev => ({ 
                  ...prev, 
                  quantity_change: parseInt(e.target.value) || 0 
                }))
              }
              placeholder="e.g., +10 or -5"
            />
            <p className={cn(
              'text-sm mt-1',
              newQuantity < 0 ? 'text-destructive' : 'text-muted-foreground'
            )}>
              New quantity will be: {formatNumber(newQuantity)}
              {newQuantity < 0 && ' (Warning: Negative stock!)'}
            </p>
          </div>

          <div>
            <Label>Notes</Label>
            <Input
              value={formData.notes}
              onChange={(e) => 
                setFormData(prev => ({ ...prev, notes: e.target.value }))
              }
              placeholder="Optional notes..."
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isLoading || formData.quantity_change === 0}
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Apply Adjustment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
