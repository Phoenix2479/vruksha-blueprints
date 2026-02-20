import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@shared/components/ui'
import { Upload, Check, Loader2, AlertCircle } from 'lucide-react'
import { importApi } from '@/lib/api'
import UploadTab from './UploadTab'
import PreviewTab from './PreviewTab'
import ConfigureTab from './ConfigureTab'
import { 
  type ParsedProduct, 
  type SKUConfig, 
  type BarcodeConfig,
  defaultSKUConfig,
  defaultBarcodeConfig 
} from './types'

interface ImportModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function ImportModal({ open, onClose, onSuccess }: ImportModalProps) {
  const [activeTab, setActiveTab] = useState<'upload' | 'preview' | 'configure'>('upload')
  const [uploadType, setUploadType] = useState<'csv' | 'pdf' | 'image'>('csv')
  const [files, setFiles] = useState<File[]>([])
  const [parsedProducts, setParsedProducts] = useState<ParsedProduct[]>([])
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  const [skuConfig, setSkuConfig] = useState<SKUConfig>(defaultSKUConfig)
  const [barcodeConfig, setBarcodeConfig] = useState<BarcodeConfig>(defaultBarcodeConfig)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  // Create import session
  const createSession = useMutation({
    mutationFn: importApi.createSession,
    onSuccess: (data) => {
      setSessionId(data.session_id)
    },
  })

  // Upload files
  const uploadFiles = useMutation({
    mutationFn: ({ sessionId, files }: { sessionId: string; files: File[] }) =>
      importApi.uploadFiles(sessionId, files),
    onSuccess: (data) => {
      if (data.parsed_rows) {
        const products = data.parsed_rows.map((row: any, index: number) => ({
          id: `import-${index}`,
          name: row.name || row.product_name || row.item || '',
          sku: row.sku || row.SKU || '',
          barcode: row.barcode || row.Barcode || row.EAN || '',
          quantity: parseFloat(row.quantity || row.qty || row.stock || '0'),
          unit_price: parseFloat(row.price || row.unit_price || row.cost || '0'),
          category: row.category || '',
          description: row.description || '',
          _source: data.source_type,
          _confidence: row._confidence,
          _errors: row._errors,
        }))
        setParsedProducts(products)
        setSelectedProducts(new Set(products.map((p: ParsedProduct) => p.id)))
        setActiveTab('preview')
      }
    },
    onError: (error: any) => {
      setParseError(error.message || 'Failed to parse file')
    },
  })

  // Commit import
  const commitImport = useMutation({
    mutationFn: ({ sessionId, products, config }: { 
      sessionId: string
      products: ParsedProduct[]
      config: { sku: SKUConfig; barcode: BarcodeConfig }
    }) => importApi.commitImport(sessionId, {
      strategy: 'upsert',
      rows: products,
      auto_sku: config.sku,
      auto_barcode: config.barcode,
    }),
    onSuccess: () => {
      onSuccess()
      handleClose()
    },
  })

  const handleClose = () => {
    setFiles([])
    setParsedProducts([])
    setSelectedProducts(new Set())
    setSkuConfig(defaultSKUConfig)
    setBarcodeConfig(defaultBarcodeConfig)
    setSessionId(null)
    setParseError(null)
    setActiveTab('upload')
    onClose()
  }

  const handleUpload = async () => {
    if (files.length === 0) return
    setParseError(null)
    const session = await createSession.mutateAsync()
    if (session.session_id) {
      await uploadFiles.mutateAsync({ sessionId: session.session_id, files })
    }
  }

  const handleImport = () => {
    if (!sessionId) return
    const selectedItems = parsedProducts.filter(p => selectedProducts.has(p.id))
    commitImport.mutate({
      sessionId,
      products: selectedItems,
      config: { sku: skuConfig, barcode: barcodeConfig },
    })
  }

  const isLoading = createSession.isPending || uploadFiles.isPending || commitImport.isPending

  return (
    <Dialog open={open} onOpenChange={() => !isLoading && handleClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Products
          </DialogTitle>
          <DialogDescription>
            Upload CSV files, scanned invoices (PDF), or images to import products
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload" disabled={isLoading}>
              1. Upload
            </TabsTrigger>
            <TabsTrigger value="preview" disabled={parsedProducts.length === 0 || isLoading}>
              2. Preview ({parsedProducts.length})
            </TabsTrigger>
            <TabsTrigger value="configure" disabled={parsedProducts.length === 0 || isLoading}>
              3. Configure
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="flex-1 mt-4">
            <UploadTab
              uploadType={uploadType}
              setUploadType={setUploadType}
              files={files}
              setFiles={setFiles}
            />
            {parseError && (
              <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                  <AlertCircle className="h-5 w-5" />
                  <p>{parseError}</p>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="preview" className="flex-1 flex flex-col min-h-0 mt-4">
            <PreviewTab
              parsedProducts={parsedProducts}
              selectedProducts={selectedProducts}
              setSelectedProducts={setSelectedProducts}
              uploadType={uploadType}
              skuConfig={skuConfig}
              barcodeConfig={barcodeConfig}
            />
          </TabsContent>

          <TabsContent value="configure" className="flex-1 mt-4 overflow-auto">
            <ConfigureTab
              skuConfig={skuConfig}
              setSkuConfig={setSkuConfig}
              barcodeConfig={barcodeConfig}
              setBarcodeConfig={setBarcodeConfig}
              parsedProducts={parsedProducts}
              selectedProducts={selectedProducts}
            />
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          
          {activeTab === 'upload' && (
            <Button onClick={handleUpload} disabled={files.length === 0 || isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload & Parse
                </>
              )}
            </Button>
          )}
          
          {activeTab === 'preview' && (
            <Button onClick={() => setActiveTab('configure')} disabled={selectedProducts.size === 0}>
              Continue to Configure
            </Button>
          )}
          
          {activeTab === 'configure' && (
            <Button onClick={handleImport} disabled={selectedProducts.size === 0 || isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Import {selectedProducts.size} Products
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
