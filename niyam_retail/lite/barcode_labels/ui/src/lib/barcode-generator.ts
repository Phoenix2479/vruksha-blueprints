import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import type { BarcodeType } from '@/types/barcode'

export interface BarcodeOptions {
  type: BarcodeType
  value: string
  width?: number
  height?: number
  displayValue?: boolean
  fontSize?: number
  margin?: number
  background?: string
  lineColor?: string
}

export interface BarcodeResult {
  success: boolean
  svg?: string
  dataUrl?: string
  error?: string
}

// Validate barcode value based on type
export function validateBarcode(type: BarcodeType, value: string): { valid: boolean; error?: string } {
  if (!value || value.trim() === '') {
    return { valid: false, error: 'Barcode value is required' }
  }

  switch (type) {
    case 'ean13':
      if (!/^\d{12,13}$/.test(value)) {
        return { valid: false, error: 'EAN-13 requires 12-13 digits' }
      }
      if (value.length === 13 && !validateEAN13Checksum(value)) {
        return { valid: false, error: 'Invalid EAN-13 checksum' }
      }
      return { valid: true }

    case 'ean8':
      if (!/^\d{7,8}$/.test(value)) {
        return { valid: false, error: 'EAN-8 requires 7-8 digits' }
      }
      if (value.length === 8 && !validateEAN8Checksum(value)) {
        return { valid: false, error: 'Invalid EAN-8 checksum' }
      }
      return { valid: true }

    case 'upca':
      if (!/^\d{11,12}$/.test(value)) {
        return { valid: false, error: 'UPC-A requires 11-12 digits' }
      }
      if (value.length === 12 && !validateUPCAChecksum(value)) {
        return { valid: false, error: 'Invalid UPC-A checksum' }
      }
      return { valid: true }

    case 'code128':
      // Code128 accepts any ASCII characters
      if (value.length > 80) {
        return { valid: false, error: 'Code128 max length is 80 characters' }
      }
      return { valid: true }

    case 'qrcode':
      // QR code can encode up to ~4000 alphanumeric characters
      if (value.length > 4000) {
        return { valid: false, error: 'QR Code max length is 4000 characters' }
      }
      return { valid: true }

    default:
      return { valid: true }
  }
}

// Calculate EAN-13 checksum
function validateEAN13Checksum(code: string): boolean {
  const digits = code.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += digits[i] * (i % 2 === 0 ? 1 : 3)
  }
  const checksum = (10 - (sum % 10)) % 10
  return checksum === digits[12]
}

// Calculate EAN-8 checksum
function validateEAN8Checksum(code: string): boolean {
  const digits = code.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 7; i++) {
    sum += digits[i] * (i % 2 === 0 ? 3 : 1)
  }
  const checksum = (10 - (sum % 10)) % 10
  return checksum === digits[7]
}

// Calculate UPC-A checksum
function validateUPCAChecksum(code: string): boolean {
  const digits = code.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 11; i++) {
    sum += digits[i] * (i % 2 === 0 ? 3 : 1)
  }
  const checksum = (10 - (sum % 10)) % 10
  return checksum === digits[11]
}

// Calculate checksum for EAN-13
export function calculateEAN13Checksum(code: string): string {
  if (code.length !== 12) return code
  const digits = code.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += digits[i] * (i % 2 === 0 ? 1 : 3)
  }
  const checksum = (10 - (sum % 10)) % 10
  return code + checksum
}

// Generate barcode as SVG string
export async function generateBarcodeSVG(options: BarcodeOptions): Promise<BarcodeResult> {
  const { type, value, width = 2, height = 50, displayValue = true, fontSize = 12, margin = 5, background = '#ffffff', lineColor = '#000000' } = options

  // Validate first
  const validation = validateBarcode(type, value)
  if (!validation.valid) {
    return { success: false, error: validation.error }
  }

  try {
    if (type === 'qrcode') {
      // Generate QR code
      const svg = await QRCode.toString(value, {
        type: 'svg',
        width: Math.max(width * 20, height),
        margin: margin / 5,
        color: {
          dark: lineColor,
          light: background,
        },
      })
      return { success: true, svg }
    }

    // Generate 1D barcode using JsBarcode
    const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    
    const formatMap: Record<string, string> = {
      code128: 'CODE128',
      ean13: 'EAN13',
      ean8: 'EAN8',
      upca: 'UPC',
    }

    JsBarcode(svgElement, value, {
      format: formatMap[type] || 'CODE128',
      width,
      height,
      displayValue,
      fontSize,
      margin,
      background,
      lineColor,
      valid: () => true, // We already validated
    })

    const serializer = new XMLSerializer()
    const svg = serializer.serializeToString(svgElement)
    
    return { success: true, svg }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

// Generate barcode as Data URL (for canvas/images)
export async function generateBarcodeDataURL(options: BarcodeOptions): Promise<BarcodeResult> {
  const { type, value, width = 2, height = 50, margin = 5, background = '#ffffff', lineColor = '#000000' } = options

  const validation = validateBarcode(type, value)
  if (!validation.valid) {
    return { success: false, error: validation.error }
  }

  try {
    if (type === 'qrcode') {
      const dataUrl = await QRCode.toDataURL(value, {
        width: Math.max(width * 20, height),
        margin: margin / 5,
        color: {
          dark: lineColor,
          light: background,
        },
      })
      return { success: true, dataUrl }
    }

    // Generate 1D barcode
    const canvas = document.createElement('canvas')
    
    const formatMap: Record<string, string> = {
      code128: 'CODE128',
      ean13: 'EAN13',
      ean8: 'EAN8',
      upca: 'UPC',
    }

    JsBarcode(canvas, value, {
      format: formatMap[type] || 'CODE128',
      width,
      height,
      displayValue: false,
      margin,
      background,
      lineColor,
    })

    const dataUrl = canvas.toDataURL('image/png')
    return { success: true, dataUrl }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

// Generate barcode for Fabric.js canvas (returns image data)
export async function generateBarcodeForCanvas(
  type: BarcodeType,
  value: string,
  options?: Partial<BarcodeOptions>
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  const result = await generateBarcodeDataURL({
    type,
    value,
    width: options?.width || 2,
    height: options?.height || 50,
    margin: options?.margin || 2,
    background: options?.background || '#ffffff',
    lineColor: options?.lineColor || '#000000',
  })

  if (!result.success || !result.dataUrl) {
    console.error('Barcode generation failed:', result.error)
    return null
  }

  // Get actual dimensions
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      resolve({
        dataUrl: result.dataUrl!,
        width: img.width,
        height: img.height,
      })
    }
    img.onerror = () => resolve(null)
    img.src = result.dataUrl!
  })
}

// Generate sample barcode for preview
export function getSampleBarcodeValue(type: BarcodeType): string {
  switch (type) {
    case 'ean13':
      return '5901234123457'
    case 'ean8':
      return '96385074'
    case 'upca':
      return '012345678905'
    case 'qrcode':
      return 'https://example.com'
    case 'code128':
    default:
      return 'ABC-12345'
  }
}
