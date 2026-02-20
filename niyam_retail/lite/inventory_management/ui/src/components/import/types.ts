export interface ParsedProduct {
  id: string
  name: string
  sku?: string
  barcode?: string
  quantity?: number
  unit_price?: number
  category?: string
  description?: string
  _source?: string
  _confidence?: number
  _errors?: string[]
}

export interface SKUConfig {
  enabled: boolean
  prefix: string
  separator: string
  digits: number
  includeCategory: boolean
  startNumber: number
}

export interface BarcodeConfig {
  enabled: boolean
  format: 'EAN13' | 'EAN8' | 'UPC' | 'CODE128' | 'CODE39'
  prefix: string
  startNumber: number
}

export const defaultSKUConfig: SKUConfig = {
  enabled: false,
  prefix: 'SKU',
  separator: '-',
  digits: 4,
  includeCategory: false,
  startNumber: 1,
}

export const defaultBarcodeConfig: BarcodeConfig = {
  enabled: false,
  format: 'EAN13',
  prefix: '200',
  startNumber: 1,
}
