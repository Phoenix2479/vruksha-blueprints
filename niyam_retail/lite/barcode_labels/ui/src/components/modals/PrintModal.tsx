import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useBarcodeStore } from '@/store/barcodeStore'
import type { LabelTemplate, Product } from '@/types/barcode'
import { ELEMENT_TYPE_INFO } from '@/types/barcode'
import {
  Button,
  Input,
  Label,
  Card,
  CardContent,
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
  Badge,
  Separator,
  ScrollArea,
} from '@/components/ui'
import { EmptyState } from '@/components/blocks'
import { Loader2, Printer, FileText, Package, AlertCircle, CheckCircle2 } from 'lucide-react'

interface PrintModalProps {
  productIds: string[]
  onClose: () => void
  onComplete: () => void
}

export default function PrintModal({ productIds, onClose, onComplete }: PrintModalProps) {
  const queryClient = useQueryClient()
  const { defaultCopies, setDefaultCopies } = useBarcodeStore()
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [copies, setCopies] = useState(defaultCopies)
  const [printSuccess, setPrintSuccess] = useState(false)

  // Fetch templates
  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get('/api/templates').then(r => r.data),
  })

  // Fetch selected products details
  const { data: productsData } = useQuery({
    queryKey: ['products-for-print', productIds],
    queryFn: () => api.get('/api/products', { params: { limit: 500 } }).then(r => r.data),
    select: (data) => ({
      ...data,
      products: (data.products as Product[]).filter(p => productIds.includes(p.id))
    })
  })

  const templates: LabelTemplate[] = templatesData?.templates || []
  const selectedProducts: Product[] = productsData?.products || []
  const selectedTemplate = templates.find(t => t.id === selectedTemplateId)

  const totalLabels = productIds.length * copies

  const printMutation = useMutation({
    mutationFn: () =>
      api.post('/api/print-jobs', {
        template_id: selectedTemplateId,
        product_ids: productIds,
        copies_per_product: copies,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['print-jobs'] })
      setDefaultCopies(copies) // Remember for next time
      setPrintSuccess(true)
      setTimeout(() => {
        onComplete()
      }, 1500)
    },
  })

  if (printSuccess) {
    return (
      <Dialog open onOpenChange={() => onComplete()}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center justify-center py-8">
            <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
            <h3 className="text-lg font-semibold">Print Job Created!</h3>
            <p className="text-sm text-muted-foreground mt-2">
              {totalLabels} labels queued for printing
            </p>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Print Labels
          </DialogTitle>
          <DialogDescription>
            Configure and print labels for {productIds.length} selected product{productIds.length !== 1 ? 's' : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-6 py-4">
          {/* Template Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Select Template *</Label>
            {templatesLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading templates...
              </div>
            ) : templates.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="p-6">
                  <EmptyState
                    icon={FileText}
                    title="No templates available"
                    description="Create a label template first before printing"
                  />
                </CardContent>
              </Card>
            ) : (
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      <div className="flex items-center gap-2">
                        <span>{t.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {t.size.width}×{t.size.height}mm
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Template Preview */}
            {selectedTemplate && (
              <Card className="bg-muted/30">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{selectedTemplate.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {selectedTemplate.size.width}mm × {selectedTemplate.size.height}mm
                      </p>
                      {selectedTemplate.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {selectedTemplate.description}
                        </p>
                      )}
                    </div>
                    <Badge variant="secondary">
                      {selectedTemplate.elements?.filter(e => e.enabled).length || 0} elements
                    </Badge>
                  </div>
                  {/* Element list */}
                  <div className="flex flex-wrap gap-1 mt-3">
                    {selectedTemplate.elements?.filter(e => e.enabled).map(el => (
                      <Badge key={el.id} variant="outline" className="text-xs">
                        {ELEMENT_TYPE_INFO[el.type]?.label || el.type}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <Separator />

          {/* Print Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Copies per product</Label>
              <Input
                type="number"
                value={copies}
                onChange={(e) => setCopies(Math.max(1, Math.min(100, Number(e.target.value))))}
                min={1}
                max={100}
              />
              <p className="text-xs text-muted-foreground">
                Each product will get {copies} label{copies !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Summary</Label>
              <Card>
                <CardContent className="p-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>Products:</span>
                    <span className="font-medium">{productIds.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>× Copies:</span>
                    <span className="font-medium">{copies}</span>
                  </div>
                  <Separator className="my-2" />
                  <div className="flex justify-between text-sm font-semibold">
                    <span>Total labels:</span>
                    <span className="text-primary">{totalLabels}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <Separator />

          {/* Selected Products Preview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Selected Products</Label>
              <Badge variant="outline">{selectedProducts.length} products</Badge>
            </div>
            <ScrollArea className="h-[150px] rounded-md border">
              <div className="p-3 space-y-2">
                {selectedProducts.map(product => (
                  <div key={product.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{product.name}</span>
                      <span className="text-muted-foreground">({product.sku})</span>
                    </div>
                    <span>₹{product.price.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Warnings */}
          {selectedProducts.some(p => !p.barcode) && (
            <Card className="border-yellow-200 bg-yellow-50">
              <CardContent className="p-3 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-yellow-800">Some products don't have barcodes</p>
                  <p className="text-yellow-700">
                    {selectedProducts.filter(p => !p.barcode).length} product(s) will have empty barcode fields
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => printMutation.mutate()}
            disabled={!selectedTemplateId || printMutation.isPending || templates.length === 0}
          >
            {printMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Printer className="h-4 w-4 mr-2" />
            )}
            Print {totalLabels} Labels
          </Button>
        </DialogFooter>

        {printMutation.isError && (
          <p className="text-sm text-destructive text-center">
            Error: {(printMutation.error as Error)?.message || 'Failed to create print job'}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
