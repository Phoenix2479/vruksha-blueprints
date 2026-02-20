import { Input, Label, Checkbox, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui'
import { Hash, Barcode } from 'lucide-react'
import type { SKUConfig, BarcodeConfig, ParsedProduct } from './types'

interface ConfigureTabProps {
  skuConfig: SKUConfig
  setSkuConfig: (config: SKUConfig) => void
  barcodeConfig: BarcodeConfig
  setBarcodeConfig: (config: BarcodeConfig) => void
  parsedProducts: ParsedProduct[]
  selectedProducts: Set<string>
}

export default function ConfigureTab({
  skuConfig,
  setSkuConfig,
  barcodeConfig,
  setBarcodeConfig,
  parsedProducts,
  selectedProducts,
}: ConfigureTabProps) {

  const generatePreviewSKU = (): string => {
    const num = skuConfig.startNumber.toString().padStart(skuConfig.digits, '0')
    const cat = skuConfig.includeCategory ? `ELE${skuConfig.separator}` : ''
    return `${skuConfig.prefix}${skuConfig.separator}${cat}${num}`
  }

  const generatePreviewBarcode = (): string => {
    const num = barcodeConfig.startNumber
    const prefix = barcodeConfig.prefix || '200'
    switch (barcodeConfig.format) {
      case 'EAN13':
        return `${prefix}${num.toString().padStart(12 - prefix.length, '0')}`
      case 'EAN8':
        return `${prefix}${num.toString().padStart(7 - prefix.length, '0')}`
      case 'UPC':
        return `${prefix}${num.toString().padStart(11 - prefix.length, '0')}`
      default:
        return `${prefix}${num.toString().padStart(6, '0')}`
    }
  }

  return (
    <div className="space-y-6 overflow-auto">
      {/* Auto SKU Configuration */}
      <div className="border rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
              <Hash className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold">Auto-Generate SKU</h3>
              <p className="text-sm text-muted-foreground">
                Automatically create SKU codes for products without one
              </p>
            </div>
          </div>
          <Checkbox
            checked={skuConfig.enabled}
            onCheckedChange={(checked) => 
              setSkuConfig({ ...skuConfig, enabled: checked as boolean })
            }
          />
        </div>

        {skuConfig.enabled && (
          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div className="space-y-2">
              <Label>Prefix</Label>
              <Input
                value={skuConfig.prefix}
                onChange={(e) => setSkuConfig({ ...skuConfig, prefix: e.target.value })}
                placeholder="e.g., SKU, PRD"
              />
            </div>
            <div className="space-y-2">
              <Label>Separator</Label>
              <Select
                value={skuConfig.separator}
                onValueChange={(v) => setSkuConfig({ ...skuConfig, separator: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="-">Dash (-)</SelectItem>
                  <SelectItem value="_">Underscore (_)</SelectItem>
                  <SelectItem value="">None</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Number of Digits</Label>
              <Select
                value={skuConfig.digits.toString()}
                onValueChange={(v) => setSkuConfig({ ...skuConfig, digits: parseInt(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 digits (001)</SelectItem>
                  <SelectItem value="4">4 digits (0001)</SelectItem>
                  <SelectItem value="5">5 digits (00001)</SelectItem>
                  <SelectItem value="6">6 digits (000001)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Start Number</Label>
              <Input
                type="number"
                min="1"
                value={skuConfig.startNumber}
                onChange={(e) => setSkuConfig({ ...skuConfig, startNumber: parseInt(e.target.value) || 1 })}
              />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <Checkbox
                id="includeCategory"
                checked={skuConfig.includeCategory}
                onCheckedChange={(checked) => 
                  setSkuConfig({ ...skuConfig, includeCategory: checked as boolean })
                }
              />
              <Label htmlFor="includeCategory" className="text-sm">
                Include category prefix in SKU
              </Label>
            </div>
            <div className="col-span-2 p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                Preview: <span className="font-mono font-medium text-foreground">
                  {generatePreviewSKU()}
                </span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Auto Barcode Configuration */}
      <div className="border rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
              <Barcode className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold">Auto-Generate Barcode</h3>
              <p className="text-sm text-muted-foreground">
                Automatically create barcode numbers for products without one
              </p>
            </div>
          </div>
          <Checkbox
            checked={barcodeConfig.enabled}
            onCheckedChange={(checked) => 
              setBarcodeConfig({ ...barcodeConfig, enabled: checked as boolean })
            }
          />
        </div>

        {barcodeConfig.enabled && (
          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div className="space-y-2">
              <Label>Barcode Format</Label>
              <Select
                value={barcodeConfig.format}
                onValueChange={(v) => setBarcodeConfig({ ...barcodeConfig, format: v as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EAN13">EAN-13 (International)</SelectItem>
                  <SelectItem value="EAN8">EAN-8 (Short)</SelectItem>
                  <SelectItem value="UPC">UPC-A (US/Canada)</SelectItem>
                  <SelectItem value="CODE128">Code 128 (Alphanumeric)</SelectItem>
                  <SelectItem value="CODE39">Code 39 (Legacy)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Prefix (Company/Store Code)</Label>
              <Input
                value={barcodeConfig.prefix}
                onChange={(e) => setBarcodeConfig({ ...barcodeConfig, prefix: e.target.value })}
                placeholder="e.g., 200 for in-store"
                maxLength={barcodeConfig.format === 'EAN8' ? 3 : 4}
              />
              <p className="text-xs text-muted-foreground">
                {barcodeConfig.format === 'EAN13' && 'Prefix 200-299 is reserved for in-store use'}
                {barcodeConfig.format === 'EAN8' && 'Use 0-2 for in-store barcodes'}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Start Number</Label>
              <Input
                type="number"
                min="1"
                value={barcodeConfig.startNumber}
                onChange={(e) => setBarcodeConfig({ ...barcodeConfig, startNumber: parseInt(e.target.value) || 1 })}
              />
            </div>
            <div className="space-y-2">
              <Label>Format Info</Label>
              <p className="text-sm text-muted-foreground">
                {barcodeConfig.format === 'EAN13' && '13 digits total (12 + check digit)'}
                {barcodeConfig.format === 'EAN8' && '8 digits total (7 + check digit)'}
                {barcodeConfig.format === 'UPC' && '12 digits total (11 + check digit)'}
                {barcodeConfig.format === 'CODE128' && 'Variable length, alphanumeric'}
                {barcodeConfig.format === 'CODE39' && 'Variable length, uppercase + numbers'}
              </p>
            </div>
            <div className="col-span-2 p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                Preview: <span className="font-mono font-medium text-foreground">
                  {generatePreviewBarcode()}
                </span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-medium mb-2">Import Summary</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• {selectedProducts.size} products will be imported</li>
          <li>• {parsedProducts.filter(p => !p.sku && skuConfig.enabled).length} SKUs will be auto-generated</li>
          <li>• {parsedProducts.filter(p => !p.barcode && barcodeConfig.enabled).length} barcodes will be auto-generated</li>
        </ul>
      </div>
    </div>
  )
}
