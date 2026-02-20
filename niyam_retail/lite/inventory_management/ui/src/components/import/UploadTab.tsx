import { useRef, useCallback } from 'react'
import { Button, Badge } from '@/components/ui'
import {
  Upload,
  FileSpreadsheet,
  FileImage,
  FileText,
  X,
  Check,
  Download,
  Wand2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface UploadTabProps {
  uploadType: 'csv' | 'pdf' | 'image'
  setUploadType: (type: 'csv' | 'pdf' | 'image') => void
  files: File[]
  setFiles: (files: File[]) => void
}

const acceptedTypes = {
  csv: '.csv,.xlsx,.xls',
  pdf: '.pdf',
  image: '.jpg,.jpeg,.png,.webp,.tiff',
}

export default function UploadTab({ uploadType, setUploadType, files, setFiles }: UploadTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    setFiles(selectedFiles)
  }, [setFiles])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const droppedFiles = Array.from(e.dataTransfer.files)
    setFiles(droppedFiles)
  }, [setFiles])

  return (
    <div className="space-y-4">
      {/* Upload Type Selection */}
      <div className="flex gap-2">
        <Button
          variant={uploadType === 'csv' ? 'default' : 'outline'}
          onClick={() => setUploadType('csv')}
          className="flex-1"
        >
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          CSV/Excel
        </Button>
        <Button
          variant={uploadType === 'pdf' ? 'default' : 'outline'}
          onClick={() => setUploadType('pdf')}
          className="flex-1"
        >
          <FileText className="h-4 w-4 mr-2" />
          PDF Invoice
        </Button>
        <Button
          variant={uploadType === 'image' ? 'default' : 'outline'}
          onClick={() => setUploadType('image')}
          className="flex-1"
        >
          <FileImage className="h-4 w-4 mr-2" />
          Scanned Image
        </Button>
      </div>

      {/* Drop Zone */}
      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
          "hover:border-primary hover:bg-primary/5 cursor-pointer",
          files.length > 0 && "border-green-500 bg-green-50 dark:bg-green-900/20"
        )}
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept={acceptedTypes[uploadType]}
          multiple={uploadType === 'csv'}
          onChange={handleFileSelect}
        />
        
        {files.length === 0 ? (
          <>
            <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">
              Drop {uploadType.toUpperCase()} files here or click to browse
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {uploadType === 'csv' && 'Supports CSV, XLSX, XLS files'}
              {uploadType === 'pdf' && 'Upload scanned invoices or bills in PDF format'}
              {uploadType === 'image' && 'Upload photos of invoices (JPG, PNG, WEBP)'}
            </p>
          </>
        ) : (
          <>
            <Check className="h-12 w-12 mx-auto text-green-500 mb-4" />
            <p className="text-lg font-medium">
              {files.length} file(s) selected
            </p>
            <div className="flex flex-wrap gap-2 justify-center mt-4">
              {files.map((file, i) => (
                <Badge key={i} variant="secondary" className="text-sm">
                  {file.name}
                  <button
                    className="ml-2 hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                      setFiles(files.filter((_, idx) => idx !== i))
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Info Box for PDF/Image */}
      {(uploadType === 'pdf' || uploadType === 'image') && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Wand2 className="h-5 w-5 text-blue-500 mt-0.5" />
            <div>
              <p className="font-medium text-blue-900 dark:text-blue-100">
                AI-Powered Extraction
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                We'll automatically extract product names, quantities, and prices from your 
                {uploadType === 'pdf' ? ' PDF invoices' : ' scanned images'} using OCR technology.
                Review and edit the extracted data in the next step.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Sample CSV Download & Examples */}
      {uploadType === 'csv' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Not sure about the format?
            </span>
            <Button 
              variant="link" 
              size="sm" 
              className="h-auto p-0"
              onClick={() => window.open('/api/inventory/import/template', '_blank')}
            >
              <Download className="h-4 w-4 mr-1" />
              Download sample CSV template
            </Button>
          </div>
          
          {/* CSV Format Example */}
          <div className="bg-muted/50 rounded-lg p-3 text-xs font-mono">
            <p className="text-muted-foreground mb-2 font-sans text-sm font-medium">Example CSV format:</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="pr-4">name</th>
                    <th className="pr-4">sku</th>
                    <th className="pr-4">quantity</th>
                    <th className="pr-4">unit_price</th>
                    <th>category</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="pr-4">Wireless Earbuds</td>
                    <td className="pr-4 text-muted-foreground">(auto)</td>
                    <td className="pr-4">50</td>
                    <td className="pr-4">1499</td>
                    <td>Electronics</td>
                  </tr>
                  <tr>
                    <td className="pr-4">Cotton T-Shirt</td>
                    <td className="pr-4">CLT-001</td>
                    <td className="pr-4">100</td>
                    <td className="pr-4">499</td>
                    <td>Clothing</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-muted-foreground mt-2 font-sans text-xs">
              Tip: Leave SKU/Barcode blank to auto-generate in Step 3
            </p>
          </div>
        </div>
      )}

      {/* PDF/Image Examples */}
      {(uploadType === 'pdf' || uploadType === 'image') && (
        <div className="bg-muted/50 rounded-lg p-3 text-sm">
          <p className="font-medium mb-2">Supported invoice formats:</p>
          <ul className="text-muted-foreground space-y-1 text-xs">
            <li>• <span className="font-mono">2 x Widget @ Rs.100</span> - Quantity x Product @ Price</li>
            <li>• <span className="font-mono">Widget  50  1499</span> - Product  Qty  Price (table format)</li>
            <li>• <span className="font-mono">Widget - Rs.1499</span> - Product - Price (single item)</li>
          </ul>
          <p className="text-muted-foreground mt-2 text-xs">
            OCR will extract products automatically. Review and edit in Step 2.
          </p>
        </div>
      )}
    </div>
  )
}
