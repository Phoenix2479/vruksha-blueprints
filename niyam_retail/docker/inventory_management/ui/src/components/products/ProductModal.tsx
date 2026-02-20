import { useState } from 'react'
import type { Product } from '@/types/inventory'
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
} from '@shared/components/ui'
import { Loader2 } from 'lucide-react'

interface ProductModalProps {
  product: Product | null
  onClose: () => void
  onSave: (data: Partial<Product>) => void
  isLoading: boolean
}

export default function ProductModal({
  product,
  onClose,
  onSave,
  isLoading,
}: ProductModalProps) {
  const [formData, setFormData] = useState({
    name: product?.name || '',
    sku: product?.sku || '',
    description: product?.description || '',
    unit_price: product?.unit_price || 0,
    cost_price: product?.cost_price || 0,
    tax_rate: (product as any)?.tax_rate || 18,
    quantity: product?.quantity || 0,
    reorder_level: product?.reorder_level || 10,
    location: product?.location || '',
    barcode: product?.barcode || '',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(formData)
  }

  const updateField = <K extends keyof typeof formData>(
    field: K, 
    value: typeof formData[K]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? 'Edit Product' : 'Add Product'}</DialogTitle>
          <DialogDescription>
            {product ? 'Update product details' : 'Add a new product to your inventory'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Product Name *</Label>
              <Input
                required
                value={formData.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="Product name"
              />
            </div>
            <div>
              <Label>SKU *</Label>
              <Input
                required
                value={formData.sku}
                onChange={(e) => updateField('sku', e.target.value)}
                placeholder="SKU-001"
              />
            </div>
            <div>
              <Label>Barcode</Label>
              <Input
                value={formData.barcode}
                onChange={(e) => updateField('barcode', e.target.value)}
                placeholder="Barcode"
              />
            </div>
            <div>
              <Label>Selling Price *</Label>
              <Input
                type="number"
                required
                min="0"
                step="0.01"
                value={formData.unit_price}
                onChange={(e) => updateField('unit_price', parseFloat(e.target.value))}
              />
            </div>
            <div>
              <Label>Cost Price</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={formData.cost_price}
                onChange={(e) => updateField('cost_price', parseFloat(e.target.value))}
              />
            </div>
            <div>
              <Label>Initial Quantity</Label>
              <Input
                type="number"
                min="0"
                value={formData.quantity}
                onChange={(e) => updateField('quantity', parseInt(e.target.value))}
                disabled={!!product}
              />
            </div>
            <div>
              <Label>Reorder Level</Label>
              <Input
                type="number"
                min="0"
                value={formData.reorder_level}
                onChange={(e) => updateField('reorder_level', parseInt(e.target.value))}
              />
            </div>
            <div className="col-span-2">
              <Label>Location</Label>
              <Input
                value={formData.location}
                onChange={(e) => updateField('location', e.target.value)}
                placeholder="e.g., Warehouse A, Shelf 3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {product ? 'Update' : 'Create'} Product
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
