import { Label, Checkbox, Badge, ScrollArea } from '@shared/components/ui'
import { Check, AlertCircle, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ParsedProduct, SKUConfig, BarcodeConfig } from './types'

interface PreviewTabProps {
  parsedProducts: ParsedProduct[]
  selectedProducts: Set<string>
  setSelectedProducts: (selected: Set<string>) => void
  uploadType: 'csv' | 'pdf' | 'image'
  skuConfig: SKUConfig
  barcodeConfig: BarcodeConfig
}

export default function PreviewTab({
  parsedProducts,
  selectedProducts,
  setSelectedProducts,
  uploadType,
  skuConfig,
  barcodeConfig,
}: PreviewTabProps) {
  
  const toggleSelectAll = () => {
    if (selectedProducts.size === parsedProducts.length) {
      setSelectedProducts(new Set())
    } else {
      setSelectedProducts(new Set(parsedProducts.map(p => p.id)))
    }
  }

  const toggleProduct = (id: string) => {
    const newSelected = new Set(selectedProducts)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedProducts(newSelected)
  }

  const generatePreviewSKU = (index: number, product: ParsedProduct): string => {
    if (!skuConfig.enabled) return product.sku || ''
    if (product.sku) return product.sku
    
    const num = (skuConfig.startNumber + index).toString().padStart(skuConfig.digits, '0')
    const cat = skuConfig.includeCategory && product.category 
      ? `${product.category.substring(0, 3).toUpperCase()}${skuConfig.separator}` 
      : ''
    return `${skuConfig.prefix}${skuConfig.separator}${cat}${num}`
  }

  const generatePreviewBarcode = (index: number, product: ParsedProduct): string => {
    if (!barcodeConfig.enabled) return product.barcode || ''
    if (product.barcode) return product.barcode
    
    const num = barcodeConfig.startNumber + index
    switch (barcodeConfig.format) {
      case 'EAN13':
        return `${barcodeConfig.prefix}${num.toString().padStart(9, '0')}0`
      case 'EAN8':
        return `${barcodeConfig.prefix}${num.toString().padStart(4, '0')}0`
      case 'UPC':
        return `${barcodeConfig.prefix}${num.toString().padStart(8, '0')}0`
      default:
        return `${barcodeConfig.prefix}${num.toString().padStart(6, '0')}`
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id="selectAll"
            checked={selectedProducts.size === parsedProducts.length}
            onCheckedChange={toggleSelectAll}
          />
          <Label htmlFor="selectAll" className="text-sm">
            Select all ({selectedProducts.size}/{parsedProducts.length})
          </Label>
        </div>
        <Badge variant="outline">
          {uploadType === 'csv' ? 'From CSV' : uploadType === 'pdf' ? 'From PDF (OCR)' : 'From Image (OCR)'}
        </Badge>
      </div>

      <ScrollArea className="flex-1 border rounded-lg">
        <table className="w-full">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              <th className="p-3 text-left w-10"></th>
              <th className="p-3 text-left">Product Name</th>
              <th className="p-3 text-left">SKU</th>
              <th className="p-3 text-left">Barcode</th>
              <th className="p-3 text-right">Qty</th>
              <th className="p-3 text-right">Price</th>
              <th className="p-3 text-left">Category</th>
              <th className="p-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {parsedProducts.map((product, index) => (
              <tr 
                key={product.id}
                className={cn(
                  "border-b hover:bg-muted/50 transition-colors",
                  !selectedProducts.has(product.id) && "opacity-50"
                )}
              >
                <td className="p-3">
                  <Checkbox
                    checked={selectedProducts.has(product.id)}
                    onCheckedChange={() => toggleProduct(product.id)}
                  />
                </td>
                <td className="p-3 font-medium">{product.name || '—'}</td>
                <td className="p-3 text-muted-foreground font-mono text-sm">
                  {product.sku || (skuConfig.enabled ? (
                    <span className="text-green-600">{generatePreviewSKU(index, product)}</span>
                  ) : '—')}
                </td>
                <td className="p-3 text-muted-foreground font-mono text-sm">
                  {product.barcode || (barcodeConfig.enabled ? (
                    <span className="text-green-600">{generatePreviewBarcode(index, product)}</span>
                  ) : '—')}
                </td>
                <td className="p-3 text-right">{product.quantity ?? '—'}</td>
                <td className="p-3 text-right">
                  {product.unit_price ? `₹${product.unit_price.toFixed(2)}` : '—'}
                </td>
                <td className="p-3 text-muted-foreground">{product.category || '—'}</td>
                <td className="p-3 text-center">
                  {product._errors && product._errors.length > 0 ? (
                    <Badge variant="destructive" className="text-xs">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Error
                    </Badge>
                  ) : product._confidence && product._confidence < 0.8 ? (
                    <Badge variant="secondary" className="text-xs">
                      <Eye className="h-3 w-3 mr-1" />
                      Review
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-green-600">
                      <Check className="h-3 w-3 mr-1" />
                      OK
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  )
}
