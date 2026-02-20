import { useState, useEffect, useRef } from 'react'
import type { LabelTemplate, Product } from '@/types/barcode'
import {
  renderLabelToCanvas,
  generatePDF,
  downloadPDF,
  browserPrint,
  generatePrintHTML,
  calculateLabelsPerPage,
  DEFAULT_PRINT_OPTIONS,
  PAGE_SIZES,
  type PrintOptions,
} from '@/lib/print-manager'
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Separator,
  Badge,
  Card,
  CardContent,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@shared/components/ui'
import { Printer, Download, FileText, Settings, Eye, Loader2 } from 'lucide-react'

interface PrintPreviewProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: LabelTemplate
  products: Product[]
  onPrintComplete?: () => void
}

export default function PrintPreview({
  open,
  onOpenChange,
  template,
  products,
  onPrintComplete,
}: PrintPreviewProps) {
  const [options, setOptions] = useState<PrintOptions>(DEFAULT_PRINT_OPTIONS)
  const [previewImages, setPreviewImages] = useState<string[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const [activeTab, setActiveTab] = useState<'preview' | 'settings'>('preview')
  const previewRef = useRef<HTMLDivElement>(null)

  const labelsPerPage = calculateLabelsPerPage(template.size, options)
  const totalLabels = products.length * options.copies
  const totalPages = Math.ceil(totalLabels / labelsPerPage.total)

  // Generate preview images
  useEffect(() => {
    if (!open || products.length === 0) return

    const generatePreviews = async () => {
      setIsGenerating(true)
      const images: string[] = []

      // Generate preview for first few products (max 6)
      const previewProducts = products.slice(0, Math.min(6, products.length))
      
      for (const product of previewProducts) {
        const canvas = await renderLabelToCanvas(template, product, 2)
        images.push(canvas.toDataURL('image/png'))
      }

      setPreviewImages(images)
      setIsGenerating(false)
    }

    generatePreviews()
  }, [open, template, products])

  const handlePrint = async () => {
    setIsPrinting(true)
    try {
      const html = generatePrintHTML(template, products, options)
      browserPrint(html)
      onPrintComplete?.()
    } catch (error) {
      console.error('Print error:', error)
    } finally {
      setIsPrinting(false)
    }
  }

  const handleDownloadPDF = async () => {
    setIsPrinting(true)
    try {
      const filename = `labels-${template.name.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`
      await downloadPDF(template, products, options, filename)
      onPrintComplete?.()
    } catch (error) {
      console.error('PDF error:', error)
    } finally {
      setIsPrinting(false)
    }
  }

  const updateOption = <K extends keyof PrintOptions>(key: K, value: PrintOptions[K]) => {
    setOptions(prev => ({ ...prev, [key]: value }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Print Preview
          </DialogTitle>
          <DialogDescription>
            Preview and configure print settings for {products.length} product{products.length !== 1 ? 's' : ''}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'preview' | 'settings')} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid grid-cols-2 w-60">
            <TabsTrigger value="preview">
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Preview Tab */}
          <TabsContent value="preview" className="flex-1 overflow-auto mt-4">
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold">{products.length}</p>
                    <p className="text-xs text-muted-foreground">Products</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold">×{options.copies}</p>
                    <p className="text-xs text-muted-foreground">Copies</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-primary">{totalLabels}</p>
                    <p className="text-xs text-muted-foreground">Total Labels</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold">{totalPages}</p>
                    <p className="text-xs text-muted-foreground">Pages</p>
                  </CardContent>
                </Card>
              </div>

              {/* Label Previews */}
              <div ref={previewRef} className="bg-gray-100 rounded-lg p-4 min-h-[300px]">
                {isGenerating ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-4">
                    {previewImages.map((img, i) => (
                      <div key={i} className="bg-white shadow-sm rounded p-2">
                        <img 
                          src={img} 
                          alt={`Label preview ${i + 1}`}
                          className="w-full h-auto"
                        />
                        <p className="text-xs text-muted-foreground text-center mt-1">
                          {products[i]?.name}
                        </p>
                      </div>
                    ))}
                    {products.length > 6 && (
                      <div className="flex items-center justify-center bg-muted rounded p-4">
                        <p className="text-sm text-muted-foreground">
                          +{products.length - 6} more labels
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Template Info */}
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{template.name}</span>
                  <Badge variant="outline">
                    {template.size.width}×{template.size.height}mm
                  </Badge>
                </div>
                <span className="text-muted-foreground">
                  {labelsPerPage.cols}×{labelsPerPage.rows} labels per {options.pageSize} page
                </span>
              </div>
            </div>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="flex-1 overflow-auto mt-4">
            <div className="grid grid-cols-2 gap-6">
              {/* Print Settings */}
              <div className="space-y-4">
                <h3 className="font-medium">Print Settings</h3>
                
                <div className="space-y-2">
                  <Label>Copies per product</Label>
                  <Input
                    type="number"
                    value={options.copies}
                    onChange={(e) => updateOption('copies', Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                    min={1}
                    max={100}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Page Size</Label>
                  <Select value={options.pageSize} onValueChange={(v) => updateOption('pageSize', v as PrintOptions['pageSize'])}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A4">A4 (210×297mm)</SelectItem>
                      <SelectItem value="Letter">Letter (216×279mm)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Orientation</Label>
                  <Select value={options.orientation} onValueChange={(v) => updateOption('orientation', v as PrintOptions['orientation'])}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="portrait">Portrait</SelectItem>
                      <SelectItem value="landscape">Landscape</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Layout Settings */}
              <div className="space-y-4">
                <h3 className="font-medium">Layout Settings</h3>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Top Margin (mm)</Label>
                    <Input
                      type="number"
                      value={options.marginTop}
                      onChange={(e) => updateOption('marginTop', Math.max(0, parseFloat(e.target.value) || 0))}
                      min={0}
                      step={0.5}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Left Margin (mm)</Label>
                    <Input
                      type="number"
                      value={options.marginLeft}
                      onChange={(e) => updateOption('marginLeft', Math.max(0, parseFloat(e.target.value) || 0))}
                      min={0}
                      step={0.5}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Horizontal Gap (mm)</Label>
                    <Input
                      type="number"
                      value={options.gapHorizontal}
                      onChange={(e) => updateOption('gapHorizontal', Math.max(0, parseFloat(e.target.value) || 0))}
                      min={0}
                      step={0.5}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Vertical Gap (mm)</Label>
                    <Input
                      type="number"
                      value={options.gapVertical}
                      onChange={(e) => updateOption('gapVertical', Math.max(0, parseFloat(e.target.value) || 0))}
                      min={0}
                      step={0.5}
                    />
                  </div>
                </div>

                {/* Calculated Layout */}
                <Card className="bg-muted/50">
                  <CardContent className="p-3">
                    <p className="text-sm font-medium mb-2">Calculated Layout</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>Labels per row: <span className="font-mono">{labelsPerPage.cols}</span></div>
                      <div>Rows per page: <span className="font-mono">{labelsPerPage.rows}</span></div>
                      <div>Labels per page: <span className="font-mono">{labelsPerPage.total}</span></div>
                      <div>Total pages: <span className="font-mono">{totalPages}</span></div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <Separator className="my-4" />

        <DialogFooter className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Total: {totalLabels} labels on {totalPages} page{totalPages !== 1 ? 's' : ''}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={handleDownloadPDF} disabled={isPrinting}>
              {isPrinting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
              Download PDF
            </Button>
            <Button onClick={handlePrint} disabled={isPrinting}>
              {isPrinting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Printer className="h-4 w-4 mr-2" />}
              Print
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
