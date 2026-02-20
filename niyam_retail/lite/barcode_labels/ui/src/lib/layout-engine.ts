/**
 * Layout Engine - Smart layout suggestions and density checking
 * Provides auto-layout, density warnings, and safe zone snapping
 */

import type { LabelTemplate, LabelElement, LabelSize, BarcodeType } from '@/types/barcode'
import type { PrinterProfile } from './label-compiler'

// Minimum module width for reliable scanning (mm)
const MIN_MODULE_WIDTH = 0.25
const RECOMMENDED_MODULE_WIDTH = 0.33

// Module counts per character for different barcode types
const MODULE_COUNTS: Record<BarcodeType, { perChar: number; overhead: number }> = {
  code128: { perChar: 11, overhead: 35 }, // Start(11) + Stop(13) + Checksum(11) = 35
  ean13: { perChar: 7, overhead: 59 },    // Fixed 95 modules for 13 digits
  ean8: { perChar: 7, overhead: 45 },     // Fixed 67 modules for 8 digits
  upca: { perChar: 7, overhead: 59 },     // Fixed 95 modules for 12 digits
  qrcode: { perChar: 0, overhead: 0 }     // QR uses grid, not linear
}

// Density check result
export interface DensityCheckResult {
  ok: boolean
  moduleWidth: number // mm
  minRecommended: number
  actualModules: number
  suggestion?: string
  severity: 'success' | 'warning' | 'error'
}

// Layout suggestion
export interface LayoutSuggestion {
  element: LabelElement
  issue: string
  suggestedFix: Partial<LabelElement>
  autoFixable: boolean
}

// Safe zone (printable area accounting for margins)
export interface SafeZone {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

/**
 * Calculate module count for barcode data
 */
export function calculateModuleCount(data: string, type: BarcodeType): number {
  if (type === 'qrcode') {
    // QR code uses a grid, size depends on data and error correction
    const len = data.length
    if (len <= 25) return 21 * 21    // Version 1
    if (len <= 47) return 25 * 25    // Version 2
    if (len <= 77) return 29 * 29    // Version 3
    if (len <= 114) return 33 * 33   // Version 4
    return 37 * 37                    // Version 5+
  }

  const spec = MODULE_COUNTS[type] || MODULE_COUNTS.code128
  return (data.length * spec.perChar) + spec.overhead
}

/**
 * Check barcode density - can it be reliably scanned?
 */
export function checkBarcodeDensity(
  barcodeData: string,
  barcodeType: BarcodeType,
  widthMm: number
): DensityCheckResult {
  if (barcodeType === 'qrcode') {
    // QR codes use a grid, check cell size
    const gridSize = Math.sqrt(calculateModuleCount(barcodeData, 'qrcode'))
    const cellSize = widthMm / gridSize
    
    if (cellSize < 0.5) {
      return {
        ok: false,
        moduleWidth: cellSize,
        minRecommended: 0.5,
        actualModules: gridSize,
        suggestion: `QR Code cells too small (${cellSize.toFixed(2)}mm). Increase size to at least ${Math.ceil(gridSize * 0.5)}mm width, or reduce data.`,
        severity: 'error'
      }
    }
    
    if (cellSize < 0.75) {
      return {
        ok: true,
        moduleWidth: cellSize,
        minRecommended: 0.75,
        actualModules: gridSize,
        suggestion: `QR Code cells are small (${cellSize.toFixed(2)}mm). May have scanning issues on older readers.`,
        severity: 'warning'
      }
    }
    
    return {
      ok: true,
      moduleWidth: cellSize,
      minRecommended: 0.5,
      actualModules: gridSize,
      severity: 'success'
    }
  }

  // Linear barcodes
  const modules = calculateModuleCount(barcodeData, barcodeType)
  const moduleWidth = widthMm / modules

  if (moduleWidth < MIN_MODULE_WIDTH) {
    const minWidth = Math.ceil(modules * MIN_MODULE_WIDTH)
    return {
      ok: false,
      moduleWidth,
      minRecommended: MIN_MODULE_WIDTH,
      actualModules: modules,
      suggestion: `Barcode too dense (${moduleWidth.toFixed(2)}mm bars). Minimum width: ${minWidth}mm, or switch to QR Code.`,
      severity: 'error'
    }
  }

  if (moduleWidth < RECOMMENDED_MODULE_WIDTH) {
    const recWidth = Math.ceil(modules * RECOMMENDED_MODULE_WIDTH)
    return {
      ok: true,
      moduleWidth,
      minRecommended: RECOMMENDED_MODULE_WIDTH,
      actualModules: modules,
      suggestion: `Barcode is dense (${moduleWidth.toFixed(2)}mm bars). Recommend ${recWidth}mm width for reliable scanning.`,
      severity: 'warning'
    }
  }

  return {
    ok: true,
    moduleWidth,
    minRecommended: RECOMMENDED_MODULE_WIDTH,
    actualModules: modules,
    severity: 'success'
  }
}

/**
 * Calculate safe zone (printable area) for a printer profile
 */
export function calculateSafeZone(
  labelSize: LabelSize,
  profile?: PrinterProfile
): SafeZone {
  // Default margins (most thermal printers have ~2-3mm unprintable edge)
  const marginMm = 2

  // Adjust for printer offsets if profile provided
  const offsetX = profile ? (profile.offsetX / (profile.dpi / 25.4)) : 0
  const offsetY = profile ? (profile.offsetY / (profile.dpi / 25.4)) : 0

  return {
    left: marginMm + offsetX,
    top: marginMm + offsetY,
    right: labelSize.width - marginMm + offsetX,
    bottom: labelSize.height - marginMm + offsetY,
    width: labelSize.width - (marginMm * 2),
    height: labelSize.height - (marginMm * 2)
  }
}

/**
 * Snap element to safe zone (keep within printable area)
 */
export function snapToSafeZone(
  element: LabelElement,
  safeZone: SafeZone
): LabelElement {
  const snapped = { ...element }
  const width = element.width || 10
  const height = element.height || 5

  // Snap X
  if (snapped.x < safeZone.left) {
    snapped.x = safeZone.left
  }
  if (snapped.x + width > safeZone.right) {
    snapped.x = safeZone.right - width
  }

  // Snap Y
  if (snapped.y < safeZone.top) {
    snapped.y = safeZone.top
  }
  if (snapped.y + height > safeZone.bottom) {
    snapped.y = safeZone.bottom - height
  }

  return snapped
}

/**
 * Auto-space elements evenly (vertical distribution)
 */
export function autoSpaceElements(
  elements: LabelElement[],
  labelSize: LabelSize,
  direction: 'vertical' | 'horizontal' = 'vertical'
): LabelElement[] {
  if (elements.length < 2) return elements

  const enabled = elements.filter(e => e.enabled)
  if (enabled.length < 2) return elements

  const safeZone = calculateSafeZone(labelSize)
  const margin = 2 // mm between elements

  if (direction === 'vertical') {
    // Calculate total height of elements
    const totalHeight = enabled.reduce((sum, e) => sum + (e.height || 5), 0)
    const availableSpace = safeZone.height - totalHeight
    const gap = Math.max(margin, availableSpace / (enabled.length - 1))

    let currentY = safeZone.top
    return elements.map(element => {
      if (!element.enabled) return element
      
      const updated = { ...element, y: currentY }
      currentY += (element.height || 5) + gap
      return updated
    })
  } else {
    // Horizontal spacing
    const totalWidth = enabled.reduce((sum, e) => sum + (e.width || 10), 0)
    const availableSpace = safeZone.width - totalWidth
    const gap = Math.max(margin, availableSpace / (enabled.length - 1))

    let currentX = safeZone.left
    return elements.map(element => {
      if (!element.enabled) return element
      
      const updated = { ...element, x: currentX }
      currentX += (element.width || 10) + gap
      return updated
    })
  }
}

/**
 * Suggest optimal layout for elements
 */
export function suggestOptimalLayout(
  elements: LabelElement[],
  labelSize: LabelSize
): LayoutSuggestion[] {
  const suggestions: LayoutSuggestion[] = []
  const safeZone = calculateSafeZone(labelSize)

  for (const element of elements.filter(e => e.enabled)) {
    const width = element.width || 10
    const height = element.height || 5

    // Check if outside safe zone
    if (element.x < safeZone.left || element.x + width > safeZone.right) {
      suggestions.push({
        element,
        issue: 'Element extends beyond printable area (horizontal)',
        suggestedFix: { x: Math.max(safeZone.left, Math.min(element.x, safeZone.right - width)) },
        autoFixable: true
      })
    }

    if (element.y < safeZone.top || element.y + height > safeZone.bottom) {
      suggestions.push({
        element,
        issue: 'Element extends beyond printable area (vertical)',
        suggestedFix: { y: Math.max(safeZone.top, Math.min(element.y, safeZone.bottom - height)) },
        autoFixable: true
      })
    }

    // Check barcode density
    if (element.type === 'barcode' && element.width) {
      // Use placeholder data for density check
      const sampleData = 'SAMPLE123456789'
      const densityCheck = checkBarcodeDensity(sampleData, element.barcodeType || 'code128', element.width)
      
      if (!densityCheck.ok) {
        const minWidth = Math.ceil(densityCheck.actualModules * MIN_MODULE_WIDTH)
        suggestions.push({
          element,
          issue: densityCheck.suggestion || 'Barcode too dense',
          suggestedFix: { width: minWidth },
          autoFixable: true
        })
      }
    }

    // Check text size vs container
    if (element.type !== 'barcode' && element.font) {
      const fontSize = element.font.size || 12
      const textHeightMm = (fontSize / 72) * 25.4 // pt to mm

      if (textHeightMm > height) {
        suggestions.push({
          element,
          issue: `Font size (${fontSize}pt) exceeds element height`,
          suggestedFix: { font: { ...element.font, size: Math.floor((height / 25.4) * 72 * 0.8) } },
          autoFixable: true
        })
      }
    }
  }

  return suggestions
}

/**
 * Center element on label
 */
export function centerElement(
  element: LabelElement,
  labelSize: LabelSize,
  axis: 'horizontal' | 'vertical' | 'both' = 'both'
): LabelElement {
  const updated = { ...element }
  const width = element.width || 10
  const height = element.height || 5

  if (axis === 'horizontal' || axis === 'both') {
    updated.x = (labelSize.width - width) / 2
  }

  if (axis === 'vertical' || axis === 'both') {
    updated.y = (labelSize.height - height) / 2
  }

  return updated
}

/**
 * Align multiple elements
 */
export function alignElements(
  elements: LabelElement[],
  alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
): LabelElement[] {
  if (elements.length < 2) return elements

  const enabled = elements.filter(e => e.enabled)
  if (enabled.length < 2) return elements

  switch (alignment) {
    case 'left': {
      const minX = Math.min(...enabled.map(e => e.x))
      return elements.map(e => e.enabled ? { ...e, x: minX } : e)
    }
    case 'right': {
      const maxRight = Math.max(...enabled.map(e => e.x + (e.width || 10)))
      return elements.map(e => e.enabled ? { ...e, x: maxRight - (e.width || 10) } : e)
    }
    case 'center': {
      const avgX = enabled.reduce((sum, e) => sum + e.x + (e.width || 10) / 2, 0) / enabled.length
      return elements.map(e => e.enabled ? { ...e, x: avgX - (e.width || 10) / 2 } : e)
    }
    case 'top': {
      const minY = Math.min(...enabled.map(e => e.y))
      return elements.map(e => e.enabled ? { ...e, y: minY } : e)
    }
    case 'bottom': {
      const maxBottom = Math.max(...enabled.map(e => e.y + (e.height || 5)))
      return elements.map(e => e.enabled ? { ...e, y: maxBottom - (e.height || 5) } : e)
    }
    case 'middle': {
      const avgY = enabled.reduce((sum, e) => sum + e.y + (e.height || 5) / 2, 0) / enabled.length
      return elements.map(e => e.enabled ? { ...e, y: avgY - (e.height || 5) / 2 } : e)
    }
    default:
      return elements
  }
}

/**
 * Generate a suggested layout for a category
 */
export function generateCategoryLayout(
  category: string,
  labelSize: LabelSize
): LabelElement[] {
  const safeZone = calculateSafeZone(labelSize)
  const baseId = Date.now()

  const layouts: Record<string, LabelElement[]> = {
    product: [
      { id: `barcode-${baseId}`, type: 'barcode', enabled: true, order: 0, x: safeZone.left, y: safeZone.top, width: safeZone.width * 0.8, height: 15, barcodeType: 'code128' },
      { id: `name-${baseId}`, type: 'productName', enabled: true, order: 1, x: safeZone.left, y: safeZone.top + 18, font: { family: 'Arial', size: 10, bold: true, italic: false } },
      { id: `price-${baseId}`, type: 'price', enabled: true, order: 2, x: safeZone.right - 20, y: safeZone.bottom - 8, currencySymbol: '₹', font: { family: 'Arial', size: 14, bold: true, italic: false } },
    ],
    shelf: [
      { id: `name-${baseId}`, type: 'productName', enabled: true, order: 0, x: safeZone.left, y: safeZone.top, font: { family: 'Arial', size: 12, bold: true, italic: false } },
      { id: `price-${baseId}`, type: 'price', enabled: true, order: 1, x: safeZone.left, y: safeZone.top + 15, currencySymbol: '₹', font: { family: 'Arial', size: 24, bold: true, italic: false } },
      { id: `sku-${baseId}`, type: 'sku', enabled: true, order: 2, x: safeZone.left, y: safeZone.bottom - 6, prefix: 'SKU: ', font: { family: 'Arial', size: 8, bold: false, italic: false } },
    ],
    jewelry: [
      { id: `barcode-${baseId}`, type: 'barcode', enabled: true, order: 0, x: safeZone.left, y: safeZone.top, width: safeZone.width, height: 8, barcodeType: 'code128' },
      { id: `price-${baseId}`, type: 'price', enabled: true, order: 1, x: safeZone.left, y: safeZone.top + 10, currencySymbol: '₹', font: { family: 'Arial', size: 8, bold: true, italic: false } },
    ],
    shipping: [
      { id: `barcode-${baseId}`, type: 'barcode', enabled: true, order: 0, x: safeZone.left + 5, y: safeZone.top + 5, width: safeZone.width - 10, height: 25, barcodeType: 'code128' },
      { id: `name-${baseId}`, type: 'productName', enabled: true, order: 1, x: safeZone.left, y: safeZone.top + 35, font: { family: 'Arial', size: 14, bold: true, italic: false } },
      { id: `sku-${baseId}`, type: 'sku', enabled: true, order: 2, x: safeZone.left, y: safeZone.bottom - 10, font: { family: 'Arial', size: 10, bold: false, italic: false } },
    ],
    clothing: [
      { id: `barcode-${baseId}`, type: 'barcode', enabled: true, order: 0, x: safeZone.left, y: safeZone.top, width: safeZone.width, height: 20, barcodeType: 'code128' },
      { id: `name-${baseId}`, type: 'productName', enabled: true, order: 1, x: safeZone.left, y: safeZone.top + 25, font: { family: 'Arial', size: 11, bold: true, italic: false } },
      { id: `price-${baseId}`, type: 'price', enabled: true, order: 2, x: safeZone.left, y: safeZone.top + 40, currencySymbol: '₹', font: { family: 'Arial', size: 16, bold: true, italic: false } },
      { id: `mrp-${baseId}`, type: 'mrp', enabled: true, order: 3, x: safeZone.left, y: safeZone.top + 58, currencySymbol: '₹', prefix: 'MRP: ', font: { family: 'Arial', size: 10, bold: false, italic: false } },
    ],
  }

  return layouts[category] || layouts.product
}

export default {
  checkBarcodeDensity,
  calculateSafeZone,
  snapToSafeZone,
  autoSpaceElements,
  suggestOptimalLayout,
  centerElement,
  alignElements,
  generateCategoryLayout,
  calculateModuleCount
}
