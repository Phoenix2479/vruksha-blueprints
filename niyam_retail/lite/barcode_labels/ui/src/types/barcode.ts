// Label element types supported by backend
export type LabelElementType = 
  | 'barcode' 
  | 'productName' 
  | 'price' 
  | 'mrp' 
  | 'sku' 
  | 'batchNo' 
  | 'expiryDate' 
  | 'weight' 
  | 'customText'

// Barcode types supported
export type BarcodeType = 'code128' | 'ean13' | 'ean8' | 'upca' | 'qrcode'

// Font configuration
export interface FontConfig {
  family: string
  size: number
  bold: boolean
  italic: boolean
}

// Label element with all backend fields
export interface LabelElement {
  id: string
  type: LabelElementType
  enabled: boolean
  order: number
  x: number
  y: number
  width?: number
  height?: number
  value?: string
  font?: FontConfig
  barcodeType?: BarcodeType
  currencySymbol?: string
  prefix?: string
  suffix?: string
}

// Label size configuration
export interface LabelSize {
  id: string
  name: string
  width: number
  height: number
  isCustom?: boolean
}

// Template categories
export type TemplateCategory = 'general' | 'product' | 'shelf' | 'shipping' | 'jewelry' | 'clothing'

export const TEMPLATE_CATEGORIES: { value: TemplateCategory; label: string; icon: string }[] = [
  { value: 'general', label: 'General', icon: 'Tag' },
  { value: 'product', label: 'Product', icon: 'Package' },
  { value: 'shelf', label: 'Shelf Tag', icon: 'LayoutGrid' },
  { value: 'shipping', label: 'Shipping', icon: 'Truck' },
  { value: 'jewelry', label: 'Jewelry', icon: 'Gem' },
  { value: 'clothing', label: 'Clothing', icon: 'Shirt' },
]

// Full label template
export interface LabelTemplate {
  id: string
  name: string
  description?: string
  category?: TemplateCategory
  size: LabelSize
  elements: LabelElement[]
  backgroundSvg?: string
  isFavorite?: boolean
  usageCount?: number
  createdAt: string
  updatedAt: string
}

// Template export format
export interface TemplateExport {
  version: string
  exportedAt: string
  template: {
    name: string
    description?: string
    category?: TemplateCategory
    size: LabelSize
    elements: LabelElement[]
    backgroundSvg?: string
  }
}

// Product from backend
export interface Product {
  id: string
  sku: string
  name: string
  price: number
  mrp: number
  barcode?: string
  batchNo?: string
  expiryDate?: string
  weight?: string
  category?: string
}

// Print job status
export type PrintJobStatus = 'pending' | 'printing' | 'completed' | 'failed'

// Print job
export interface PrintJob {
  id: string
  templateId: string
  templateName: string
  productIds: string[]
  copiesPerProduct: number
  totalLabels: number
  status: PrintJobStatus
  errorMessage?: string
  createdAt: string
  completedAt?: string
}

// Statistics
export interface PrintStats {
  templates: number
  totalJobs: number
  totalLabels: number
  todayJobs: number
  todayLabels: number
  weekJobs: number
  completedJobs: number
  failedJobs: number
  topTemplates: { id: string; name: string; usageCount: number }[]
}

export type TabId = 'templates' | 'products' | 'history'

// Predefined label sizes
export const PREDEFINED_LABEL_SIZES: LabelSize[] = [
  { id: 'small', name: 'Small (38×25mm)', width: 38, height: 25 },
  { id: 'medium', name: 'Medium (50×30mm)', width: 50, height: 30 },
  { id: 'large', name: 'Large (70×40mm)', width: 70, height: 40 },
  { id: 'shelf', name: 'Shelf Tag (60×40mm)', width: 60, height: 40 },
  { id: 'jewelry', name: 'Jewelry (22×10mm)', width: 22, height: 10 },
  { id: 'clothing', name: 'Clothing (50×80mm)', width: 50, height: 80 },
  { id: 'a7', name: 'A7 (74×105mm)', width: 74, height: 105 },
  { id: 'a8', name: 'A8 (52×74mm)', width: 52, height: 74 },
  { id: '2x1inch', name: '2×1 inch (51×25mm)', width: 51, height: 25 },
  { id: '3x2inch', name: '3×2 inch (76×51mm)', width: 76, height: 51 },
  { id: 'custom', name: 'Custom Size', width: 50, height: 30, isCustom: true },
]

// Barcode type options
export const BARCODE_TYPES: { value: BarcodeType; label: string; description: string }[] = [
  { value: 'code128', label: 'Code 128', description: 'Alphanumeric, high density' },
  { value: 'ean13', label: 'EAN-13', description: 'European retail (13 digits)' },
  { value: 'ean8', label: 'EAN-8', description: 'Compact retail (8 digits)' },
  { value: 'upca', label: 'UPC-A', description: 'US retail (12 digits)' },
  { value: 'qrcode', label: 'QR Code', description: '2D code, stores more data' },
]

// Element type display info
export const ELEMENT_TYPE_INFO: Record<LabelElementType, { label: string; icon: string; description: string }> = {
  barcode: { label: 'Barcode', icon: 'Barcode', description: 'Product barcode or QR code' },
  productName: { label: 'Product Name', icon: 'Type', description: 'Product name text' },
  price: { label: 'Price', icon: 'IndianRupee', description: 'Selling price with currency' },
  mrp: { label: 'MRP', icon: 'Tag', description: 'Maximum retail price' },
  sku: { label: 'SKU', icon: 'Hash', description: 'Stock keeping unit code' },
  batchNo: { label: 'Batch No.', icon: 'Package', description: 'Batch/lot number' },
  expiryDate: { label: 'Expiry Date', icon: 'Calendar', description: 'Product expiration date' },
  weight: { label: 'Weight', icon: 'Scale', description: 'Product weight/quantity' },
  customText: { label: 'Custom Text', icon: 'TextCursor', description: 'Custom text field' },
}

// Font families available
export const FONT_FAMILIES = [
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Georgia',
  'Roboto',
  'Open Sans',
]

// Default font config
export const DEFAULT_FONT: FontConfig = {
  family: 'Arial',
  size: 12,
  bold: false,
  italic: false,
}

// Create default element for a type
export function createDefaultElement(type: LabelElementType, order: number): LabelElement {
  const base: LabelElement = {
    id: `${type}-${Date.now()}`,
    type,
    enabled: true,
    order,
    x: 5,
    y: 5 + order * 15,
    font: { ...DEFAULT_FONT },
  }

  switch (type) {
    case 'barcode':
      return { ...base, width: 40, height: 15, barcodeType: 'code128' }
    case 'price':
      return { ...base, currencySymbol: '₹', font: { ...DEFAULT_FONT, size: 14, bold: true } }
    case 'mrp':
      return { ...base, currencySymbol: '₹', prefix: 'MRP: ' }
    case 'productName':
      return { ...base, font: { ...DEFAULT_FONT, size: 11, bold: true } }
    case 'sku':
      return { ...base, prefix: 'SKU: ', font: { ...DEFAULT_FONT, size: 9 } }
    case 'batchNo':
      return { ...base, prefix: 'Batch: ', font: { ...DEFAULT_FONT, size: 9 } }
    case 'expiryDate':
      return { ...base, prefix: 'Exp: ', font: { ...DEFAULT_FONT, size: 9 } }
    case 'weight':
      return { ...base, suffix: ' kg', font: { ...DEFAULT_FONT, size: 10 } }
    case 'customText':
      return { ...base, value: 'Custom Text' }
    default:
      return base
  }
}
