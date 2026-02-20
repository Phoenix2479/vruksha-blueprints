import * as fabric from 'fabric'
import type { LabelElement, LabelSize, Product } from '@/types/barcode'
import { generateBarcodeForCanvas } from './barcode-generator'

// Convert mm to pixels (at 96 DPI)
export const MM_TO_PX = 3.7795275591
export const PX_TO_MM = 1 / MM_TO_PX

export function mmToPx(mm: number): number {
  return mm * MM_TO_PX
}

export function pxToMm(px: number): number {
  return px * PX_TO_MM
}

// Canvas configuration
export interface CanvasConfig {
  gridSize: number // in mm
  gridEnabled: boolean
  snapToGrid: boolean
  showRulers: boolean
  zoom: number
  backgroundColor: string
}

export const DEFAULT_CANVAS_CONFIG: CanvasConfig = {
  gridSize: 5,
  gridEnabled: true,
  snapToGrid: true,
  showRulers: true,
  zoom: 1,
  backgroundColor: '#ffffff',
}

// Create grid pattern for canvas background
export function createGridPattern(gridSizeMm: number, zoom: number): string {
  const gridSizePx = mmToPx(gridSizeMm) * zoom
  const svg = `
    <svg width="${gridSizePx}" height="${gridSizePx}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="grid" width="${gridSizePx}" height="${gridSizePx}" patternUnits="userSpaceOnUse">
          <path d="M ${gridSizePx} 0 L 0 0 0 ${gridSizePx}" fill="none" stroke="#e5e7eb" stroke-width="0.5"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
    </svg>
  `
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

// Snap position to grid
export function snapToGrid(value: number, gridSize: number, enabled: boolean): number {
  if (!enabled) return value
  return Math.round(value / gridSize) * gridSize
}

// Undo/Redo Manager
export class UndoRedoManager {
  private history: string[] = []
  private currentIndex = -1
  private maxHistory = 50

  save(state: string): void {
    // Remove any future states if we're not at the end
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1)
    }
    
    this.history.push(state)
    
    // Limit history size
    if (this.history.length > this.maxHistory) {
      this.history.shift()
    } else {
      this.currentIndex++
    }
  }

  undo(): string | null {
    if (this.currentIndex > 0) {
      this.currentIndex--
      return this.history[this.currentIndex]
    }
    return null
  }

  redo(): string | null {
    if (this.currentIndex < this.history.length - 1) {
      this.currentIndex++
      return this.history[this.currentIndex]
    }
    return null
  }

  canUndo(): boolean {
    return this.currentIndex > 0
  }

  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1
  }

  clear(): void {
    this.history = []
    this.currentIndex = -1
  }
}

// Element ID generator
let elementCounter = 0
export function generateElementId(type: string): string {
  elementCounter++
  return `${type}-${Date.now()}-${elementCounter}`
}

// Convert LabelElement to Fabric.js object
export async function elementToFabricObject(
  element: LabelElement,
  product: Product | null,
  zoom: number
): Promise<fabric.FabricObject | null> {
  const x = mmToPx(element.x) * zoom
  const y = mmToPx(element.y) * zoom

  // Get the actual value to display
  const getValue = (): string => {
    if (!product) {
      // Preview mode - show placeholder
      switch (element.type) {
        case 'productName': return 'Product Name'
        case 'price': return `${element.currencySymbol || '₹'}99.00`
        case 'mrp': return `${element.currencySymbol || '₹'}120.00`
        case 'sku': return 'SKU001'
        case 'batchNo': return 'BATCH001'
        case 'expiryDate': return '31/12/2026'
        case 'weight': return '500g'
        case 'barcode': return '1234567890123'
        case 'customText': return element.value || 'Custom Text'
        default: return ''
      }
    }

    switch (element.type) {
      case 'productName': return product.name
      case 'price': return `${element.currencySymbol || '₹'}${product.price.toFixed(2)}`
      case 'mrp': return `${element.currencySymbol || '₹'}${product.mrp.toFixed(2)}`
      case 'sku': return product.sku
      case 'batchNo': return product.batchNo || ''
      case 'expiryDate': return product.expiryDate ? new Date(product.expiryDate).toLocaleDateString() : ''
      case 'weight': return product.weight || ''
      case 'barcode': return product.barcode || product.sku
      case 'customText': return element.value || ''
      default: return ''
    }
  }

  const value = getValue()
  const prefix = element.prefix || ''
  const suffix = element.suffix || ''
  const displayText = `${prefix}${value}${suffix}`

  if (element.type === 'barcode') {
    // Generate actual barcode image
    const barcodeData = await generateBarcodeForCanvas(
      element.barcodeType || 'code128',
      value,
      {
        width: 2,
        height: mmToPx(element.height || 15) * zoom,
      }
    )

    if (barcodeData) {
      return new Promise((resolve) => {
        fabric.FabricImage.fromURL(barcodeData.dataUrl).then((img) => {
          img.set({
            left: x,
            top: y,
            scaleX: (mmToPx(element.width || 40) * zoom) / barcodeData.width,
            scaleY: (mmToPx(element.height || 15) * zoom) / barcodeData.height,
            selectable: true,
            hasControls: true,
            data: { elementId: element.id, type: element.type },
          })
          resolve(img)
        }).catch(() => resolve(null))
      })
    }
    return null
  }

  // Text elements
  const fontSize = (element.font?.size || 12) * zoom
  const textObj = new fabric.FabricText(displayText, {
    left: x,
    top: y,
    fontSize,
    fontFamily: element.font?.family || 'Arial',
    fontWeight: element.font?.bold ? 'bold' : 'normal',
    fontStyle: element.font?.italic ? 'italic' : 'normal',
    fill: '#000000',
    selectable: true,
    hasControls: true,
    data: { elementId: element.id, type: element.type },
  })

  // Strike-through for MRP
  if (element.type === 'mrp') {
    textObj.set({ linethrough: true, fill: '#666666' })
  }

  return textObj
}

// Convert Fabric.js object back to LabelElement position
export function fabricObjectToPosition(
  obj: fabric.FabricObject,
  zoom: number
): { x: number; y: number; width?: number; height?: number } {
  return {
    x: pxToMm((obj.left || 0) / zoom),
    y: pxToMm((obj.top || 0) / zoom),
    width: obj.width ? pxToMm((obj.width * (obj.scaleX || 1)) / zoom) : undefined,
    height: obj.height ? pxToMm((obj.height * (obj.scaleY || 1)) / zoom) : undefined,
  }
}

// Create label background/border
export function createLabelBackground(labelSize: LabelSize, zoom: number): fabric.Rect {
  const width = mmToPx(labelSize.width) * zoom
  const height = mmToPx(labelSize.height) * zoom

  return new fabric.Rect({
    left: 0,
    top: 0,
    width,
    height,
    fill: '#ffffff',
    stroke: '#000000',
    strokeWidth: 1,
    selectable: false,
    evented: false,
    data: { type: 'background' },
  })
}

// Keyboard shortcut handler
export interface KeyboardShortcuts {
  onDelete: () => void
  onCopy: () => void
  onPaste: () => void
  onUndo: () => void
  onRedo: () => void
  onSelectAll: () => void
  onDeselect: () => void
}

export function handleKeyboardShortcut(
  e: KeyboardEvent,
  shortcuts: KeyboardShortcuts
): boolean {
  const isCtrlOrCmd = e.ctrlKey || e.metaKey

  if (e.key === 'Delete' || e.key === 'Backspace') {
    shortcuts.onDelete()
    return true
  }

  if (isCtrlOrCmd) {
    switch (e.key.toLowerCase()) {
      case 'c':
        shortcuts.onCopy()
        return true
      case 'v':
        shortcuts.onPaste()
        return true
      case 'z':
        if (e.shiftKey) {
          shortcuts.onRedo()
        } else {
          shortcuts.onUndo()
        }
        return true
      case 'y':
        shortcuts.onRedo()
        return true
      case 'a':
        shortcuts.onSelectAll()
        return true
      case 'd':
        shortcuts.onDeselect()
        return true
    }
  }

  if (e.key === 'Escape') {
    shortcuts.onDeselect()
    return true
  }

  return false
}

// Zoom levels
export const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

export function getNextZoomLevel(current: number, direction: 'in' | 'out'): number {
  const currentIndex = ZOOM_LEVELS.findIndex(z => z >= current)
  
  if (direction === 'in') {
    const nextIndex = Math.min(currentIndex + 1, ZOOM_LEVELS.length - 1)
    return ZOOM_LEVELS[nextIndex]
  } else {
    const prevIndex = Math.max(currentIndex - 1, 0)
    return ZOOM_LEVELS[prevIndex]
  }
}
